import {
    getTelemetryNumber,
    isTelemetryNumericHeader,
    normalizeTelemetryHeader,
    toTelemetryNumber,
} from './telemetry-utils.js';

export const TELEMETRY_SOURCE_URL = '/api/telemetry.csv';
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

export function buildTelemetryChartData(data = []) {
    return data.map((item, index) => ({
        ...item,
        index,
        'Time Index': item.streamIndex ?? index,
        'U_Alt': getTelemetryNumber(item, ['U_Alt', 'U Alt']),
        'Speed': getTelemetryNumber(item, 'Speed'),
        'Vert_speed': getTelemetryNumber(item, ['Vert_speed', 'Vert speed']),
        'Pressure': getTelemetryNumber(item, 'Pressure'),
        'U_Lat': getTelemetryNumber(item, ['U_Lat', 'U Lat']),
        'U_Long': getTelemetryNumber(item, ['U_Long', 'U Long']),
        '#_Sat': getTelemetryNumber(item, ['#_Sat', '#Sat']),
    }));
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
