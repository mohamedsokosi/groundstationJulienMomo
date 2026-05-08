from pipeline.telemetry_store import TelemetryStore


def test_telemetry_store_add_get_clear():
    store = TelemetryStore(maxlen=2)

    assert store.has_frames() is False
    assert store.get_count() == 0

    store.add_frame({"sequence_number": 1, "altitude_m": 100.0})
    store.add_frame({"sequence_number": 2, "altitude_m": 200.0})
    store.add_frame({"sequence_number": 3, "altitude_m": 300.0})

    frames = store.get_frames()
    assert store.has_frames() is True
    assert store.get_count() == 2
    assert [frame["sequence_number"] for frame in frames] == [2, 3]
    assert frames[1]["altitude_m"] == 300.0

    store.clear_frames()

    assert store.has_frames() is False
    assert store.get_count() == 0
    assert store.get_frames() == []


def test_telemetry_store_configure_maxlen_keeps_latest_frames():
    store = TelemetryStore(maxlen=5)
    for sequence_number in range(5):
        store.add_frame({"sequence_number": sequence_number})

    store.configure_maxlen(3)

    assert store.get_count() == 3
    assert [frame["sequence_number"] for frame in store.get_frames()] == [2, 3, 4]
