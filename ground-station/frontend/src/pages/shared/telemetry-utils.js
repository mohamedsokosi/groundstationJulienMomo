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

// --- Physical-plausibility gate for map positions ---------------------------------
// Corrupt telemetry can decode into positions that are physically impossible for a
// stratospheric balloon: a single-frame teleport across the globe, an altitude "in
// space"… Drawing those wrecks the 3D view (trajectory line around the planet,
// camera flying away). The gate accepts a record's position only when it is
// physically reachable from the last accepted one; rejected frames keep the map on
// the last known good position. The charts flag the same frames via detectErrors.
// Floor set below any realistic launch site (the ICARUS2 launch is ~290 m ASL and
// the balloon only climbs) but above GPS ground noise, so a corrupt "-500 m" frame
// is caught while a real low-altitude reading isn't. This both rejects the point
// from the trajectory (no downward spike on the blue line) and ghosts it on charts.
export const MIN_PLAUSIBLE_ALTITUDE_M = -100;
export const MAX_PLAUSIBLE_ALTITUDE_M = 55000; // stratospheric ceiling + margin
export const MAX_PLAUSIBLE_SPEED_MPS = 300;    // generous balloon drift + jet stream
// After this many consecutive distance rejections the ANCHOR is considered wrong
// (the first accepted fix was itself corrupt) and the gate re-anchors on new data.
export const GEO_REANCHOR_AFTER_REJECTS = 10;

export function isPlausibleGeo(geo) {
    return Boolean(geo)
        && Number.isFinite(geo.lat) && Number.isFinite(geo.lon) && Number.isFinite(geo.alt)
        && Math.abs(geo.lat) <= 90 && Math.abs(geo.lon) <= 180
        && geo.alt >= MIN_PLAUSIBLE_ALTITUDE_M && geo.alt <= MAX_PLAUSIBLE_ALTITUDE_M;
}

// `toGeo(record)` → {lat, lon, alt} | null (injected so this stays Cesium-free).
export function createGeoPlausibilityGate(toGeo) {
    let lastGood = null;   // { lat, lon, alt, elapsedS }
    let rejectStreak = 0;

    const evaluate = (record) => {
        // Ghost/blackout rows carry frozen copies of the last real position —
        // nothing new to draw, and they must not re-anchor the gate.
        if (!record || record._blackout) return null;
        const geo = toGeo(record);
        if (!geo || !isPlausibleGeo(geo)) return null;
        const elapsedS = Number.isFinite(record._elapsed_s) ? record._elapsed_s : null;
        let jump = false;
        if (lastGood) {
            const dtSec = (elapsedS !== null && lastGood.elapsedS !== null)
                ? Math.max(Math.abs(elapsedS - lastGood.elapsedS), 1)
                : 1;
            const maxKm = (MAX_PLAUSIBLE_SPEED_MPS * dtSec) / 1000;
            jump = distanceKm([lastGood.lat, lastGood.lon], [geo.lat, geo.lon]) > maxKm;
        }
        return { geo, elapsedS, jump };
    };

    return {
        // Stateful: advances the anchor. Use for the chronological trajectory stream.
        accept(record) {
            const res = evaluate(record);
            if (!res) return null;
            if (res.jump) {
                rejectStreak += 1;
                if (rejectStreak < GEO_REANCHOR_AFTER_REJECTS) return null;
                // Persistent "impossible" positions = our anchor was the corrupt
                // one. Re-anchor so a bad first fix can't blind the map forever.
            }
            rejectStreak = 0;
            lastGood = { ...res.geo, elapsedS: res.elapsedS };
            return res.geo;
        },
        // Pure check against the current anchor (no state change). Use for
        // re-evaluating the same record (current position, fire-zone carrier).
        peek(record) {
            const res = evaluate(record);
            return res && !res.jump ? res.geo : null;
        },
        reset() { lastGood = null; rejectStreak = 0; },
    };
}
