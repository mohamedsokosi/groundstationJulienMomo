export function normalizeTelemetryHeader(header = '') {
    return header.trim().replace(/\s+/g, '_');
}

export function isTelemetryNumericHeader(header = '') {
    const h = header.trim();
    if (/^(T[1-8]|MIU)$/i.test(h)) return true;
    return /(lat|long|alt|speed|pressure|sat)/i.test(h);
}

export function toTelemetryNumber(value, fallback = 0) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();

        if (trimmed === '') {
            return fallback;
        }

        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
}

export function getTelemetryValue(record = {}, keys = [], fallback = undefined) {
    const candidates = Array.isArray(keys) ? keys : [keys];

    for (const key of candidates) {
        const value = record?.[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return fallback;
}

export function getTelemetryNumber(record = {}, keys = [], fallback = 0) {
    return toTelemetryNumber(getTelemetryValue(record, keys, fallback), fallback);
}

export function formatTelemetryNumber(value, decimals = 0, unit = '') {
    const numeric = toTelemetryNumber(value, null);

    if (numeric === null) {
        return unit ? `-- ${unit}` : '--';
    }

    const suffix = unit ? ` ${unit}` : '';
    return `${numeric.toFixed(decimals)}${suffix}`;
}

export function distanceKm(start, end) {
    if (!start || !end) return 0;
    const R = 6371;
    const toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(end[0] - start[0]);
    const dLon = toRad(end[1] - start[1]);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(start[0])) * Math.cos(toRad(end[0])) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getMqttSourceStat(mqttStatus) {
    if (!mqttStatus) return { label: 'SOURCE', value: 'UNKNOWN', detail: 'status indisponible', sourceState: 'unknown', tone: 'neutral' };
    if (mqttStatus.using_mqtt_store) return { label: 'SOURCE', value: 'MQTT LIVE', detail: `${mqttStatus.stored_frames ?? 0} frames`, sourceState: 'live', tone: 'success' };
    if (mqttStatus.enabled) return { label: 'SOURCE', value: 'MQTT WAIT', detail: '0 frame', sourceState: 'waiting', tone: 'warning' };
    return { label: 'SOURCE', value: 'CSV FALLBACK', detail: 'mqtt off', sourceState: 'fallback', tone: 'neutral' };
}
