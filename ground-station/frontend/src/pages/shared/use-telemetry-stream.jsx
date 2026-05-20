import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    appendTelemetryPoint,
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
    parseTelemetryCsv,
    parseTelemetryProtobuf,
    readTextFile,
    TELEMETRY_MQTT_DISPLAY_POINTS,
    TELEMETRY_MQTT_FRAMES_URL,
    TELEMETRY_PROTOBUF_SOURCE_URL,
    TELEMETRY_SOURCE_URL,
    TELEMETRY_STREAM_INTERVAL_MS,
} from './telemetry-data-source.js';

// Auto-compute interval so a fresh playback lasts this many milliseconds.
const PLAYBACK_TARGET_MS = 60_000;

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

    // speedMsRef is what the running interval actually uses.
    // speedMs state is only for UI display — changing it does NOT recreate startStream.
    const speedMsRef = useRef(intervalMs);
    const [speedMs, _setSpeedMs] = useState(intervalMs);
    const [isPlaying, setIsPlaying] = useState(false);

    sourceDataRef.current = telemetry.sourceData;

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

    // MQTT live mode: poll every second and immediately replace telemetryData with
    // the latest window of frames — one dispatch, one render, no artificial delay.
    useEffect(() => {
        if (sourceMode !== 'mqtt') return;

        stopStream();
        dispatch(clearTelemetryData());

        const live = { shownCount: 0 };

        const poll = async () => {
            try {
                const response = await fetch(TELEMETRY_MQTT_FRAMES_URL, { cache: 'no-store' });
                if (!response.ok) return;
                const rows = parseTelemetryProtobuf(await response.arrayBuffer());

                if (rows.length === 0) {
                    if (live.shownCount > 0) {
                        live.shownCount = 0;
                        dispatch(clearTelemetryData());
                    }
                    return;
                }

                if (rows.length === live.shownCount) return;

                const receivedAt = Date.now();
                const stamped = rows.map((r, i) => ({
                    ...r, _received_at: receivedAt, streamIndex: i, sourceIndex: i,
                }));

                dispatch(setTelemetrySourceData(stamped));
                dispatch(setTelemetryData(stamped.slice(-TELEMETRY_MQTT_DISPLAY_POINTS)));
                dispatch(setPlaybackState({ playbackIndex: rows.length, streamIndex: rows.length }));
                live.shownCount = rows.length;
            } catch (_) { /* silent on network errors */ }
        };

        void poll();
        const pollId = setInterval(poll, 1000);

        return () => {
            clearInterval(pollId);
            dispatch(clearTelemetryData());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceMode, stopStream, dispatch]);

    const chartData = useMemo(() => buildTelemetryChartData(telemetry.telemetryData), [telemetry.telemetryData]);

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
    };
}
