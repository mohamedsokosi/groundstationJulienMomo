import json
import os
import re
import threading
import time

from common.logger import logger
from pipeline import (
    bridge_log_store,
    telemetry_csv_logger,
    telemetry_sheets_sync,
    telemetry_store,
)
from server.telemetry_protobuf import decode_telemetry_frame

DEFAULT_MQTT_TOPIC = "icarus2/telemetry/frame.pb"
DEFAULT_BRIDGE_LOG_TOPIC = "icarus2/bridge/log"
DEFAULT_RECONNECT_DELAY_SECONDS = 3
DEFAULT_FRAME_TIMEOUT_SECONDS = 3

_receiver_lock = threading.Lock()
_receiver_thread: threading.Thread | None = None
_watchdog_thread: threading.Thread | None = None

# Set by on_message on every frame; read by the watchdog to detect a stall.
_last_frame_at: float | None = None
_outage_active = False
# Whether the MQTT client is currently connected to the broker (the Pi). Read by
# the /api/status endpoint so the operator can tell a broker/Pi problem apart from
# a merely-idle link.
_broker_connected = False
# True once a broker connection has been lost/failed, so the next successful
# connect can announce the recovery to the operator (a first connect is silent).
_broker_was_down = False

# Undecodable frames (corruption on the RF link, foreign publisher on the topic…)
# can arrive in storms — alert the operator at most once per window, with a count,
# instead of one line per bad frame.
_BAD_FRAME_ALERT_WINDOW_SEC = 10.0
_bad_frames = {"count": 0, "last_alert": 0.0}


def _alert_bad_frame(payload_size: int, exc: Exception) -> None:
    _bad_frames["count"] += 1
    now = time.time()
    if now - _bad_frames["last_alert"] < _BAD_FRAME_ALERT_WINDOW_SEC:
        return
    count, _bad_frames["count"] = _bad_frames["count"], 0
    _bad_frames["last_alert"] = now
    plural = "s" if count > 1 else ""
    bridge_log_store.alert(
        "ERROR", "backend",
        f"[BAD_FRAME] {count} undecodable telemetry frame{plural} received "
        f"(last: {payload_size} bytes, {exc}) - corrupted link? Frames are skipped, "
        "the station keeps running",
    )


def get_broker_connected() -> bool:
    return _broker_connected


def get_last_frame_age() -> float | None:
    """Seconds since the last telemetry frame, or None if none received yet."""
    if _last_frame_at is None:
        return None
    return time.time() - _last_frame_at


def get_last_bridge_message() -> dict | None:
    logs = bridge_log_store.get_logs(0)
    return logs[-1] if logs else None


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def is_mqtt_enabled() -> bool:
    return os.getenv("MQTT_TELEMETRY_ENABLED", "0") == "1"


def get_mqtt_config() -> dict:
    qos = min(max(_env_int("MQTT_TELEMETRY_QOS", 1), 0), 2)
    return {
        "enabled": is_mqtt_enabled(),
        "broker_host": os.getenv("MQTT_BROKER_HOST", "localhost"),
        "broker_port": _env_int("MQTT_BROKER_PORT", 1883),
        "topic": os.getenv("MQTT_TELEMETRY_TOPIC", DEFAULT_MQTT_TOPIC),
        "bridge_log_topic": os.getenv("MQTT_BRIDGE_LOG_TOPIC", DEFAULT_BRIDGE_LOG_TOPIC),
        "bridge_log_maxlen": max(1, _env_int("MQTT_BRIDGE_LOG_MAXLEN", 500)),
        "qos": qos,
        "store_maxlen": max(1, _env_int("MQTT_TELEMETRY_STORE_MAXLEN", 5000)),
    }


_RFD_PORT_RE = re.compile(r"/dev/\S+?(?=[:'\s]|$)")


def _humanize_bridge_message(message: str) -> str:
    """Rewrite the bridge's raw serial-open failure into a clear operator message.

    When the RFD's USB-serial adapter is unplugged, the bridge prints
    `Serial error: … could not open port /dev/ttyUSB0: No such file …` every 3 s.
    Surface that as a plain "RFD not plugged in" line instead (the device path is
    kept for context). Other messages pass through unchanged."""
    low = message.lower()
    if "could not open port" in low or "no such file" in low:
        match = _RFD_PORT_RE.search(message)
        port = match.group(0) if match else "serial port"
        return f"[RFD_DISCONNECTED] RFD not plugged into the Pi ({port} not found)"
    return message


def _handle_bridge_log(payload: bytes) -> None:
    """Store one log line forwarded by the Pi bridge (icarus2/bridge/log).

    Accepts the bridge's JSON shape (`{ts, level, source, msg}`) but falls back
    to treating the whole payload as raw error text, so a hand-published plain
    string still surfaces. Also mirrored to the backend log as a WARNING so the
    Pi's errors show up in `gss debug`, not only the frontend terminal."""
    raw = payload.decode("utf-8", errors="replace").strip()
    if not raw:
        return
    level, source, message = "ERROR", "gs-modem", raw
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            level = str(data.get("level", level)).upper()
            source = str(data.get("source", source))
            message = str(data.get("msg", data.get("message", raw)))
    except (ValueError, TypeError):
        pass
    message = _humanize_bridge_message(message[:1000])
    # add_log returns None for a suppressed duplicate — skip re-logging the spam.
    if bridge_log_store.add_log(level, source, message) is not None:
        logger.warning("[BRIDGE:%s] %s", source, message)


def _run_receiver(config: dict) -> None:
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        logger.error("MQTT telemetry receiver requires paho-mqtt. Install it with pip.")
        return

    telemetry_store.configure_maxlen(config["store_maxlen"])
    bridge_log_store.configure_maxlen(config["bridge_log_maxlen"])

    def on_connect(client, userdata, flags, reason_code, properties):
        global _broker_connected, _broker_was_down
        is_success = reason_code == 0 or getattr(reason_code, "value", None) == 0
        if is_success or str(reason_code).lower() == "success":
            _broker_connected = True
            logger.info(
                "MQTT telemetry receiver connected to %s:%s; subscribing to %s and %s",
                config["broker_host"],
                config["broker_port"],
                config["topic"],
                config["bridge_log_topic"],
            )
            # Announce a RECOVERY (not the first connect) in the errors terminal,
            # so a broker/Pi restart shows a clear "fixed" line to the operator.
            if _broker_was_down:
                _broker_was_down = False
                bridge_log_store.alert(
                    "INFO", "backend",
                    f"[BROKER] reconnected to {config['broker_host']}:{config['broker_port']} - "
                    "subscriptions restored",
                )
            client.subscribe(config["topic"], qos=config["qos"])
            client.subscribe(config["bridge_log_topic"], qos=config["qos"])
            return

        _broker_connected = False
        _broker_was_down = True
        bridge_log_store.alert(
            "ERROR", "backend",
            f"[BROKER] connection to {config['broker_host']}:{config['broker_port']} "
            f"refused ({reason_code}) - retrying automatically",
        )

    def on_disconnect(client, userdata, disconnect_flags, reason_code, properties):
        global _broker_connected, _broker_was_down
        _broker_connected = False
        _broker_was_down = True
        # paho's loop_forever reconnects on its own - tell the operator both facts.
        bridge_log_store.alert(
            "WARN", "backend",
            f"[BROKER] lost connection to {config['broker_host']}:{config['broker_port']} "
            f"({reason_code}) - Pi rebooting or network drop? Reconnecting automatically",
        )

    def on_message(client, userdata, message):
        global _last_frame_at, _outage_active
        if message.topic == config["bridge_log_topic"]:
            _handle_bridge_log(message.payload)
            return
        try:
            frame = decode_telemetry_frame(message.payload)
            telemetry_store.add_frame(frame)
            telemetry_csv_logger.append_frame(frame)
            telemetry_sheets_sync.enqueue_frame(frame)
            _last_frame_at = time.time()
            if _outage_active:
                _outage_active = False
                logger.info("[TELEMETRY_RESUMED] telemetry received again")
            logger.debug(
                "MQTT telemetry frame stored: sequence=%s altitude=%.2f speed=%.2f count=%s",
                frame["sequence_number"],
                frame["altitude_m"],
                frame["speed_mps"],
                telemetry_store.get_count(),
            )
        except Exception as exc:
            logger.error("Failed to decode MQTT telemetry payload: %s", exc)
            # Also surface it in the frontend errors terminal (throttled) - a
            # corrupted frame must never be silent for the operator.
            _alert_bad_frame(len(message.payload), exc)

    reconnect_delay = DEFAULT_RECONNECT_DELAY_SECONDS

    while True:
        global _broker_connected, _broker_was_down
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = on_message

        try:
            client.connect(config["broker_host"], config["broker_port"], keepalive=60)
            client.loop_forever()
        except Exception as exc:
            _broker_connected = False
            _broker_was_down = True
            # alert() dedups (1 line / 60 s) so this 3 s retry loop doesn't flood
            # the errors terminal or `gss debug` while the broker stays down.
            bridge_log_store.alert(
                "ERROR", "backend",
                f"[BROKER] cannot reach {config['broker_host']}:{config['broker_port']} "
                f"({exc}) - Pi off or wrong IP? Retrying every {reconnect_delay}s",
            )
            time.sleep(reconnect_delay)
        finally:
            _broker_connected = False
            try:
                client.disconnect()
            except Exception:
                pass


def _run_frame_watchdog(timeout_seconds: int) -> None:
    """Logs [RPI_DISCONNECTED] (WARNING) when no frame has arrived for
    `timeout_seconds`, so the stall shows up in the backend log / `gss debug`.
    Mirrors the frontend's outage detection but from the server side. Only fires
    after the first frame — a never-yet-connected start is not an "outage"."""
    global _outage_active
    while True:
        time.sleep(1)
        if _last_frame_at is None:
            continue
        elapsed = time.time() - _last_frame_at
        if elapsed > timeout_seconds and not _outage_active:
            _outage_active = True
            logger.warning(
                "[RPI_DISCONNECTED] telemetry not received (no frame for %.0fs)",
                elapsed,
            )


def start_mqtt_receiver_in_background() -> None:
    global _receiver_thread, _watchdog_thread

    if not is_mqtt_enabled():
        logger.info("MQTT telemetry receiver disabled")
        return

    with _receiver_lock:
        if _receiver_thread and _receiver_thread.is_alive():
            logger.info("MQTT telemetry receiver already running")
            return

        config = get_mqtt_config()
        logger.info(
            "MQTT telemetry receiver starting... broker=%s:%s topic=%s qos=%s",
            config["broker_host"],
            config["broker_port"],
            config["topic"],
            config["qos"],
        )
        _receiver_thread = threading.Thread(
            target=_run_receiver,
            args=(config,),
            name="MQTT Telemetry Receiver",
            daemon=True,
        )
        _receiver_thread.start()

        if _watchdog_thread is None or not _watchdog_thread.is_alive():
            timeout = max(1, _env_int("MQTT_FRAME_TIMEOUT_SEC", DEFAULT_FRAME_TIMEOUT_SECONDS))
            _watchdog_thread = threading.Thread(
                target=_run_frame_watchdog,
                args=(timeout,),
                name="MQTT Frame Watchdog",
                daemon=True,
            )
            _watchdog_thread.start()
