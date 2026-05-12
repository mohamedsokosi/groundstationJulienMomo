import {
    getTelemetryNumber,
    isTelemetryNumericHeader,
    normalizeTelemetryHeader,
    toTelemetryNumber,
} from './telemetry-utils.js';
import { decodeTelemetryRowsFromProtobuf } from './telemetry-protobuf.js';

export const TELEMETRY_SOURCE_URL = '/api/telemetry.csv';
export const TELEMETRY_PROTOBUF_SOURCE_URL = '/api/telemetry.pb';
export const TELEMETRY_STREAM_INTERVAL_MS = 500;
export const TELEMETRY_MIN_STREAM_POINTS = 500;

export function parseTelemetryCsv(text) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const headers = lines[0].split(',').map((header) => header.trim());

    return lines.slice(1).map((line) => {
        const values = line.split(',').map((value) => value.trim());
        const record = {};

        headers.forEach((header, index) => {
            const value = values[index];
            const parsedValue = isTelemetryNumericHeader(header)
                ? toTelemetryNumber(value)
                : value ?? '';
            const normalizedHeader = normalizeTelemetryHeader(header);

            record[header] = parsedValue;
            record[normalizedHeader] = parsedValue;
        });

        return record;
    });
}

export function parseTelemetryProtobuf(buffer) {
    return decodeTelemetryRowsFromProtobuf(buffer);
}

function parseRowTimestamp(item) {
    const raw = item['m-time'] ?? item['Ublox UTC'] ?? item['Ublox_UTC'] ?? '';
    if (!raw) return null;
    const d = new Date(raw);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
}

export function buildTelemetryChartData(data = []) {
    const epochMs = data.length > 0 ? parseRowTimestamp(data[0]) : null;

    return data.map((item, index) => {
        const timeIndex = toTelemetryNumber(item.streamIndex, index);
        let elapsedSeconds;
        if (epochMs !== null) {
            const t = parseRowTimestamp(item);
            elapsedSeconds = t !== null ? (t - epochMs) / 1000 : timeIndex * (TELEMETRY_STREAM_INTERVAL_MS / 1000);
        } else {
            elapsedSeconds = timeIndex * (TELEMETRY_STREAM_INTERVAL_MS / 1000);
        }

        return {
            ...item,
            index,
            'Time Index': timeIndex,
            '_elapsed_s': +elapsedSeconds.toFixed(2),
            '_elapsed_min': +((elapsedSeconds / 60).toFixed(2)),
            'U_Alt': getTelemetryNumber(item, ['U_Alt', 'U Alt']),
            'Speed': getTelemetryNumber(item, 'Speed'),
            'Vert_speed': getTelemetryNumber(item, ['Vert_speed', 'Vert speed']),
            'Pressure': getTelemetryNumber(item, 'Pressure'),
            'U_Lat': getTelemetryNumber(item, ['U_Lat', 'U Lat']),
            'U_Long': getTelemetryNumber(item, ['U_Long', 'U Long']),
            '#_Sat': getTelemetryNumber(item, ['#_Sat', '#Sat']),
            'MIU': getTelemetryNumber(item, 'MIU'),
            'T1': getTelemetryNumber(item, 'T1'),
            'T2': getTelemetryNumber(item, 'T2'),
            'T3': getTelemetryNumber(item, 'T3'),
            'T4': getTelemetryNumber(item, 'T4'),
            'T5': getTelemetryNumber(item, 'T5'),
            'T6': getTelemetryNumber(item, 'T6'),
            'T7': getTelemetryNumber(item, 'T7'),
            'T8': getTelemetryNumber(item, 'T8'),
        };
    });
}

export function createTelemetryStreamPoint(rows = [], currentIndex = 0, streamIndex = 0) {
    if (!rows.length) {
        return null;
    }

    return {
        ...rows[currentIndex],
        streamIndex,
        sourceIndex: currentIndex,
    };
}

export function getTelemetryStreamLimit(sourceLength = 0) {
    return Math.max(sourceLength * 3, TELEMETRY_MIN_STREAM_POINTS);
}

export function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            if (typeof event.target?.result === 'string') {
                resolve(event.target.result);
                return;
            }

            reject(new Error('The selected file could not be read as text.'));
        };

        reader.onerror = () => {
            reject(reader.error || new Error('Failed to read the selected file.'));
        };

        reader.readAsText(file);
    });
}
