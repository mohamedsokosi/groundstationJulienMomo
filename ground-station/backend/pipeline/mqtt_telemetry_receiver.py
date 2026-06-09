import os
import threading
import time

from common.logger import logger
from pipeline import telemetry_csv_logger, telemetry_sheets_sync, telemetry_store
from server.telemetry_protobuf import decode_telemetry_frame

DEFAULT_MQTT_TOPIC = "icarus2/telemetry/frame.pb"
DEFAULT_RECONNECT_DELAY_SECONDS = 3

_receiver_lock = threading.Lock()
_receiver_thread: threading.Thread | None = None


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
        "qos": qos,
        "store_maxlen": max(1, _env_int("MQTT_TELEMETRY_STORE_MAXLEN", 5000)),
    }


def _run_receiver(config: dict) -> None:
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        logger.error("MQTT telemetry receiver requires paho-mqtt. Install it with pip.")
        return

    telemetry_store.configure_maxlen(config["store_maxlen"])

    def on_connect(client, userdata, flags, reason_code, properties):
        is_success = reason_code == 0 or getattr(reason_code, "value", None) == 0
        if is_success or str(reason_code).lower() == "success":
            logger.info(
                "MQTT telemetry receiver connected to %s:%s; subscribing to %s",
                config["broker_host"],
                config["broker_port"],
                config["topic"],
            )
            client.subscribe(config["topic"], qos=config["qos"])
            return

        logger.error("MQTT telemetry receiver connection failed: %s", reason_code)

    def on_message(client, userdata, message):
        try:
            frame = decode_telemetry_frame(message.payload)
            telemetry_store.add_frame(frame)
            telemetry_csv_logger.append_frame(frame)
            telemetry_sheets_sync.enqueue_frame(frame)
            logger.debug(
                "MQTT telemetry frame stored: sequence=%s altitude=%.2f speed=%.2f count=%s",
                frame["sequence_number"],
                frame["altitude_m"],
                frame["speed_mps"],
                telemetry_store.get_count(),
            )
        except Exception as exc:
            logger.error("Failed to decode MQTT telemetry payload: %s", exc)

    reconnect_delay = DEFAULT_RECONNECT_DELAY_SECONDS

    while True:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.on_connect = on_connect
        client.on_message = on_message

        try:
            client.connect(config["broker_host"], config["broker_port"], keepalive=60)
            client.loop_forever()
        except Exception as exc:
            logger.error(
                "MQTT telemetry receiver connection to %s:%s failed: %s; retrying in %ss",
                config["broker_host"],
                config["broker_port"],
                exc,
                reconnect_delay,
            )
            time.sleep(reconnect_delay)
        finally:
            try:
                client.disconnect()
            except Exception:
                pass


def start_mqtt_receiver_in_background() -> None:
    global _receiver_thread

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
