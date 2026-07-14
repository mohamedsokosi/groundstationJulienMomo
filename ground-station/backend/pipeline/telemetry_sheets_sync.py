"""Pushes received MQTT telemetry frames to a Google Sheet via an Apps Script
Web App.

Frames are buffered and flushed in batches (one HTTP POST every
``SHEETS_SYNC_INTERVAL_SEC``) to stay well under Apps Script quotas and to avoid
one request per frame. The Web App's ``doPost`` appends the rows to the sheet —
see Documentation.md › "Sync Google Sheet en direct (Apps Script Web App)".

No external dependency: the POST uses the standard library (``urllib``). The
Apps Script ``/exec`` endpoint answers a 302 redirect to the result URL; urllib
follows it after ``doPost`` has already run, so the append still happens.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import date

from common.logger import logger
from pipeline import bridge_log_store

# Same column order as the canonical recording / the local CSV log, plus the two
# trailing forest-fire danger-zone columns (populated only on detection frames).
# "Fire GeoJSON" is the zone outline as a GeoJSON Polygon.
SHEET_HEADER = [
    "m-time", "Flight ID", " Ublox UTC", "U Lat", "U Long", "U Alt",
    "Speed", "Vert speed", "#Sat", "Pressure", "MIU",
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
    "Fire Level", "Fire GeoJSON",
]
_FRAME_KEYS = [
    "mission_time", "flight_id", "gnss_time_utc", "latitude_deg", "longitude_deg",
    "altitude_m", "speed_mps", "vertical_speed_mps", "satellite_count",
    "pressure_hpa", "miu_v",
    "temperature_1_c", "temperature_2_c", "temperature_3_c", "temperature_4_c",
    "temperature_5_c", "temperature_6_c", "temperature_7_c", "temperature_8_c",
    "fire_zone_level", "fire_zone_geojson",
]

_MAX_BUFFER = 5000  # cap so a long outage can't grow the buffer unbounded

_buffer: list[list] = []
_buffer_lock = threading.Lock()
_thread: threading.Thread | None = None
_thread_lock = threading.Lock()

# Health state read by /api/status and updated by the flush loop, so the operator
# can see the sync failing (and recovering) instead of silently losing cloud rows.
_state_lock = threading.Lock()
_state = {
    "failing": False,      # last flush attempt failed
    "last_error": None,    # short description of the last failure
    "flushed_total": 0,    # rows successfully written since startup
    "dropped_total": 0,    # rows lost to backpressure (buffer cap)
    "last_drop_alert": 0.0,
}


class SheetsResponseError(Exception):
    """The Web App answered, but not with the expected `{ok: true}` JSON."""


def get_status() -> dict:
    """Sheets-sync health for /api/status (drives the frontend status block)."""
    if not is_sheets_sync_enabled():
        return {"enabled": False}
    with _buffer_lock:
        buffered = len(_buffer)
    with _state_lock:
        return {
            "enabled": True,
            "ok": not _state["failing"],
            "buffered_rows": buffered,
            "flushed_total": _state["flushed_total"],
            "dropped_total": _state["dropped_total"],
            "last_error": _state["last_error"],
        }


def _note_dropped_rows(count: int) -> None:
    """Record backpressure losses and alert the operator (max 1 line / 60 s).

    Must be called with `_buffer_lock` held by the caller (both call sites are
    inside the buffer-cap logic)."""
    now = time.time()
    with _state_lock:
        _state["dropped_total"] += count
        total = _state["dropped_total"]
        should_alert = now - _state["last_drop_alert"] >= 60.0
        if should_alert:
            _state["last_drop_alert"] = now
    if should_alert:
        bridge_log_store.alert(
            "WARN", "sheets",
            f"[SHEETS] buffer full - {total} oldest rows dropped so far (they will "
            "be MISSING from the Google Sheet; the local CSV is unaffected)",
        )


def get_webapp_url() -> str:
    return os.getenv("SHEETS_WEBAPP_URL", "").strip()


def get_flush_interval() -> float:
    try:
        return max(1.0, float(os.getenv("SHEETS_SYNC_INTERVAL_SEC", "5")))
    except (TypeError, ValueError):
        return 5.0


def is_sheets_sync_enabled() -> bool:
    return os.getenv("SHEETS_SYNC_ENABLED", "0") == "1" and bool(get_webapp_url())


def _frame_to_row(frame: dict) -> list:
    return [frame.get(key, "") for key in _FRAME_KEYS]


def enqueue_frame(frame: dict) -> None:
    """Buffer one normalized frame for the next batch (no-op if disabled)."""
    if not is_sheets_sync_enabled():
        return
    _ensure_worker()
    with _buffer_lock:
        _buffer.append(_frame_to_row(frame))
        overflow = len(_buffer) - _MAX_BUFFER
        if overflow > 0:
            del _buffer[:overflow]  # drop oldest rows under sustained backpressure
            _note_dropped_rows(overflow)


def _ensure_worker() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    with _thread_lock:
        if _thread and _thread.is_alive():
            return
        _thread = threading.Thread(target=_run, name="Sheets Sync", daemon=True)
        _thread.start()


def _describe_failure(exc: Exception) -> str:
    """One operator-readable line saying WHAT failed and what it means."""
    if isinstance(exc, urllib.error.HTTPError):
        if exc.code == 429:
            return "Google rate limit hit (HTTP 429) - too many writes, will keep retrying"
        if 500 <= exc.code < 600:
            return f"Google-side error (HTTP {exc.code}) - transient, will keep retrying"
        return f"Web App rejected the request (HTTP {exc.code}) - check SHEETS_WEBAPP_URL / deployment access"
    if isinstance(exc, urllib.error.URLError):
        return f"cannot reach Google ({exc.reason}) - no internet on the field laptop?"
    if isinstance(exc, TimeoutError):
        return "request timed out after 30s - slow/blocked network?"
    if isinstance(exc, SheetsResponseError):
        return str(exc)
    return str(exc)


def _run() -> None:
    url = get_webapp_url()
    interval = get_flush_interval()
    logger.info("Google Sheets sync started → %s (flush every %ss)", url, interval)
    while True:
        time.sleep(interval)
        with _buffer_lock:
            if not _buffer:
                continue
            rows = _buffer[:]
            _buffer.clear()
        tab = date.today().isoformat()  # one tab per local calendar day (YYYY-MM-DD)
        try:
            _post(url, tab, rows)
        except Exception as exc:
            # Network/Apps Script hiccup — re-queue the rows (front), respecting cap,
            # and try again next tick. Outages are transient, so don't latch off.
            reason = _describe_failure(exc)
            with _state_lock:
                _state["failing"] = True
                _state["last_error"] = reason
            bridge_log_store.alert(
                "ERROR", "sheets",
                f"[SHEETS] sync FAILED: {reason} - {len(rows)} rows buffered, "
                f"retrying every {interval:.0f}s (local CSV unaffected)",
            )
            with _buffer_lock:
                _buffer[:0] = rows
                overflow = len(_buffer) - _MAX_BUFFER
                if overflow > 0:
                    del _buffer[:overflow]
                    _note_dropped_rows(overflow)
            continue

        # Success — announce the recovery if we were failing, so the operator
        # sees a clear "fixed" line instead of the errors just going quiet.
        with _state_lock:
            was_failing = _state["failing"]
            _state["failing"] = False
            _state["last_error"] = None
            _state["flushed_total"] += len(rows)
        if was_failing:
            bridge_log_store.alert(
                "INFO", "sheets",
                f"[SHEETS] sync restored - {len(rows)} buffered rows flushed to tab {tab}",
            )
        logger.debug("Sheets sync: %s rows appended to tab %s", len(rows), tab)


def _post(url: str, tab: str, rows: list[list]) -> None:
    payload = json.dumps({"tab": tab, "header": SHEET_HEADER, "values": rows}).encode("utf-8")
    request = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8", errors="replace").strip()
    # The Apps Script answers `{ok: true, ...}` JSON. An HTML body means the
    # classic misdeployment (login page / old deployment) — the HTTP status is
    # 200 in that case, so checking the body is the ONLY way to catch it.
    if body.startswith("<"):
        raise SheetsResponseError(
            "Web App returned HTML instead of JSON - redeploy the Apps Script "
            "(Deploy > New deployment, access 'Anyone') and update SHEETS_WEBAPP_URL"
        )
    try:
        result = json.loads(body)
    except ValueError:
        raise SheetsResponseError(f"unexpected Web App response: {body[:120]!r}")
    if not result.get("ok"):
        raise SheetsResponseError(f"Web App reported an error: {body[:200]}")
