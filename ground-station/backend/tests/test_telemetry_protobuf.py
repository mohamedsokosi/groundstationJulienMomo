from server.telemetry_protobuf import (
    decode_telemetry_batch,
    decode_telemetry_frame,
    encode_telemetry_batch,
    encode_telemetry_frame,
)


def test_encode_then_decode_telemetry_frame():
    frame = {
        "sequence_number": 42,
        "mission_time": "8/14/2025 10:15",
        "flight_id": "ICARUS2",
        "gnss_time_utc": "8/14/2025 14:14",
        "latitude_deg": 48.56779,
        "longitude_deg": -81.36569,
        "altitude_m": 287.6,
        "speed_mps": 0.06,
        "vertical_speed_mps": 0.07,
        "satellite_count": 12,
        "pressure_hpa": 985.29,
        "miu_v": 3.286,
        "temperature_1_c": 15.55,
        "temperature_2_c": 11.87,
        "temperature_3_c": 17.07,
        "temperature_4_c": 12.91,
        "temperature_5_c": 14.26,
        "temperature_6_c": 10.16,
        "temperature_7_c": 17.87,
        "temperature_8_c": 14.22,
    }

    decoded = decode_telemetry_frame(encode_telemetry_frame(frame))

    assert decoded["sequence_number"] == 42
    assert decoded["mission_time"] == "8/14/2025 10:15"
    assert decoded["flight_id"] == "ICARUS2"
    assert decoded["gnss_time_utc"] == "8/14/2025 14:14"
    assert decoded["latitude_deg"] == 48.56779
    assert decoded["longitude_deg"] == -81.36569
    assert decoded["altitude_m"] == 287.6
    assert decoded["speed_mps"] == 0.06
    assert decoded["vertical_speed_mps"] == 0.07
    assert decoded["satellite_count"] == 12
    assert decoded["pressure_hpa"] == 985.29
    assert decoded["miu_v"] == 3.286
    assert decoded["temperature_1_c"] == 15.55
    assert decoded["temperature_2_c"] == 11.87
    assert decoded["temperature_3_c"] == 17.07
    assert decoded["temperature_4_c"] == 12.91
    assert decoded["temperature_5_c"] == 14.26
    assert decoded["temperature_6_c"] == 10.16
    assert decoded["temperature_7_c"] == 17.87
    assert decoded["temperature_8_c"] == 14.22


def test_encode_telemetry_batch_with_multiple_frames():
    frames = [
        {"sequence_number": 1, "altitude_m": 100.0, "speed_mps": 3.0},
        {"sequence_number": 2, "altitude_m": 200.0, "speed_mps": 4.0},
    ]

    decoded = decode_telemetry_batch(encode_telemetry_batch(frames))

    assert decoded["schema_version"] == 2
    assert len(decoded["frames"]) == 2
    assert decoded["frames"][0]["sequence_number"] == 1
    assert decoded["frames"][0]["altitude_m"] == 100.0
    assert decoded["frames"][1]["sequence_number"] == 2
    assert decoded["frames"][1]["speed_mps"] == 4.0
