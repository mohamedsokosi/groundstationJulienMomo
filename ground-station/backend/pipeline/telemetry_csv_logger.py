"""Appends every received MQTT telemetry frame to a local CSV file, with one
file per calendar day (named by date, e.g. ``2026-06-10.csv``).

This mirrors the per-day tabs of the Google Sheet sync: the local files are the
durable, unbounded archive; the Sheet is the live/shared view. Columns match the
canonical ICARUS2 recording (`telemetrySender/src/telemetry.csv`). See
Documentation.md › "Sauvegarde de la télémétrie".
"""

import csv
import os
import threading
from datetime import date

from common.logger import logger

# Header of the canonical ICARUS2 recording (column order matters), plus the
# forest-fire danger-zone columns appended at the end. The leading 19 columns are
# byte-identical to the flight recording, so header-based consumers stay
# interchangeable; the trailing Fire_* columns are populated only when the CubeSat
# scan detects a danger zone (otherwise blank/0).
CSV_HEADER = [
    "m-time", "Flight ID", " Ublox UTC", "U Lat", "U Long", "U Alt",
    "Speed", "Vert speed", "#Sat", "Pressure", "MIU",
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
    "Fire Level", "Fire Lat", "Fire Lon", "Fire Radius", "Fire Shape",
]

# Normalized-frame keys in the same order as CSV_HEADER.
_FRAME_KEYS = [
    "mission_time", "flight_id", "gnss_time_utc", "latitude_deg", "longitude_deg",
    "altitude_m", "speed_mps", "vertical_speed_mps", "satellite_count",
    "pressure_hpa", "miu_v",
    "temperature_1_c", "temperature_2_c", "temperature_3_c", "temperature_4_c",
    "temperature_5_c", "temperature_6_c", "temperature_7_c", "temperature_8_c",
    "fire_zone_level", "fire_zone_lat", "fire_zone_lon", "fire_zone_radius_m",
    "fire_zone_shape",
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
    def __init__(self, directory: str):
        self._dir = directory
        self._lock = threading.Lock()
        self._fh = None
        self._writer = None
        self._open_day = None
        self._failed = False

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

    def append(self, frame: dict) -> None:
        # One failed open shouldn't spam logs every second — latch it off.
        if self._failed:
            return
        with self._lock:
            try:
                self._ensure_open(date.today().isoformat())
                self._writer.writerow(_frame_to_row(frame))
                self._fh.flush()  # flush so an external mirror always sees latest rows
            except Exception as exc:
                self._failed = True
                logger.error("Telemetry CSV logging disabled after error: %s", exc)


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
