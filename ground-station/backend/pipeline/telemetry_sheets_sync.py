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
import urllib.request
from datetime import date

from common.logger import logger

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


def _ensure_worker() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    with _thread_lock:
        if _thread and _thread.is_alive():
            return
        _thread = threading.Thread(target=_run, name="Sheets Sync", daemon=True)
        _thread.start()


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
            logger.debug("Sheets sync: %s rows appended to tab %s", len(rows), tab)
        except Exception as exc:
            # Network/Apps Script hiccup — re-queue the rows (front), respecting cap,
            # and try again next tick. Outages are transient, so don't latch off.
            logger.error("Sheets sync failed (%s rows re-queued): %s", len(rows), exc)
            with _buffer_lock:
                _buffer[:0] = rows
                overflow = len(_buffer) - _MAX_BUFFER
                if overflow > 0:
                    del _buffer[:overflow]


def _post(url: str, tab: str, rows: list[list]) -> None:
    payload = json.dumps({"tab": tab, "header": SHEET_HEADER, "values": rows}).encode("utf-8")
    request = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()
