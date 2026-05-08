from collections import deque
from threading import Lock

from server.telemetry_protobuf import normalize_telemetry_frame

DEFAULT_MAXLEN = 5000


class TelemetryStore:
    def __init__(self, maxlen: int = DEFAULT_MAXLEN):
        self._frames = deque(maxlen=maxlen)
        self._lock = Lock()

    def configure_maxlen(self, maxlen: int) -> None:
        maxlen = max(1, int(maxlen or DEFAULT_MAXLEN))
        with self._lock:
            if self._frames.maxlen == maxlen:
                return

            current_frames = list(self._frames)[-maxlen:]
            self._frames = deque(current_frames, maxlen=maxlen)

    def add_frame(self, frame: dict) -> None:
        with self._lock:
            self._frames.append(normalize_telemetry_frame(frame))

    def get_frames(self) -> list[dict]:
        with self._lock:
            return [dict(frame) for frame in self._frames]

    def clear_frames(self) -> None:
        with self._lock:
            self._frames.clear()

    def has_frames(self) -> bool:
        with self._lock:
            return bool(self._frames)

    def get_count(self) -> int:
        with self._lock:
            return len(self._frames)


_telemetry_store = TelemetryStore()


def configure_maxlen(maxlen: int) -> None:
    _telemetry_store.configure_maxlen(maxlen)


def add_frame(frame: dict) -> None:
    _telemetry_store.add_frame(frame)


def get_frames() -> list[dict]:
    return _telemetry_store.get_frames()


def clear_frames() -> None:
    _telemetry_store.clear_frames()


def has_frames() -> bool:
    return _telemetry_store.has_frames()


def get_count() -> int:
    return _telemetry_store.get_count()
