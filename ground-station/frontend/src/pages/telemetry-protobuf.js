const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_32BIT = 5;

const textDecoder = new TextDecoder('utf-8');

function readVarint(bytes, offset) {
    let value = 0;
    let shift = 0;
    let currentOffset = offset;

    while (currentOffset < bytes.length) {
        const byte = bytes[currentOffset];
        currentOffset += 1;
        value += (byte & 0x7f) * (2 ** shift);

        if ((byte & 0x80) === 0) {
            return { value, offset: currentOffset };
        }

        shift += 7;
        if (shift > 53) {
            throw new Error('Telemetry protobuf varint is too large.');
        }
    }

    throw new Error('Telemetry protobuf varint is truncated.');
}

function readLengthDelimited(bytes, offset) {
    const lengthResult = readVarint(bytes, offset);
    const start = lengthResult.offset;
    const end = start + lengthResult.value;

    if (end > bytes.length) {
        throw new Error('Telemetry protobuf field is truncated.');
    }

    return {
        value: bytes.subarray(start, end),
        offset: end,
    };
}

function readDouble(bytes, offset) {
    const end = offset + 8;

    if (end > bytes.length) {
        throw new Error('Telemetry protobuf double is truncated.');
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    return {
        value: view.getFloat64(0, true),
        offset: end,
    };
}

function readString(bytes, offset) {
    const result = readLengthDelimited(bytes, offset);
    return {
        value: textDecoder.decode(result.value),
        offset: result.offset,
    };
}

function skipField(bytes, offset, wireType) {
    switch (wireType) {
        case WIRE_VARINT:
            return readVarint(bytes, offset).offset;
        case WIRE_64BIT:
            return offset + 8;
        case WIRE_LENGTH_DELIMITED:
            return readLengthDelimited(bytes, offset).offset;
        case WIRE_32BIT:
            return offset + 4;
        default:
            throw new Error(`Unsupported telemetry protobuf wire type ${wireType}.`);
    }
}

function decodeTelemetryFrame(bytes) {
    const frame = {};
    let offset = 0;

    while (offset < bytes.length) {
        const tag = readVarint(bytes, offset);
        offset = tag.offset;

        const fieldNumber = Math.floor(tag.value / 8);
        const wireType = tag.value % 8;

        switch (fieldNumber) {
            case 1:
                if (wireType === WIRE_VARINT) {
                    const result = readVarint(bytes, offset);
                    frame.sequenceNumber = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 2:
                if (wireType === WIRE_LENGTH_DELIMITED) {
                    const result = readString(bytes, offset);
                    frame.missionTime = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 3:
                if (wireType === WIRE_LENGTH_DELIMITED) {
                    const result = readString(bytes, offset);
                    frame.flightId = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 4:
                if (wireType === WIRE_LENGTH_DELIMITED) {
                    const result = readString(bytes, offset);
                    frame.gnssTimeUtc = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 5:
                if (wireType === WIRE_64BIT) {
                    const result = readDouble(bytes, offset);
                    frame.latitudeDeg = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 6:
                if (wireType === WIRE_64BIT) {
                    const result = readDouble(bytes, offset);
                    frame.longitudeDeg = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 7:
                if (wireType === WIRE_64BIT) {
                    const result = readDouble(bytes, offset);
                    frame.altitudeM = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 8:
                if (wireType === WIRE_64BIT) {
                    const result = readDouble(bytes, offset);
                    frame.speedMps = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 9:
                if (wireType === WIRE_64BIT) {
                    const result = readDouble(bytes, offset);
                    frame.verticalSpeedMps = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 10:
                if (wireType === WIRE_VARINT) {
                    const result = readVarint(bytes, offset);
                    frame.satelliteCount = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            case 11:
                if (wireType === WIRE_64BIT) {
                    const result = readDouble(bytes, offset);
                    frame.pressureHpa = result.value;
                    offset = result.offset;
                    break;
                }
                offset = skipField(bytes, offset, wireType);
                break;
            default:
                offset = skipField(bytes, offset, wireType);
                break;
        }
    }

    return frame;
}

function frameToTelemetryRow(frame, index) {
    const sequenceNumber = Number.isFinite(frame.sequenceNumber) ? frame.sequenceNumber : index;
    const missionTime = frame.missionTime || '';
    const flightId = frame.flightId || '';
    const gnssTimeUtc = frame.gnssTimeUtc || '';
    const latitude = frame.latitudeDeg ?? 0;
    const longitude = frame.longitudeDeg ?? 0;
    const altitude = frame.altitudeM ?? 0;
    const speed = frame.speedMps ?? 0;
    const verticalSpeed = frame.verticalSpeedMps ?? 0;
    const satelliteCount = frame.satelliteCount ?? 0;
    const pressure = frame.pressureHpa ?? 0;

    return {
        sequenceNumber,
        sequence_number: sequenceNumber,
        streamIndex: index,
        sourceIndex: sequenceNumber,
        'm-time': missionTime,
        m_time: missionTime,
        'Flight ID': flightId,
        Flight_ID: flightId,
        'Ublox UTC': gnssTimeUtc,
        Ublox_UTC: gnssTimeUtc,
        'U Lat': latitude,
        U_Lat: latitude,
        'U Long': longitude,
        U_Long: longitude,
        'U Alt': altitude,
        U_Alt: altitude,
        Speed: speed,
        'Vert speed': verticalSpeed,
        Vert_speed: verticalSpeed,
        '#Sat': satelliteCount,
        '#_Sat': satelliteCount,
        Pressure: pressure,
    };
}

export function decodeTelemetryBatch(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const batch = {
        schemaVersion: 0,
        frames: [],
    };
    let offset = 0;

    while (offset < bytes.length) {
        const tag = readVarint(bytes, offset);
        offset = tag.offset;

        const fieldNumber = Math.floor(tag.value / 8);
        const wireType = tag.value % 8;

        if (fieldNumber === 1 && wireType === WIRE_VARINT) {
            const result = readVarint(bytes, offset);
            batch.schemaVersion = result.value;
            offset = result.offset;
            continue;
        }

        if (fieldNumber === 2 && wireType === WIRE_LENGTH_DELIMITED) {
            const result = readLengthDelimited(bytes, offset);
            const frame = decodeTelemetryFrame(result.value);
            batch.frames.push(frameToTelemetryRow(frame, batch.frames.length));
            offset = result.offset;
            continue;
        }

        offset = skipField(bytes, offset, wireType);
    }

    return batch;
}

export function decodeTelemetryRowsFromProtobuf(buffer) {
    return decodeTelemetryBatch(buffer).frames;
}
