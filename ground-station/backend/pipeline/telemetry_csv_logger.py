"""Appends every received MQTT telemetry frame to a local CSV file, with one
file per calendar day (named by date, e.g. ``2026-06-10.csv``).

This mirrors the per-day tabs of the Google Sheet sync: the local files are the
durable, unbounded archive; the Sheet is the live/shared view. Columns match the
canonical ICARUS2 recording (`telemetrySender/src/telemetry.csv`). See
Documentation.md › "Telemetry backup".
"""

import csv
import os
import threading
import time
from datetime import date

from common.logger import logger
from pipeline import bridge_log_store

# Header of the canonical ICARUS2 recording (column order matters), plus two
# forest-fire danger-zone columns appended at the end. The leading 19 columns are
# byte-identical to the flight recording, so header-based consumers stay
# interchangeable; the trailing Fire columns are populated only on detection frames.
# "Fire GeoJSON" is the zone outline as a GeoJSON Polygon (drawn verbatim by the GS).
CSV_HEADER = [
    "m-time", "Flight ID", " Ublox UTC", "U Lat", "U Long", "U Alt",
    "Speed", "Vert speed", "#Sat", "Pressure", "MIU",
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
    "Fire Level", "Fire GeoJSON",
]

# Normalized-frame keys in the same order as CSV_HEADER.
_FRAME_KEYS = [
    "mission_time", "flight_id", "gnss_time_utc", "latitude_deg", "longitude_deg",
    "altitude_m", "speed_mps", "vertical_speed_mps", "satellite_count",
    "pressure_hpa", "miu_v",
    "temperature_1_c", "temperature_2_c", "temperature_3_c", "temperature_4_c",
    "temperature_5_c", "temperature_6_c", "temperature_7_c", "temperature_8_c",
    "fire_zone_level", "fire_zone_geojson",
]


def is_csv_logging_enabled() -> bool:
    return os.getenv("TELEMETRY_CSV_LOG_ENABLED", "1") == "1"


def get_csv_dir() -> str:
    """Directory holding the per-day CSV files (one `<YYYY-MM-DD>.csv` each)."""
    default = os.path.join(os.path.expanduser("~"), "Desktop", "telemetry")
    return os.getenv("TELEMETRY_CSV_DIR", default)


def _frame_to_row(frame: dict) -> list:
    return [frame.get(key, "") for key in _FRAME_KEYS]


class TelemetryCsvLogger:
    # After a write/open failure (disk full, permissions, dir deleted…), retry at
    # most every RETRY_COOLDOWN_SEC. Frames arriving while failing are buffered in
    # memory (capped) and flushed on recovery, so a FIXED problem loses nothing.
    RETRY_COOLDOWN_SEC = 30.0
    MAX_PENDING_ROWS = 5000

    def __init__(self, directory: str):
        self._dir = directory
        self._lock = threading.Lock()
        self._fh = None
        self._writer = None
        self._open_day = None
        self._failed_at = None   # None = healthy; timestamp of the last failure
        self._last_error = None
        self._pending = []       # rows buffered while failing
        self._lost = 0           # pending rows dropped to the cap (gone for good)

    def _path_for(self, day: str) -> str:
        return os.path.join(self._dir, f"{day}.csv")

    def _ensure_open(self, day: str) -> None:
        # Already writing today's file — nothing to do.
        if self._fh is not None and self._open_day == day:
            return
        # Day rolled over (or first write) — close the old file, open the new one.
        if self._fh is not None:
            try:
                self._fh.close()
            except Exception:
                pass
            self._fh = None
        os.makedirs(self._dir, exist_ok=True)
        path = self._path_for(day)
        is_new = not os.path.exists(path) or os.path.getsize(path) == 0
        self._fh = open(path, "a", newline="", encoding="utf-8")
        self._writer = csv.writer(self._fh)
        self._open_day = day
        if is_new:
            self._writer.writerow(CSV_HEADER)
            self._fh.flush()
        logger.info("Telemetry CSV log: appending to %s", path)

    def _buffer_pending(self, row: list) -> None:
        self._pending.append(row)
        overflow = len(self._pending) - self.MAX_PENDING_ROWS
        if overflow > 0:
            del self._pending[:overflow]
            self._lost += overflow

    def _handle_failure(self, row: list, exc: Exception) -> None:
        # Close the (possibly broken) handle so the next attempt reopens cleanly.
        if self._fh is not None:
            try:
                self._fh.close()
            except Exception:
                pass
            self._fh = None
        self._failed_at = time.time()
        self._last_error = str(exc)
        self._buffer_pending(row)
        # alert() dedups (1 line / 60 s for the same error), so a persistent
        # failure reminds the operator without flooding at 1 Hz.
        bridge_log_store.alert(
            "ERROR", "csv",
            f"[CSV_LOG] local CSV archive FAILED ({exc}) - frames buffered in "
            f"memory ({len(self._pending)} pending), retrying every "
            f"{self.RETRY_COOLDOWN_SEC:.0f}s. Fix the disk/folder to resume",
        )

    def append(self, frame: dict) -> None:
        row = _frame_to_row(frame)
        with self._lock:
            # While failing, don't hammer the disk at 1 Hz — buffer and wait out
            # the cooldown, then retry (disk freed / folder restored / perms fixed).
            if (
                self._failed_at is not None
                and time.time() - self._failed_at < self.RETRY_COOLDOWN_SEC
            ):
                self._buffer_pending(row)
                return
            try:
                self._ensure_open(date.today().isoformat())
                recovered = len(self._pending)
                if self._pending:
                    self._writer.writerows(self._pending)
                    self._pending.clear()
                self._writer.writerow(row)
                self._fh.flush()  # flush so an external mirror always sees latest rows
            except Exception as exc:
                self._handle_failure(row, exc)
                return
            if self._failed_at is not None:
                self._failed_at = None
                self._last_error = None
                lost_note = f" ({self._lost} rows lost to the buffer cap)" if self._lost else ""
                self._lost = 0
                bridge_log_store.alert(
                    "INFO", "csv",
                    f"[CSV_LOG] local CSV archive restored - {recovered} buffered "
                    f"rows written{lost_note}",
                )

    def get_status(self) -> dict:
        with self._lock:
            return {
                "ok": self._failed_at is None,
                "pending_rows": len(self._pending),
                "lost_rows": self._lost,
                "last_error": self._last_error,
                "dir": self._dir,
            }


_logger_instance: TelemetryCsvLogger | None = None
_instance_lock = threading.Lock()


def append_frame(frame: dict) -> None:
    """Append one normalized telemetry frame to today's CSV (no-op if disabled)."""
    global _logger_instance
    if not is_csv_logging_enabled():
        return
    if _logger_instance is None:
        with _instance_lock:
            if _logger_instance is None:
                _logger_instance = TelemetryCsvLogger(get_csv_dir())
    _logger_instance.append(frame)


def get_status() -> dict:
    """CSV-archive health for /api/status (drives the frontend status block)."""
    if not is_csv_logging_enabled():
        return {"enabled": False}
    if _logger_instance is None:
        return {"enabled": True, "ok": True, "pending_rows": 0, "lost_rows": 0,
                "last_error": None, "dir": get_csv_dir()}
    return {"enabled": True, **_logger_instance.get_status()}
