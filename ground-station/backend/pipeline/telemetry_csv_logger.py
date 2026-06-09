"""Appends every received MQTT telemetry frame to a local CSV file.

The CSV uses the same columns as the ICARUS2 flight recording
(`telemetrySender/src/telemetry.csv`) so the captured log is interchangeable
with the original data. The file is meant to be mirrored to Google Drive by an
external tool (rclone) — see ARCHITECTURE.md › "Local CSV capture + Google Drive
sync".
"""

import csv
import os
import threading

from common.logger import logger

# Exact header of the canonical ICARUS2 recording (column order matters).
CSV_HEADER = [
    "m-time", "Flight ID", " Ublox UTC", "U Lat", "U Long", "U Alt",
    "Speed", "Vert speed", "#Sat", "Pressure", "MIU",
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
]

# Normalized-frame keys in the same order as CSV_HEADER.
_FRAME_KEYS = [
    "mission_time", "flight_id", "gnss_time_utc", "latitude_deg", "longitude_deg",
    "altitude_m", "speed_mps", "vertical_speed_mps", "satellite_count",
    "pressure_hpa", "miu_v",
    "temperature_1_c", "temperature_2_c", "temperature_3_c", "temperature_4_c",
    "temperature_5_c", "temperature_6_c", "temperature_7_c", "temperature_8_c",
]


def is_csv_logging_enabled() -> bool:
    return os.getenv("TELEMETRY_CSV_LOG_ENABLED", "1") == "1"


def get_csv_path() -> str:
    default = os.path.join(os.path.expanduser("~"), "Desktop", "telemetry_live.csv")
    return os.getenv("TELEMETRY_CSV_PATH", default)


def _frame_to_row(frame: dict) -> list:
    return [frame.get(key, "") for key in _FRAME_KEYS]


class TelemetryCsvLogger:
    def __init__(self, path: str):
        self._path = path
        self._lock = threading.Lock()
        self._fh = None
        self._writer = None
        self._failed = False

    def _ensure_open(self) -> None:
        if self._fh is not None:
            return
        directory = os.path.dirname(self._path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        is_new = not os.path.exists(self._path) or os.path.getsize(self._path) == 0
        self._fh = open(self._path, "a", newline="", encoding="utf-8")
        self._writer = csv.writer(self._fh)
        if is_new:
            self._writer.writerow(CSV_HEADER)
            self._fh.flush()
        logger.info("Telemetry CSV log: appending to %s", self._path)

    def append(self, frame: dict) -> None:
        # One failed open shouldn't spam logs every second — latch it off.
        if self._failed:
            return
        with self._lock:
            try:
                self._ensure_open()
                self._writer.writerow(_frame_to_row(frame))
                self._fh.flush()  # flush so rclone always mirrors the latest rows
            except Exception as exc:
                self._failed = True
                logger.error("Telemetry CSV logging disabled after error: %s", exc)


_logger_instance: TelemetryCsvLogger | None = None
_instance_lock = threading.Lock()


def append_frame(frame: dict) -> None:
    """Append one normalized telemetry frame to the local CSV (no-op if disabled)."""
    global _logger_instance
    if not is_csv_logging_enabled():
        return
    if _logger_instance is None:
        with _instance_lock:
            if _logger_instance is None:
                _logger_instance = TelemetryCsvLogger(get_csv_path())
    _logger_instance.append(frame)
