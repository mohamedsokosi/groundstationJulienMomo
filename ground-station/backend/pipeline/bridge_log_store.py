"""In-memory ring buffer of operator-facing alert lines.

Originally the store for log lines forwarded by the Pi-side UART→MQTT bridge
(topic `icarus2/bridge/log`), it is now the single **operator alert feed**: the
backend's own subsystems (broker connection, Sheets sync, CSV logger, frame
decoding) push their failures/recoveries here too via `alert()`. The frontend
errors terminal polls it with `GET /api/bridge/logs?after=<id>` and renders each
entry as `[source] message`. Completely independent of the telemetry deque — it
is a small diagnostic feed, not data.
"""

import threading
import time
from collections import deque

from common.logger import logger

_DEFAULT_MAXLEN = 500
# Consecutive identical lines within this window are suppressed, so the bridge's
# 3 s serial-reconnect loop ("RFD not plugged in") doesn't flood the terminal. The
# same line is still re-shown at most once per window so a persistent outage
# keeps reminding the operator (and a fresh disconnect after recovery shows).
_DEDUP_WINDOW_SEC = 60.0

_lock = threading.Lock()
_logs: deque = deque(maxlen=_DEFAULT_MAXLEN)
_next_id = 1


def configure_maxlen(maxlen: int) -> None:
    global _logs
    with _lock:
        _logs = deque(_logs, maxlen=max(1, maxlen))


def add_log(level: str, source: str, message: str) -> dict | None:
    """Append one entry, stamped with a monotonic id and the server receive time
    (server time avoids confusing the terminal when the Pi clock is skewed).

    Returns the new entry, or None if it was suppressed as a consecutive
    duplicate within `_DEDUP_WINDOW_SEC` (lets the caller skip re-logging too)."""
    global _next_id
    with _lock:
        now = time.time()
        if _logs:
            last = _logs[-1]
            if (
                last["level"] == level
                and last["source"] == source
                and last["message"] == message
                and now - last["ts"] < _DEDUP_WINDOW_SEC
            ):
                return None
        entry = {
            "id": _next_id,
            "ts": now,
            "level": level,
            "source": source,
            "message": message,
        }
        _next_id += 1
        _logs.append(entry)
        return entry


def alert(level: str, source: str, message: str) -> None:
    """Operator-facing alert: shows up in the frontend errors terminal AND the
    backend log (`gss debug`). Deduped by `add_log` (once per 60 s window for an
    identical consecutive line), so callers can fire it from retry loops without
    flooding either surface. Never raises — alerting must not break the caller.
    """
    try:
        entry = add_log(level.upper(), source, message)
        if entry is None:
            return  # suppressed duplicate — skip the log mirror too
        if entry["level"].startswith("WARN"):
            logger.warning("[%s] %s", source, message)
        elif entry["level"] == "INFO":
            logger.info("[%s] %s", source, message)
        else:
            logger.error("[%s] %s", source, message)
    except Exception:
        pass


def get_logs(after_id: int = 0) -> list[dict]:
    with _lock:
        return [e for e in _logs if e["id"] > after_id]


def clear() -> None:
    with _lock:
        _logs.clear()
