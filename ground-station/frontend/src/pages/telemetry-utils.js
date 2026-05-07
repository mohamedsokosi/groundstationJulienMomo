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
