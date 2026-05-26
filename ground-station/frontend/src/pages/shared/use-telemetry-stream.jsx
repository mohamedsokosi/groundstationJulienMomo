import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    appendTelemetryPoint,
    appendTelemetryPoints,
    clearTelemetryData,
    resetTelemetryStream,
    setError,
    setLoading,
    setPlaybackState,
    setTelemetryData,
    setTelemetryMode,
    setTelemetrySourceData,
} from './telemetry-slice.jsx';

import {
    buildTelemetryChartData,
    createTelemetryStreamPoint,
    getTelemetryStreamLimit,
    keepMonotonicSuffix,
    parseTelemetryCsv,
    parseTelemetryProtobuf,
    parseRowTimestamp,
    readTextFile,
    TELEMETRY_MQTT_DISPLAY_POINTS,
    TELEMETRY_MQTT_FRAMES_URL,
    TELEMETRY_PROTOBUF_SOURCE_URL,
    TELEMETRY_SOURCE_URL,
    TELEMETRY_STREAM_INTERVAL_MS,
} from './telemetry-data-source.js';
import { enrich } from './chart-logic.js';
// Vite-specific `?worker` import — bundles telemetry-worker.js as an ESM
// worker that we instantiate per hook lifetime.
import TelemetryWorker from './telemetry-worker.js?worker';

// Auto-compute interval so a fresh playback lasts this many milliseconds.
const PLAYBACK_TARGET_MS = 60_000;

// sessionStorage key — survives F5 / tab reload, NOT new windows. Persisting
// real frames is somewhat redundant (backend has them), but it's the only way
// to also persist the phantom blackout frames (frontend-only) so the red ghost
// line survives a refresh.
const MQTT_TELEMETRY_STORAGE_KEY = 'mqtt_telemetry_data_v1';
// Throttle window — save at most every N ms. NOT a debounce: under continuous
// 1 Hz MQTT updates a debounce would forever reset and never fire, leaving
// sessionStorage empty.
const MQTT_TELEMETRY_PERSIST_THROTTLE_MS = 2000;

const defaultTelemetryState = {
    telemetryData: [],
    sourceData: [],
    loading: false,
    error: null,
    playbackIndex: 0,
    streamIndex: 0,
    mode: 'stream',
};

export function useTelemetryStream({
    autoStart = true,
    sourceUrl = TELEMETRY_SOURCE_URL,
    intervalMs = TELEMETRY_STREAM_INTERVAL_MS,
} = {}) {
    const dispatch = useDispatch();
    const telemetry = useSelector((state) => state.telemetry || defaultTelemetryState);
    const sourceMode = useSelector((state) => state.telemetry?.sourceMode ?? 'csv');
    const intervalRef = useRef(null);
    const currentIndexRef = useRef(0);
    const currentStreamIndexRef = useRef(0);
    const sourceDataRef = useRef([]);
    const mqttPausedRef = useRef(false);
    // Tracks the highest streamIndex currently in telemetryData (updated every render).
    // The MQTT poll reads this to sync live.globalStreamIdx after a blackout, where
    // station-dashboard injects blackout frames with its own counter and advances
    // streamIndex past live.globalStreamIdx.
    const lastStreamIdxRef = useRef(-1);
    // When set, the next MQTT poll discards everything currently in the backend store
    // (treating it as "lost packets") and only dispatches frames received after this point.
    const skipMqttBacklogRef = useRef(false);
    const pauseMqtt = useCallback(() => { mqttPausedRef.current = true; }, []);
    const resumeMqtt = useCallback(() => {
        // Resuming from an actual pause (blackout) → discard the packets that arrived
        // during the pause so the chart continues from the end of the dashed line.
        if (mqttPausedRef.current) skipMqttBacklogRef.current = true;
        mqttPausedRef.current = false;
    }, []);

    // speedMsRef is what the running interval actually uses.
    // speedMs state is only for UI display — changing it does NOT recreate startStream.
    const speedMsRef = useRef(intervalMs);
    const [speedMs, _setSpeedMs] = useState(intervalMs);
    const [isPlaying, setIsPlaying] = useState(false);
    // Timestamp of the most recent real MQTT frame dispatched. Stays null until the
    // first frame arrives. Used internally for the auto-outage watchdog below.
    const [lastMqttFrameAt, setLastMqttFrameAt] = useState(null);
    // True while the MQTT broker has been silent past REAL_OUTAGE_THRESHOLD_MS
    // and we have data to keep extending. Drives the auto phantom-frame injection.
    const [autoOutageActive, setAutoOutageActive] = useState(false);
    // Fresh ref to the latest frame — used inside the injection setInterval which
    // doesn't restart per render.
    const lastFrameRef = useRef(null);

    sourceDataRef.current = telemetry.sourceData;
    lastStreamIdxRef.current = telemetry.telemetryData[telemetry.telemetryData.length - 1]?.streamIndex ?? -1;
    lastFrameRef.current = telemetry.telemetryData[telemetry.telemetryData.length - 1] ?? null;

    const stopStream = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPlaying(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // startStream no longer depends on speedMs — it reads speedMsRef.current at call time.
    // This keeps startStream stable so the useEffect below doesn't restart on every speed change.
    const startStream = useCallback((rows, options = {}) => {
        const { playbackIndex = 0, streamIndex = 0 } = options;

        stopStream();

        if (!rows?.length) {
            dispatch(setLoading(false));
            return;
        }

        currentIndexRef.current = playbackIndex;
        currentStreamIndexRef.current = streamIndex;
        const maxPoints = getTelemetryStreamLimit(rows.length);

        const emitNextPoint = () => {
            if (currentIndexRef.current >= rows.length) {
                stopStream();
                return;
            }

            const point = createTelemetryStreamPoint(rows, currentIndexRef.current, currentStreamIndexRef.current);
            if (!point) return;

            dispatch(appendTelemetryPoint({ point, maxPoints }));
            currentIndexRef.current += 1;
            currentStreamIndexRef.current += 1;
            dispatch(setPlaybackState({
                playbackIndex: currentIndexRef.current,
                streamIndex: currentStreamIndexRef.current,
            }));
        };

        emitNextPoint();
        dispatch(setLoading(false));
        setIsPlaying(true);
        intervalRef.current = setInterval(emitNextPoint, speedMsRef.current);
    }, [dispatch, stopStream]);

    // Public setter: updates both ref (for next interval) and state (for UI),
    // then restarts the running interval at the new speed.
    const setSpeedMs = useCallback((ms) => {
        speedMsRef.current = ms;
        _setSpeedMs(ms);
        const rows = sourceDataRef.current;
        if (intervalRef.current !== null && rows?.length) {
            startStream(rows, {
                playbackIndex: currentIndexRef.current,
                streamIndex: currentStreamIndexRef.current,
            });
        }
    }, [startStream]);

    const loadRows = useCallback((rows, options = {}) => {
        const { stream = true } = options;

        stopStream();
        dispatch(setTelemetrySourceData(rows));
        dispatch(resetTelemetryStream());
        dispatch(setTelemetryMode(stream ? 'stream' : 'static'));
        dispatch(setError(null));

        if (!rows.length) {
            dispatch(setLoading(false));
            return;
        }

        if (!stream) {
            const fullData = rows.map((row, index) => ({
                ...row,
                streamIndex: index,
                sourceIndex: index,
            }));
            dispatch(setTelemetryData(fullData));
            dispatch(setPlaybackState({ playbackIndex: 0, streamIndex: fullData.length }));
            dispatch(setLoading(false));
            return;
        }

        // Auto-compute interval so playback lasts ~PLAYBACK_TARGET_MS seconds.
        const targetMs = Math.max(50, Math.round(PLAYBACK_TARGET_MS / rows.length));
        speedMsRef.current = targetMs;
        _setSpeedMs(targetMs);

        startStream(rows, { playbackIndex: 0, streamIndex: 0 });
    }, [dispatch, startStream, stopStream]);

    const loadFromUrl = useCallback(async (url = sourceUrl, options = {}) => {
        dispatch(setLoading(true));

        const sources = url === TELEMETRY_SOURCE_URL
            ? [
                { url: TELEMETRY_PROTOBUF_SOURCE_URL, format: 'protobuf' },
                { url: TELEMETRY_SOURCE_URL, format: 'csv' },
            ]
            : [{ url, format: url.toLowerCase().split('?')[0].endsWith('.pb') ? 'protobuf' : 'csv' }];
        let lastError = null;

        for (const source of sources) {
            try {
                const response = await fetch(source.url, { cache: 'no-store' });
                if (!response.ok) throw new Error(`Telemetry source unavailable (${response.status}).`);

                const rows = source.format === 'protobuf'
                    ? parseTelemetryProtobuf(await response.arrayBuffer())
                    : parseTelemetryCsv(await response.text());

                loadRows(rows, options);
                return;
            } catch (error) {
                lastError = error;
            }
        }

        stopStream();
        dispatch(clearTelemetryData());
        dispatch(setLoading(false));
        dispatch(setError(lastError?.message || 'Failed to load telemetry data.'));
    }, [dispatch, loadRows, sourceUrl, stopStream]);

    const loadFromFile = useCallback(async (file, options = {}) => {
        if (!file) return;
        dispatch(setLoading(true));
        try {
            const text = await readTextFile(file);
            const rows = parseTelemetryCsv(text);
            loadRows(rows, options);
        } catch (error) {
            stopStream();
            dispatch(setLoading(false));
            dispatch(setError(error.message || 'Failed to read telemetry file.'));
        }
    }, [dispatch, loadRows, stopStream]);

    const pauseStream = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    const resumeStream = useCallback(() => {
        const rows = sourceDataRef.current;
        if (!rows?.length) return;
        startStream(rows, {
            playbackIndex: currentIndexRef.current,
            streamIndex: currentStreamIndexRef.current,
        });
    }, [startStream]);

    const seekTo = useCallback((percentage) => {
        const rows = sourceDataRef.current;
        if (!rows?.length) return;

        const wasPlaying = !!intervalRef.current;

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        const nextIndex = Math.min(
            rows.length - 1,
            Math.max(0, Math.round((percentage / 100) * (rows.length - 1)))
        );

        // Replace telemetryData with a clean window ending at nextIndex so charts
        // and terminal see consistent data instead of a jumbled append.
        const maxPoints = getTelemetryStreamLimit(rows.length);
        const startSrc = Math.max(0, nextIndex + 1 - maxPoints);
        const points = rows.slice(startSrc, nextIndex + 1).map((row, i) => ({
            ...row,
            streamIndex: startSrc + i,
            sourceIndex: startSrc + i,
        }));
        dispatch(setTelemetryData(points));

        if (wasPlaying) {
            // streamIndex = nextIndex + 1 avoids the collision guard in appendTelemetryPoint
            // (which resets telemetryData when streamIndex <= last.streamIndex).
            startStream(rows, { playbackIndex: nextIndex + 1, streamIndex: nextIndex + 1 });
        } else {
            currentIndexRef.current = nextIndex + 1;
            currentStreamIndexRef.current = nextIndex + 1;
            dispatch(setPlaybackState({ playbackIndex: nextIndex + 1, streamIndex: nextIndex + 1 }));
        }
    }, [dispatch, startStream]);

    const resetStream = useCallback(() => {
        const rows = sourceDataRef.current;
        currentIndexRef.current = 0;
        currentStreamIndexRef.current = 0;
        dispatch(resetTelemetryStream());
        if (rows?.length) {
            startStream(rows, { playbackIndex: 0, streamIndex: 0 });
        }
    }, [dispatch, startStream]);

    // CSV mode: load once and animate through records.
    useEffect(() => {
        if (sourceMode !== 'csv') return;
        if (!autoStart) return stopStream;

        if (telemetry.sourceData?.length > 0) {
            if (telemetry.mode === 'stream') {
                startStream(telemetry.sourceData, {
                    playbackIndex: telemetry.playbackIndex || 0,
                    streamIndex: telemetry.streamIndex || 0,
                });
            } else {
                dispatch(setLoading(false));
            }
        } else {
            void loadFromUrl(sourceUrl, { stream: true });
        }

        return stopStream;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart, sourceMode, loadFromUrl, sourceUrl, startStream, stopStream]);

    // MQTT live mode: poll every second and incrementally append new frames.
    // Uses content-based change detection to handle sliding-window deque (fixed-size backend store).
    useEffect(() => {
        if (sourceMode !== 'mqtt') return;

        stopStream();

        const rowKey = (rows) => {
            const r = rows[rows.length - 1];
            if (!r) return '';
            return `${r['m-time'] ?? r.m_time ?? ''}-${r.sequenceNumber ?? ''}-${r.U_Alt ?? ''}`;
        };
        const rowKeyOf = (r) => (!r ? '' : `${r['m-time'] ?? r.m_time ?? ''}-${r.sequenceNumber ?? ''}-${r.U_Alt ?? ''}`);

        // Route-change resume: if MQTT-shaped data already exists in Redux (because
        // a previous mount of this hook on another page populated it), pick up
        // where we left off instead of clearing + reloading. Without this, switching
        // pages would wipe the chart and reset all chart-logic accumulators (epoch,
        // blackout offset, phantom frames), and the operator would see a blank
        // canvas every time they navigate.
        let existingData = telemetry.telemetryData || [];

        // Page-refresh resume: phantom blackout frames are frontend-only and
        // would otherwise vanish on F5. `reconstructOutages` re-derives them
        // from backend gaps, but only when the bracketing real frames are still
        // in the 5000-frame backend deque. We persist `telemetryData` to
        // sessionStorage so the phantoms — and the current session's epoch —
        // survive a refresh even when the backend deque has rolled past the
        // outage. The MQTT effect's resume path (shownCount=-1) then catches
        // up with whatever the backend has accumulated since.
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
            } catch (_) { /* corrupt storage — ignore, fall back to clean load */ }
        }

        const isMqttShape = existingData.length > 0 && existingData[0]._epoch_ms !== undefined;
        if (existingData.length > 0 && !isMqttShape) {
            // Foreign data (e.g., CSV) lingering from a previous sourceMode — flush it.
            dispatch(clearTelemetryData());
            setLastMqttFrameAt(null);
        }

        // Find the last REAL (non-blackout) frame so we can re-anchor `lastRowKey`
        // against the backend on the resume poll.
        let lastReal = null;
        if (isMqttShape) {
            for (let i = existingData.length - 1; i >= 0; i--) {
                if (!existingData[i]._blackout) { lastReal = existingData[i]; break; }
            }
        }

        // Derive globalStreamIdx from existingData directly. lastStreamIdxRef
        // is updated during render against Redux state — on F5, Redux is
        // empty at render time and `dispatch(setTelemetryData(parsed))` happens
        // INSIDE this effect, AFTER the ref has been read. Reading the ref
        // here would give -1, the first incremental dispatch would assign
        // streamIndex=0, and appendTelemetryPoints' collision guard
        // (`streamIndex <= last.streamIndex`) would wipe everything — restored
        // phantoms included — because the restored last frame has a much
        // higher streamIndex from the previous session.
        const lastRestoredStreamIdx = existingData[existingData.length - 1]?.streamIndex ?? -1;
        const live = isMqttShape
            ? {
                // Sentinel: the first poll will search the backend for `lastRowKey`
                // and resume incrementally; if it can't find it (deque has rolled
                // past us), it falls back to a clean initial load.
                shownCount: -1,
                lastRowKey: rowKeyOf(lastReal),
                globalStreamIdx: lastRestoredStreamIdx + 1,
                epochMs: existingData[0]._epoch_ms ?? null,
            }
            : { shownCount: 0, lastRowKey: '', globalStreamIdx: 0, epochMs: null };

        // Cancels late dispatches: if this hook instance has been unmounted
        // (route change), any in-flight poll's await would otherwise resolve and
        // dispatch frames with the OLD hook's `live.globalStreamIdx`, leaving
        // Redux ahead of the new hook's counter. The next dispatch from the new
        // hook would then trip appendTelemetryPoints' collision guard
        // (streamIndex <= last.streamIndex) and wipe telemetryData entirely —
        // user-visible as "lines erased after switching pages".
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

                // Resume after route change: find our last real row in the backend
                // and dispatch only the rows that came after it. Phantom blackout
                // frames already in Redux are preserved as-is.
                if (live.shownCount === -1) {
                    const idx = live.lastRowKey
                        ? rows.findIndex((r) => rowKeyOf(r) === live.lastRowKey)
                        : -1;
                    if (idx === -1) {
                        // Backend deque has rolled past our anchor (or our
                        // restored data is all phantoms with no real-frame
                        // anchor). DO NOT clearTelemetryData — that would wipe
                        // the restored phantoms and erase the red lines the
                        // operator was seeing pre-refresh. Instead merge by
                        // mission_time: keep the restored data and append any
                        // backend frames whose mission_time is newer than our
                        // most recent restored real frame.
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
                            // Defensive sync: if Redux is somehow ahead of our
                            // captured counter (e.g., another concurrent mount),
                            // skip past it so we don't trip the collision guard.
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

                // Resuming from a blackout: mark whatever piled up in the backend store
                // as already-seen without dispatching it. Those frames are "lost packets".
                // The next poll will dispatch only genuinely new frames received after now.
                if (skipMqttBacklogRef.current) {
                    skipMqttBacklogRef.current = false;
                    live.shownCount = rows.length;
                    live.lastRowKey = key;
                    if (lastStreamIdxRef.current >= live.globalStreamIdx) {
                        live.globalStreamIdx = lastStreamIdxRef.current + 1;
                    }
                    return;
                }

                // Backend store was cleared/restarted
                if (rows.length < live.shownCount) {
                    live.shownCount = 0;
                    live.lastRowKey = '';
                    live.globalStreamIdx = 0;
                    dispatch(clearTelemetryData());
                }

                // No change: same count AND same last-row fingerprint.
                // Checking count alone misses the sliding-window case where the backend deque
                // is full — count stays at 5000 while one old frame is evicted and one new arrives.
                if (rows.length === live.shownCount && key === live.lastRowKey) return;

                const receivedAt = Date.now();

                if (live.shownCount === 0) {
                    // Initial load: drop any tail from a previous Pico loop
                    // cycle (mission_time goes backward when the firmware
                    // restarts its CSV). Without this slice, a refresh would
                    // show the X axis zigzagging because the deque contains
                    // frames from two cycles with the epoch pinned to the
                    // first (older) one.
                    const sliced = keepMonotonicSuffix(rows);
                    // Fix the session epoch from the first kept frame's mission time.
                    // All subsequent frames carry this same _epoch_ms so the X-axis origin stays
                    // stable even after the 5000-frame display window starts sliding.
                    live.epochMs = parseRowTimestamp(sliced[0]) ?? receivedAt;
                    const stamped = sliced.map((r, i) => ({
                        ...r, _received_at: receivedAt, _epoch_ms: live.epochMs,
                        streamIndex: live.globalStreamIdx + i,
                    }));
                    live.globalStreamIdx += sliced.length;
                    // shownCount tracks BACKEND row count so the next poll's
                    // delta math is correct, even though we dispatched a subset.
                    dispatch(setTelemetryData(stamped.slice(-TELEMETRY_MQTT_DISPLAY_POINTS)));
                    setLastMqttFrameAt(receivedAt);
                } else {
                    // Sync in case blackout frames were injected while the poll was paused:
                    // those frames advance streamIndex past live.globalStreamIdx, and the
                    // collision guard would otherwise wipe telemetryData on resume.
                    if (lastStreamIdxRef.current >= live.globalStreamIdx) {
                        live.globalStreamIdx = lastStreamIdxRef.current + 1;
                    }
                    // Incremental: only dispatch genuinely new rows.
                    // Growing phase: new rows appended at end of deque.
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
        // data lets a subsequent mount of this hook (e.g., navigating back to
        // /station from /analyse) resume from where we left off via the
        // shownCount=-1 path above instead of wiping the chart.
        return () => {
            isMounted = false;
            clearInterval(pollId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceMode, stopStream, dispatch]);

    // Persist MQTT telemetryData to sessionStorage so a page refresh restores
    // phantom blackout frames — they live only in Redux and would otherwise
    // vanish on F5, even if the backend deque still has the bracketing real
    // frames (reconstructOutages handles that case) and especially when it
    // doesn't (long outage, deque rolled past).
    //
    // Throttled (NOT debounced): under continuous 1 Hz MQTT updates a debounce
    // would forever reset its timer and never fire. Throttle saves at most
    // every MQTT_TELEMETRY_PERSIST_THROTTLE_MS but ALSO schedules a trailing
    // save so the latest data is persisted within that window even if updates
    // stop. A `beforeunload` listener flushes the very latest snapshot right
    // before the browser tears down the page.
    const lastPersistAtRef = useRef(0);
    const dataRef = useRef(telemetry.telemetryData);
    dataRef.current = telemetry.telemetryData;
    // Tracks whether we've EVER had non-empty data in this hook instance.
    // Used to gate sessionStorage wipes — on initial mount (Redux still empty
    // before the restore dispatch flushes through to useSelector), the persist
    // effect would otherwise see `[]` and immediately remove the saved data
    // that the MQTT effect just read. Only wipe when data was previously
    // non-empty AND has now been explicitly cleared.
    const hasHadDataRef = useRef(false);

    useEffect(() => {
        if (sourceMode !== 'mqtt') return;
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
                // else: data is empty AND was never populated this session —
                // do nothing, so a stale-but-valid sessionStorage entry survives
                // for the MQTT effect to restore.
            } catch (_) {
                // QuotaExceeded — fall back to reconstructOutages.
            }
        };

        const sinceLast = Date.now() - lastPersistAtRef.current;
        let timer;
        if (sinceLast >= MQTT_TELEMETRY_PERSIST_THROTTLE_MS) {
            persistNow();
        } else {
            timer = setTimeout(persistNow, MQTT_TELEMETRY_PERSIST_THROTTLE_MS - sinceLast);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [telemetry.telemetryData, sourceMode]);

    // Flush the latest snapshot right before the browser unloads the page so
    // the very last seconds of telemetry (including any phantoms injected
    // since the last throttled save) make it into sessionStorage.
    useEffect(() => {
        if (sourceMode !== 'mqtt') return;
        if (typeof window === 'undefined') return;
        const flush = () => {
            try {
                const d = dataRef.current;
                if (d?.length) sessionStorage.setItem(MQTT_TELEMETRY_STORAGE_KEY, JSON.stringify(d));
            } catch (_) { /* ignore */ }
        };
        window.addEventListener('beforeunload', flush);
        return () => window.removeEventListener('beforeunload', flush);
    }, [sourceMode]);

    // Offload buildTelemetryChartData + enrich to a Web Worker so a 5000-frame
    // rebuild doesn't stall Cesium animation or Recharts. The hook keeps a
    // single worker instance per mount; each telemetryData change posts a
    // request with an incrementing requestId so stale results (the worker took
    // longer than the next dispatch) are discarded.
    const workerRef = useRef(null);
    const workerRequestIdRef = useRef(0);
    const [workerChartData, setWorkerChartData] = useState(null);
    const hasWorker = typeof Worker !== 'undefined';

    useEffect(() => {
        if (!hasWorker) return; // SSR / unsupported — synchronous fallback below
        const w = new TelemetryWorker();
        w.onmessage = (e) => {
            const { chartData, requestId } = e.data || {};
            // Discard stale results — only the latest request reflects current state.
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
        // structured clone of the data array — for 5000 small objects this is
        // cheap (sub-ms in modern browsers) compared to the buildTelemetryChartData
        // walk + enrich loop it replaces on the main thread.
        workerRef.current.postMessage({ data: telemetry.telemetryData, requestId: id });
    }, [telemetry.telemetryData]);

    // chartData resolution priority:
    //   1. Latest worker result (normal operating mode after first response).
    //   2. Synchronous main-thread compute, but ONLY when Worker is unavailable
    //      (SSR, jsdom tests, ancient browsers). Doing this in the supported
    //      path would defeat the purpose — we'd pay the full build+enrich cost
    //      on the main thread before the worker had a chance to respond.
    //   3. Empty array — brief (~tens of ms) gap on initial mount until the
    //      first worker response arrives. Charts render empty for that window
    //      then snap to the worker result.
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
    // every consumer (/station, /analyse, /vueGlobe3d…) gets the red ghost line
    // when the Pi/broker goes silent, without each page reimplementing the
    // watchdog. Skipped while mqttPausedRef is true — that means a manual
    // blackout simulation is active and its owner (station-dashboard) is
    // injecting its own phantom frames with _realOutage: false.
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
            if (mqttPausedRef.current) return; // manual blackout owns injection
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
        sourceData: telemetry.sourceData,
        chartData,
        loading: telemetry.loading,
        error: telemetry.error,
        hasData: telemetry.sourceData.length > 0 || telemetry.telemetryData.length > 0,
        latestPoint: telemetry.telemetryData[telemetry.telemetryData.length - 1] || null,
        playbackIndex: telemetry.playbackIndex,
        isPlaying,
        speedMs,
        sourceMode,
        setSpeedMs,
        loadRows,
        loadFromFile,
        loadFromUrl,
        stopStream,
        pauseStream,
        resumeStream,
        seekTo,
        resetStream,
        pauseMqtt,
        resumeMqtt,
        lastMqttFrameAt,
        autoOutageActive,
    };
}
