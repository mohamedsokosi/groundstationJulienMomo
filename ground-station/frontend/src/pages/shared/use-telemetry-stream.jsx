import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    appendTelemetryPoint,
    appendTelemetryPoints,
    clearTelemetryData,
    setPlaybackState,
    setTelemetryData,
} from './telemetry-slice.jsx';

import {
    buildTelemetryChartData,
    keepMonotonicSuffix,
    parseTelemetryProtobuf,
    parseRowTimestamp,
    TELEMETRY_MQTT_DISPLAY_POINTS,
    TELEMETRY_MQTT_FRAMES_URL,
} from './telemetry-data-source.js';
import { enrich } from './chart-logic.js';
import TelemetryWorker from './telemetry-worker.js?worker';

const MQTT_TELEMETRY_STORAGE_KEY = 'mqtt_telemetry_data_v1';
const MQTT_TELEMETRY_PERSIST_THROTTLE_MS = 2000;

const defaultTelemetryState = {
    telemetryData: [],
    loading: false,
    error: null,
    playbackIndex: 0,
    streamIndex: 0,
};

export function useTelemetryStream() {
    const dispatch = useDispatch();
    const telemetry = useSelector((state) => state.telemetry || defaultTelemetryState);
    const mqttPausedRef = useRef(false);
    const lastStreamIdxRef = useRef(-1);
    const skipMqttBacklogRef = useRef(false);
    const pauseMqtt = useCallback(() => { mqttPausedRef.current = true; }, []);
    const resumeMqtt = useCallback(() => {
        if (mqttPausedRef.current) skipMqttBacklogRef.current = true;
        mqttPausedRef.current = false;
    }, []);

    const [lastMqttFrameAt, setLastMqttFrameAt] = useState(null);
    const [autoOutageActive, setAutoOutageActive] = useState(false);
    const lastFrameRef = useRef(null);

    lastStreamIdxRef.current = telemetry.telemetryData[telemetry.telemetryData.length - 1]?.streamIndex ?? -1;
    lastFrameRef.current = telemetry.telemetryData[telemetry.telemetryData.length - 1] ?? null;

    // Poll MQTT frames every second; resume from Redux or sessionStorage on mount.
    useEffect(() => {
        const rowKey = (rows) => {
            const r = rows[rows.length - 1];
            if (!r) return '';
            return `${r['m-time'] ?? r.m_time ?? ''}-${r.sequenceNumber ?? ''}-${r.U_Alt ?? ''}`;
        };
        const rowKeyOf = (r) => (!r ? '' : `${r['m-time'] ?? r.m_time ?? ''}-${r.sequenceNumber ?? ''}-${r.U_Alt ?? ''}`);

        let existingData = telemetry.telemetryData || [];

        // Page-refresh resume: restore phantom blackout frames from sessionStorage.
        if (existingData.length === 0 && typeof sessionStorage !== 'undefined') {
            try {
                const saved = sessionStorage.getItem(MQTT_TELEMETRY_STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0
                        && parsed[0]._epoch_ms !== undefined) {
                        existingData = parsed;
                        dispatch(setTelemetryData(parsed));
                        const lastRecv = parsed[parsed.length - 1]?._received_at;
                        if (Number.isFinite(lastRecv)) setLastMqttFrameAt(lastRecv);
                    }
                }
            } catch (_) { /* corrupt storage — ignore */ }
        }

        const isMqttShape = existingData.length > 0 && existingData[0]._epoch_ms !== undefined;
        if (existingData.length > 0 && !isMqttShape) {
            dispatch(clearTelemetryData());
            setLastMqttFrameAt(null);
        }

        let lastReal = null;
        if (isMqttShape) {
            for (let i = existingData.length - 1; i >= 0; i--) {
                if (!existingData[i]._blackout) { lastReal = existingData[i]; break; }
            }
        }

        // Derive globalStreamIdx from existingData directly — lastStreamIdxRef is
        // read during render against Redux state, which is empty on F5 before the
        // restore dispatch above takes effect.
        const lastRestoredStreamIdx = existingData[existingData.length - 1]?.streamIndex ?? -1;
        const live = isMqttShape
            ? {
                shownCount: -1,
                lastRowKey: rowKeyOf(lastReal),
                globalStreamIdx: lastRestoredStreamIdx + 1,
                epochMs: existingData[0]._epoch_ms ?? null,
            }
            : { shownCount: 0, lastRowKey: '', globalStreamIdx: 0, epochMs: null };

        let isMounted = true;

        const poll = async () => {
            if (mqttPausedRef.current) return;
            try {
                const response = await fetch(TELEMETRY_MQTT_FRAMES_URL, { cache: 'no-store' });
                if (!isMounted || !response.ok) return;
                const rows = parseTelemetryProtobuf(await response.arrayBuffer());
                if (!isMounted) return;

                if (rows.length === 0) {
                    if (live.shownCount > 0) {
                        live.shownCount = 0;
                        live.lastRowKey = '';
                        live.globalStreamIdx = 0;
                        dispatch(clearTelemetryData());
                        setLastMqttFrameAt(null);
                    }
                    return;
                }

                const key = rowKey(rows);

                // Route-change resume: find our last real row in the backend deque
                // and dispatch only the rows that came after it.
                if (live.shownCount === -1) {
                    const idx = live.lastRowKey
                        ? rows.findIndex((r) => rowKeyOf(r) === live.lastRowKey)
                        : -1;
                    if (idx === -1) {
                        // Backend deque has rolled past our anchor — merge by mission_time
                        // to preserve existing phantom frames.
                        let maxRestoredT = null;
                        for (let i = existingData.length - 1; i >= 0; i--) {
                            if (existingData[i]._blackout) continue;
                            const t = parseRowTimestamp(existingData[i]);
                            if (t !== null) { maxRestoredT = t; break; }
                        }
                        const receivedAt = Date.now();
                        const newerRows = maxRestoredT !== null
                            ? rows.filter((r) => {
                                const t = parseRowTimestamp(r);
                                return t !== null && t > maxRestoredT;
                            })
                            : rows;
                        if (newerRows.length > 0) {
                            if (lastStreamIdxRef.current >= live.globalStreamIdx) {
                                live.globalStreamIdx = lastStreamIdxRef.current + 1;
                            }
                            const newFrames = newerRows.map((row) => ({
                                ...row, _received_at: receivedAt, _epoch_ms: live.epochMs,
                                streamIndex: live.globalStreamIdx++,
                            }));
                            dispatch(appendTelemetryPoints({
                                points: newFrames,
                                maxPoints: TELEMETRY_MQTT_DISPLAY_POINTS,
                            }));
                            setLastMqttFrameAt(receivedAt);
                        }
                        live.shownCount = rows.length;
                        live.lastRowKey = key;
                        dispatch(setPlaybackState({ playbackIndex: rows.length, streamIndex: live.globalStreamIdx }));
                        return;
                    } else {
                        const receivedAt = Date.now();
                        const newRows = rows.slice(idx + 1);
                        if (newRows.length > 0) {
                            if (lastStreamIdxRef.current >= live.globalStreamIdx) {
                                live.globalStreamIdx = lastStreamIdxRef.current + 1;
                            }
                            const newFrames = newRows.map((row) => ({
                                ...row, _received_at: receivedAt, _epoch_ms: live.epochMs,
                                streamIndex: live.globalStreamIdx++,
                            }));
                            dispatch(appendTelemetryPoints({
                                points: newFrames,
                                maxPoints: TELEMETRY_MQTT_DISPLAY_POINTS,
                            }));
                            setLastMqttFrameAt(receivedAt);
                        }
                        live.shownCount = rows.length;
                        live.lastRowKey = key;
                        dispatch(setPlaybackState({ playbackIndex: rows.length, streamIndex: live.globalStreamIdx }));
                        return;
                    }
                }

                // Resuming from a blackout: mark piled-up backend frames as already-seen
                // without dispatching them (simulated lost packets).
                if (skipMqttBacklogRef.current) {
                    skipMqttBacklogRef.current = false;
                    live.shownCount = rows.length;
                    live.lastRowKey = key;
                    if (lastStreamIdxRef.current >= live.globalStreamIdx) {
                        live.globalStreamIdx = lastStreamIdxRef.current + 1;
                    }
                    return;
                }

                // Backend store was cleared/restarted.
                if (rows.length < live.shownCount) {
                    live.shownCount = 0;
                    live.lastRowKey = '';
                    live.globalStreamIdx = 0;
                    dispatch(clearTelemetryData());
                }

                // No change: same count AND same last-row fingerprint.
                if (rows.length === live.shownCount && key === live.lastRowKey) return;

                const receivedAt = Date.now();

                if (live.shownCount === 0) {
                    // Initial load: drop any tail from a previous Pico loop cycle
                    // (mission_time goes backward when the firmware restarts its CSV).
                    const sliced = keepMonotonicSuffix(rows);
                    live.epochMs = parseRowTimestamp(sliced[0]) ?? receivedAt;
                    const stamped = sliced.map((r, i) => ({
                        ...r, _received_at: receivedAt, _epoch_ms: live.epochMs,
                        streamIndex: live.globalStreamIdx + i,
                    }));
                    live.globalStreamIdx += sliced.length;
                    dispatch(setTelemetryData(stamped.slice(-TELEMETRY_MQTT_DISPLAY_POINTS)));
                    setLastMqttFrameAt(receivedAt);
                } else {
                    // Sync in case blackout frames advanced streamIndex past our counter.
                    if (lastStreamIdxRef.current >= live.globalStreamIdx) {
                        live.globalStreamIdx = lastStreamIdxRef.current + 1;
                    }
                    // Incremental: dispatch only genuinely new rows.
                    // Sliding window: deque full — 1 old evicted, 1 new at end.
                    const newCount = rows.length > live.shownCount
                        ? rows.length - live.shownCount
                        : 1;
                    const newFrames = rows.slice(-newCount).map((row) => ({
                        ...row, _received_at: receivedAt, _epoch_ms: live.epochMs,
                        streamIndex: live.globalStreamIdx++,
                    }));
                    if (newFrames.length > 0) {
                        dispatch(appendTelemetryPoints({
                            points: newFrames,
                            maxPoints: TELEMETRY_MQTT_DISPLAY_POINTS,
                        }));
                        setLastMqttFrameAt(receivedAt);
                    }
                }

                dispatch(setPlaybackState({ playbackIndex: rows.length, streamIndex: live.globalStreamIdx }));
                live.shownCount = rows.length;
                live.lastRowKey = key;
            } catch (_) { /* silent on network errors */ }
        };

        void poll();
        const pollId = setInterval(poll, 1000);

        // Cleanup: clear ONLY the timer, NOT the Redux telemetry data. Keeping
        // data lets subsequent mounts (route changes) resume via shownCount=-1.
        return () => {
            isMounted = false;
            clearInterval(pollId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch]);

    // Persist telemetryData to sessionStorage (throttled) so phantom blackout
    // frames survive a page refresh — they live only in Redux and would otherwise
    // vanish on F5.
    const lastPersistAtRef = useRef(0);
    const dataRef = useRef(telemetry.telemetryData);
    dataRef.current = telemetry.telemetryData;
    const hasHadDataRef = useRef(false);

    useEffect(() => {
        if (typeof sessionStorage === 'undefined') return;

        const persistNow = () => {
            lastPersistAtRef.current = Date.now();
            try {
                const d = dataRef.current;
                if (d?.length) {
                    sessionStorage.setItem(MQTT_TELEMETRY_STORAGE_KEY, JSON.stringify(d));
                    hasHadDataRef.current = true;
                } else if (hasHadDataRef.current) {
                    sessionStorage.removeItem(MQTT_TELEMETRY_STORAGE_KEY);
                    hasHadDataRef.current = false;
                }
            } catch (_) { /* QuotaExceeded — fall back to reconstructOutages */ }
        };

        const sinceLast = Date.now() - lastPersistAtRef.current;
        let timer;
        if (sinceLast >= MQTT_TELEMETRY_PERSIST_THROTTLE_MS) {
            persistNow();
        } else {
            timer = setTimeout(persistNow, MQTT_TELEMETRY_PERSIST_THROTTLE_MS - sinceLast);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [telemetry.telemetryData]);

    // Flush latest snapshot right before the browser unloads.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const flush = () => {
            try {
                const d = dataRef.current;
                if (d?.length) sessionStorage.setItem(MQTT_TELEMETRY_STORAGE_KEY, JSON.stringify(d));
            } catch (_) { /* ignore */ }
        };
        window.addEventListener('beforeunload', flush);
        return () => window.removeEventListener('beforeunload', flush);
    }, []);

    // Offload buildTelemetryChartData + enrich to a Web Worker.
    const workerRef = useRef(null);
    const workerRequestIdRef = useRef(0);
    const [workerChartData, setWorkerChartData] = useState(null);
    const hasWorker = typeof Worker !== 'undefined';

    useEffect(() => {
        if (!hasWorker) return;
        const w = new TelemetryWorker();
        w.onmessage = (e) => {
            const { chartData, requestId } = e.data || {};
            if (requestId !== workerRequestIdRef.current) return;
            setWorkerChartData(chartData);
        };
        workerRef.current = w;
        return () => {
            workerRef.current = null;
            w.terminate();
        };
    }, [hasWorker]);

    useEffect(() => {
        if (!workerRef.current) return;
        const id = ++workerRequestIdRef.current;
        workerRef.current.postMessage({ data: telemetry.telemetryData, requestId: id });
    }, [telemetry.telemetryData]);

    const chartData = useMemo(() => {
        if (workerChartData !== null) return workerChartData;
        if (!hasWorker) {
            const built = buildTelemetryChartData(telemetry.telemetryData);
            for (const row of built) enrich(row);
            return built;
        }
        return [];
    }, [telemetry.telemetryData, workerChartData, hasWorker]);

    // Auto real-outage detection + phantom-frame injection. Centralized here so
    // every consumer (/station, /analyse, /vueGlobe3d…) gets the red ghost line.
    const REAL_OUTAGE_THRESHOLD_MS = 3000;
    useEffect(() => {
        if (!lastMqttFrameAt) {
            setAutoOutageActive(false);
            return;
        }
        const tick = () => {
            const stale = Date.now() - lastMqttFrameAt > REAL_OUTAGE_THRESHOLD_MS;
            setAutoOutageActive((prev) => (prev === stale ? prev : stale));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [lastMqttFrameAt]);

    useEffect(() => {
        if (!autoOutageActive) return;
        const id = setInterval(() => {
            if (mqttPausedRef.current) return;
            const base = lastFrameRef.current;
            if (!base) return;
            dispatch(appendTelemetryPoint({
                point: {
                    ...base,
                    _blackout: true,
                    _realOutage: true,
                    _received_at: Date.now(),
                    'm-time': undefined,
                    'm_time': undefined,
                    'Ublox UTC': undefined,
                    'Ublox_UTC': undefined,
                    gnssTimeUtc: undefined,
                    streamIndex: (base.streamIndex ?? 0) + 1,
                },
                maxPoints: TELEMETRY_MQTT_DISPLAY_POINTS,
            }));
        }, 1000);
        return () => clearInterval(id);
    }, [autoOutageActive, dispatch]);

    return {
        data: telemetry.telemetryData,
        chartData,
        loading: telemetry.loading,
        error: telemetry.error,
        hasData: telemetry.telemetryData.length > 0,
        latestPoint: telemetry.telemetryData[telemetry.telemetryData.length - 1] || null,
        pauseMqtt,
        resumeMqtt,
        lastMqttFrameAt,
        autoOutageActive,
    };
}
