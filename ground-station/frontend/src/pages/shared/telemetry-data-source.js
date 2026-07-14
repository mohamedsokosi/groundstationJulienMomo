import {
    getTelemetryNumber,
    toTelemetryNumber,
    MIN_PLAUSIBLE_ALTITUDE_M,
    MAX_PLAUSIBLE_ALTITUDE_M,
    MAX_PLAUSIBLE_SPEED_MPS,
} from './telemetry-utils.js';
import { decodeTelemetryRowsFromProtobuf } from './telemetry-protobuf.js';

// Returns a short reason string if a frame carries a physically-impossible core
// value (altitude/speed a stratospheric balloon can't reach), else null. These
// frames decode fine but must NOT be plotted as real points — a single 99999 m
// altitude would spike the whole chart. They are rendered as the red ghost line
// instead (see buildTelemetryChartData) and flagged in the errors terminal.
export function implausibleValueReason(item) {
    const alt = getTelemetryNumber(item, ['U_Alt', 'U Alt'], NaN);
    if (Number.isFinite(alt) && (alt > MAX_PLAUSIBLE_ALTITUDE_M || alt < MIN_PLAUSIBLE_ALTITUDE_M)) {
        return `altitude ${Math.round(alt)} m out of range`;
    }
    const speed = getTelemetryNumber(item, 'Speed', NaN);
    if (Number.isFinite(speed) && Math.abs(speed) > MAX_PLAUSIBLE_SPEED_MPS) {
        return `speed ${Math.round(speed)} m/s out of range`;
    }
    return null;
}

export const TELEMETRY_MQTT_FRAMES_URL = '/api/telemetry/mqtt/frames';
// Max points kept in the live display window — match backend store_maxlen (5000).
export const TELEMETRY_MQTT_DISPLAY_POINTS = 5000;
// Fallback interval used when a frame has no timestamp (should be rare with live MQTT).
const TELEMETRY_STREAM_INTERVAL_MS = 500;

export function parseTelemetryProtobuf(buffer) {
    return decodeTelemetryRowsFromProtobuf(buffer);
}

// Mission-clock timestamp ONLY (m-time / Ublox UTC), no wall-clock fallback.
// Timing comparisons (outage gaps, monotonic trimming) must never mix the
// mission clock with the reception wall clock: a frame with an empty/corrupted
// m-time falling back to `_received_at` looks months away from its neighbours,
// which once made reconstructOutages try to synthesize ~28 MILLION phantom
// frames (frozen tab, exhausted RAM). Returns null when the frame carries no
// usable mission timestamp — callers must skip it as a timing anchor.
export function parseMissionTimestamp(item) {
    // 1. m-time: "8/14/2025 10:15" (M/D/YYYY H:MM) — parsed explicitly to work in all browsers
    const mtime = item['m-time'] ?? item['m_time'] ?? '';
    if (mtime) {
        const m = String(mtime).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (m) {
            const ms = new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0)).getTime();
            if (Number.isFinite(ms)) return ms;
        }
        const iso = new Date(mtime).getTime();
        if (Number.isFinite(iso)) return iso;
    }

    // 2. Ublox UTC: "09:15:32" (HH:MM:SS time-only) — combine with today's date
    const gnss = item['Ublox UTC'] ?? item['Ublox_UTC'] ?? item['gnssTimeUtc'] ?? '';
    if (gnss) {
        const t = String(gnss).match(/^(\d{2}):(\d{2}):(\d{2})/);
        if (t) {
            const now = new Date();
            const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +t[1], +t[2], +t[3]).getTime();
            if (Number.isFinite(ms)) return ms;
        }
    }

    return null;
}

export function parseRowTimestamp(item) {
    const missionTs = parseMissionTimestamp(item);
    if (missionTs !== null) return missionTs;

    // Reception timestamp injected when MQTT frames are loaded (fallback).
    // Wall clock, NOT the mission clock — fine for an absolute "when did this
    // arrive", never for gap comparisons against mission-timed frames.
    if (item._received_at && Number.isFinite(item._received_at)) return item._received_at;

    return null;
}

// Threshold above which a mission-time gap between two consecutive real
// frames is treated as an outage and visualized via synthesized phantom
// blackout frames. 2 s catches the 1-s telemetry cadence; anything below
// risks turning normal jitter into spurious blackouts.
const OUTAGE_GAP_THRESHOLD_SEC = 2;

// When the Pico finishes its CSV loop it restarts from line 1 — mission_time
// jumps backward by ~2 hours. After a page refresh the backend's 5000-frame
// deque can contain frames from BOTH cycles, which would otherwise make the
// chart zigzag wildly (negative elapsed_s for the new cycle's frames against
// the old cycle's fixed epoch). This walks backward through real frames and
// returns the longest tail where mission_time is monotonically non-decreasing.
// Phantom (`_blackout`) frames are skipped during the walk — they carry no
// mission_time of their own and would always look like a discontinuity.
export function keepMonotonicSuffix(data) {
    if (data.length < 2) return data;
    let cutoff = 0;
    let nextRealT = null;
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i]._blackout) continue;
        // Mission clock only — a frame without one (corrupted/empty m-time)
        // must not fake a loop restart with its wall-clock reception time.
        const t = parseMissionTimestamp(data[i]);
        if (t === null) continue;
        if (nextRealT !== null && t > nextRealT) {
            // Going forward from i → i+1 mission_time decreased = loop restart.
            cutoff = i + 1;
            break;
        }
        nextRealT = t;
    }
    return cutoff > 0 ? data.slice(cutoff) : data;
}

// Walks the raw data and inserts synthesized `_blackout: true` frames into
// any mission-time gap between consecutive real frames. This is what makes
// past outages visible after a page refresh: phantom frames are frontend-only
// and get wiped from Redux on reload, but the backend's real frames still
// carry the timing gap that proves the outage happened. We reconstruct
// phantoms from that gap so the chart's red ghost segment survives a refresh.
// Hard ceiling on phantoms synthesized for ONE gap (15 min at 1/s). A real
// outage longer than that still shows a long red segment; without a cap, a
// timestamp anomaly could ask for millions of phantoms and freeze the machine.
const MAX_PHANTOMS_PER_GAP = 900;

function reconstructOutages(data) {
    if (data.length < 2) return data;
    const out = [];
    let prevReal = null;
    for (const item of data) {
        if (!item._blackout && prevReal) {
            // Mission clock only (see parseMissionTimestamp) — frames without a
            // mission timestamp pass through but never define a gap.
            const prevT = parseMissionTimestamp(prevReal);
            const curT = parseMissionTimestamp(item);
            if (prevT !== null && curT !== null) {
                const gapSec = (curT - prevT) / 1000;
                // Gaps beyond MAX_PLAUSIBLE_ELAPSED_SEC (24 h) can't be a real
                // in-session outage — that's a corrupted mission time (e.g. a
                // bit-flipped year). No phantoms; the frame itself is dropped
                // later by the elapsed sanity check.
                if (gapSec > OUTAGE_GAP_THRESHOLD_SEC && gapSec <= MAX_PLAUSIBLE_ELAPSED_SEC) {
                    // Inject one phantom per missing second (minus the two real
                    // frames bracketing the gap). Phantoms inherit prevReal's
                    // values so the red ghost line stays at the last known Y.
                    const nPhantoms = Math.min(
                        Math.max(0, Math.floor(gapSec) - 1),
                        MAX_PHANTOMS_PER_GAP,
                    );
                    for (let i = 0; i < nPhantoms; i++) {
                        out.push({
                            ...prevReal,
                            _blackout: true,
                            _realOutage: true,
                            _synthesized: true,
                        });
                    }
                }
            }
        }
        out.push(item);
        if (!item._blackout) prevReal = item;
    }
    return out;
}

// A real frame whose elapsed time lands further than this from the epoch has a
// wrong/corrupted mission time (bit-flipped date, clock mixing…) — it is dropped
// from the charts rather than allowed to stretch the X axis by months (the
// "-479681 minutes" bug). 24 h comfortably covers any single session.
const MAX_PLAUSIBLE_ELAPSED_SEC = 24 * 3600;

export function buildTelemetryChartData(rawData = []) {
    const data = reconstructOutages(rawData);
    // Prefer _epoch_ms stamped at session start so the epoch stays fixed as the
    // display window slides (avoids X-axis plateau once 5000-frame window fills).
    // Both the stamp and the fallback are validated against the first MISSION
    // timestamp in the window: an epoch anchored on a corrupt frame (wall clock
    // instead of mission clock) would put every real frame months negative.
    let epochMs = null;
    if (data.length > 0) {
        let firstMissionTs = null;
        for (const item of data) {
            if (item._blackout) continue;
            firstMissionTs = parseMissionTimestamp(item);
            if (firstMissionTs !== null) break;
        }
        const stamped = Number.isFinite(data[0]._epoch_ms) ? data[0]._epoch_ms : null;
        const stampedSane = stamped !== null
            && firstMissionTs !== null
            && Math.abs(firstMissionTs - stamped) <= MAX_PLAUSIBLE_ELAPSED_SEC * 1000;
        epochMs = stampedSane ? stamped : firstMissionTs;
    }

    // Tracks the last real-frame elapsed time so blackout frames can advance
    // from it at +1 s per frame instead of using _received_at (wall-clock time
    // vs mission epoch = ~9-month delta = 40 000+ min jump).
    let lastRealElapsed = null;
    let blackoutCount = 0;
    // Accumulates the mission-time gap created by every blackout (frames arrived
    // at the backend during the pause are skipped as "lost packets"). Post-blackout
    // real frames subtract this offset so the X axis continues from where the
    // dashed line ended instead of jumping forward.
    let blackoutOffsetSec = 0;

    const out = [];
    // Last usable real frame — wrong-time frames are rendered as a red ghost
    // frozen at ITS values (same visual as an outage), never at their own
    // corrupt zeros.
    let lastRealItem = null;

    const pushRow = (item, elapsedSeconds, timeIndex) => {
        out.push({
            ...item,
            index: out.length,
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
        });
    };

    data.forEach((item, sourceIndex) => {
        const timeIndex = toTelemetryNumber(item.streamIndex, sourceIndex);
        if (item._blackout) {
            blackoutCount += 1;
            pushRow(item, (lastRealElapsed ?? 0) + blackoutCount, timeIndex);
            return;
        }

        let rawElapsed;
        if (epochMs !== null) {
            // A frame is UNUSABLE if its mission time is wrong (no timestamp, or
            // an elapsed so far from the epoch it can only be corruption) OR a
            // core value is physically impossible (altitude/speed out of range).
            // Either way it becomes a red GHOST frame frozen at the last good
            // values — never plotted as a real point that would spike the axis —
            // and the errors terminal flags it with the reason.
            const t = parseMissionTimestamp(item);
            const elapsed = t !== null ? (t - epochMs) / 1000 - blackoutOffsetSec : null;
            let badReason = null;
            if (elapsed === null || !Number.isFinite(elapsed)
                || Math.abs(elapsed) > MAX_PLAUSIBLE_ELAPSED_SEC) {
                badReason = 'wrong mission time';
            } else {
                badReason = implausibleValueReason(item);
            }
            if (badReason) {
                // No good frame yet to freeze on (corrupt frame opens the
                // window) — nothing meaningful to draw, skip it.
                if (!lastRealItem) return;
                blackoutCount += 1;
                pushRow(
                    { ...lastRealItem, _blackout: true, _badData: true, _badReason: badReason },
                    (lastRealElapsed ?? 0) + blackoutCount,
                    timeIndex,
                );
                return;
            }
            rawElapsed = elapsed;
        } else {
            rawElapsed = timeIndex * (TELEMETRY_STREAM_INTERVAL_MS / 1000);
        }
        // First real frame after blackout: pin it to (lastBlackoutElapsed + 1)
        // and roll the resulting offset into blackoutOffsetSec so subsequent
        // frames stay smooth.
        if (blackoutCount > 0) {
            const expected = (lastRealElapsed ?? 0) + blackoutCount + 1;
            blackoutOffsetSec += rawElapsed - expected;
            rawElapsed = expected;
        }
        blackoutCount = 0;
        lastRealElapsed = rawElapsed;
        lastRealItem = item;
        pushRow(item, rawElapsed, timeIndex);
    });
    return out;
}

