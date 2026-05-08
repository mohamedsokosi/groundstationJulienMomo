import struct

WIRE_VARINT = 0
WIRE_64BIT = 1
WIRE_LENGTH_DELIMITED = 2
WIRE_32BIT = 5

TELEMETRY_FRAME_DEFAULTS = {
    "sequence_number": 0,
    "mission_time": "",
    "flight_id": "",
    "gnss_time_utc": "",
    "latitude_deg": 0.0,
    "longitude_deg": 0.0,
    "altitude_m": 0.0,
    "speed_mps": 0.0,
    "vertical_speed_mps": 0.0,
    "satellite_count": 0,
    "pressure_hpa": 0.0,
}


def _to_string(value, fallback: str = "") -> str:
    if value is None:
        return fallback
    return str(value).strip()


def _to_float(value, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return fallback


def _to_uint32(value, fallback: int = 0) -> int:
    try:
        parsed = int(float(value if value not in (None, "") else fallback))
    except (TypeError, ValueError):
        parsed = fallback
    return min(max(parsed, 0), 0xFFFFFFFF)


def _clean_row(row: dict) -> dict:
    return {
        str(key).strip(): (value.strip() if isinstance(value, str) else value)
        for key, value in (row or {}).items()
        if key is not None
    }


def csv_row_to_telemetry_frame(row: dict, sequence_number: int = 0) -> dict:
    clean = _clean_row(row)
    return {
        "sequence_number": _to_uint32(sequence_number),
        "mission_time": _to_string(clean.get("m-time")),
        "flight_id": _to_string(clean.get("Flight ID")),
        "gnss_time_utc": _to_string(clean.get("Ublox UTC")),
        "latitude_deg": _to_float(clean.get("U Lat")),
        "longitude_deg": _to_float(clean.get("U Long")),
        "altitude_m": _to_float(clean.get("U Alt")),
        "speed_mps": _to_float(clean.get("Speed")),
        "vertical_speed_mps": _to_float(clean.get("Vert speed")),
        "satellite_count": _to_uint32(clean.get("#Sat")),
        "pressure_hpa": _to_float(clean.get("Pressure")),
    }


def normalize_telemetry_frame(frame: dict, sequence_number: int | None = None) -> dict:
    source = frame or {}
    fallback_sequence = TELEMETRY_FRAME_DEFAULTS["sequence_number"]
    if sequence_number is not None:
        fallback_sequence = sequence_number

    return {
        "sequence_number": _to_uint32(
            source.get("sequence_number", source.get("sequenceNumber", fallback_sequence))
        ),
        "mission_time": _to_string(source.get("mission_time", source.get("missionTime", ""))),
        "flight_id": _to_string(source.get("flight_id", source.get("flightId", ""))),
        "gnss_time_utc": _to_string(source.get("gnss_time_utc", source.get("gnssTimeUtc", ""))),
        "latitude_deg": _to_float(source.get("latitude_deg", source.get("latitudeDeg", 0.0))),
        "longitude_deg": _to_float(source.get("longitude_deg", source.get("longitudeDeg", 0.0))),
        "altitude_m": _to_float(source.get("altitude_m", source.get("altitudeM", 0.0))),
        "speed_mps": _to_float(source.get("speed_mps", source.get("speedMps", 0.0))),
        "vertical_speed_mps": _to_float(
            source.get("vertical_speed_mps", source.get("verticalSpeedMps", 0.0))
        ),
        "satellite_count": _to_uint32(
            source.get("satellite_count", source.get("satelliteCount", 0))
        ),
        "pressure_hpa": _to_float(source.get("pressure_hpa", source.get("pressureHpa", 0.0))),
    }


def encode_varint(value: int) -> bytes:
    value = _to_uint32(value)
    encoded = bytearray()

    while value > 0x7F:
        encoded.append((value & 0x7F) | 0x80)
        value >>= 7

    encoded.append(value)
    return bytes(encoded)


def encode_key(field_number: int, wire_type: int) -> bytes:
    return encode_varint((field_number << 3) | wire_type)


def encode_uint32(field_number: int, value: int) -> bytes:
    return encode_key(field_number, WIRE_VARINT) + encode_varint(value)


def encode_double(field_number: int, value: float) -> bytes:
    return encode_key(field_number, WIRE_64BIT) + struct.pack("<d", _to_float(value))


def encode_string(field_number: int, value: str) -> bytes:
    encoded = _to_string(value).encode("utf-8")
    if not encoded:
        return b""
    return encode_key(field_number, WIRE_LENGTH_DELIMITED) + encode_varint(len(encoded)) + encoded


def encode_telemetry_frame(frame: dict) -> bytes:
    normalized = normalize_telemetry_frame(frame)
    payload = bytearray()
    payload += encode_uint32(1, normalized["sequence_number"])
    payload += encode_string(2, normalized["mission_time"])
    payload += encode_string(3, normalized["flight_id"])
    payload += encode_string(4, normalized["gnss_time_utc"])
    payload += encode_double(5, normalized["latitude_deg"])
    payload += encode_double(6, normalized["longitude_deg"])
    payload += encode_double(7, normalized["altitude_m"])
    payload += encode_double(8, normalized["speed_mps"])
    payload += encode_double(9, normalized["vertical_speed_mps"])
    payload += encode_uint32(10, normalized["satellite_count"])
    payload += encode_double(11, normalized["pressure_hpa"])
    return bytes(payload)


def encode_telemetry_batch(frames: list[dict], schema_version: int = 1) -> bytes:
    payload = bytearray()
    payload += encode_uint32(1, schema_version)

    for index, frame in enumerate(frames or []):
        encoded_frame = encode_telemetry_frame(normalize_telemetry_frame(frame, index))
        payload += encode_key(2, WIRE_LENGTH_DELIMITED)
        payload += encode_varint(len(encoded_frame))
        payload += encoded_frame

    return bytes(payload)


def decode_varint(data: bytes, offset: int = 0) -> tuple[int, int]:
    value = 0
    shift = 0
    current_offset = offset

    while current_offset < len(data):
        byte = data[current_offset]
        current_offset += 1
        value |= (byte & 0x7F) << shift

        if byte & 0x80 == 0:
            return value, current_offset

        shift += 7
        if shift > 63:
            raise ValueError("Protobuf varint is too large")

    raise ValueError("Protobuf varint is truncated")


def _read_length_delimited(data: bytes, offset: int) -> tuple[bytes, int]:
    length, offset = decode_varint(data, offset)
    end = offset + length
    if end > len(data):
        raise ValueError("Protobuf length-delimited field is truncated")
    return data[offset:end], end


def _read_double(data: bytes, offset: int) -> tuple[float, int]:
    end = offset + 8
    if end > len(data):
        raise ValueError("Protobuf double field is truncated")
    return struct.unpack("<d", data[offset:end])[0], end


def _skip_field(data: bytes, offset: int, wire_type: int) -> int:
    if wire_type == WIRE_VARINT:
        _, offset = decode_varint(data, offset)
        return offset
    if wire_type == WIRE_64BIT:
        end = offset + 8
        if end > len(data):
            raise ValueError("Protobuf 64-bit field is truncated")
        return end
    if wire_type == WIRE_LENGTH_DELIMITED:
        _, offset = _read_length_delimited(data, offset)
        return offset
    if wire_type == WIRE_32BIT:
        end = offset + 4
        if end > len(data):
            raise ValueError("Protobuf 32-bit field is truncated")
        return end
    raise ValueError(f"Unsupported protobuf wire type {wire_type}")


def decode_telemetry_frame(data: bytes) -> dict:
    frame = dict(TELEMETRY_FRAME_DEFAULTS)
    offset = 0

    while offset < len(data):
        tag, offset = decode_varint(data, offset)
        field_number = tag >> 3
        wire_type = tag & 0x07

        if field_number == 1 and wire_type == WIRE_VARINT:
            frame["sequence_number"], offset = decode_varint(data, offset)
        elif field_number == 2 and wire_type == WIRE_LENGTH_DELIMITED:
            raw_value, offset = _read_length_delimited(data, offset)
            frame["mission_time"] = raw_value.decode("utf-8")
        elif field_number == 3 and wire_type == WIRE_LENGTH_DELIMITED:
            raw_value, offset = _read_length_delimited(data, offset)
            frame["flight_id"] = raw_value.decode("utf-8")
        elif field_number == 4 and wire_type == WIRE_LENGTH_DELIMITED:
            raw_value, offset = _read_length_delimited(data, offset)
            frame["gnss_time_utc"] = raw_value.decode("utf-8")
        elif field_number == 5 and wire_type == WIRE_64BIT:
            frame["latitude_deg"], offset = _read_double(data, offset)
        elif field_number == 6 and wire_type == WIRE_64BIT:
            frame["longitude_deg"], offset = _read_double(data, offset)
        elif field_number == 7 and wire_type == WIRE_64BIT:
            frame["altitude_m"], offset = _read_double(data, offset)
        elif field_number == 8 and wire_type == WIRE_64BIT:
            frame["speed_mps"], offset = _read_double(data, offset)
        elif field_number == 9 and wire_type == WIRE_64BIT:
            frame["vertical_speed_mps"], offset = _read_double(data, offset)
        elif field_number == 10 and wire_type == WIRE_VARINT:
            frame["satellite_count"], offset = decode_varint(data, offset)
        elif field_number == 11 and wire_type == WIRE_64BIT:
            frame["pressure_hpa"], offset = _read_double(data, offset)
        else:
            offset = _skip_field(data, offset, wire_type)

    return normalize_telemetry_frame(frame)


def decode_telemetry_batch(data: bytes) -> dict:
    batch = {"schema_version": 0, "frames": []}
    offset = 0

    while offset < len(data):
        tag, offset = decode_varint(data, offset)
        field_number = tag >> 3
        wire_type = tag & 0x07

        if field_number == 1 and wire_type == WIRE_VARINT:
            batch["schema_version"], offset = decode_varint(data, offset)
        elif field_number == 2 and wire_type == WIRE_LENGTH_DELIMITED:
            raw_frame, offset = _read_length_delimited(data, offset)
            batch["frames"].append(decode_telemetry_frame(raw_frame))
        else:
            offset = _skip_field(data, offset, wire_type)

    return batch
