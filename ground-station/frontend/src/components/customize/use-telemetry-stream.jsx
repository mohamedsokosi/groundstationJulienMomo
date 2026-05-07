import { useCallback, useEffect, useMemo, useRef } from 'react';
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
    TELEMETRY_PROTOBUF_SOURCE_URL,
    TELEMETRY_SOURCE_URL,
    TELEMETRY_STREAM_INTERVAL_MS,
} from './telemetry-data-source.js';

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
    const intervalRef = useRef(null);

    const stopStream = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const startStream = useCallback((rows, options = {}) => {
        const {
            playbackIndex = 0,
            streamIndex = 0,
        } = options;

        stopStream();

        if (!rows?.length) {
            dispatch(setLoading(false));
            return;
        }

        let currentIndex = playbackIndex;
        let currentStreamIndex = streamIndex;
        const maxPoints = getTelemetryStreamLimit(rows.length);

        const emitNextPoint = () => {
            const point = createTelemetryStreamPoint(rows, currentIndex, currentStreamIndex);

            if (!point) {
                return;
            }

            dispatch(appendTelemetryPoint({ point, maxPoints }));

            currentIndex = (currentIndex + 1) % rows.length;
            currentStreamIndex += 1;

            dispatch(setPlaybackState({
                playbackIndex: currentIndex,
                streamIndex: currentStreamIndex,
            }));
        };

        emitNextPoint();
        dispatch(setLoading(false));
        intervalRef.current = setInterval(emitNextPoint, intervalMs);
    }, [dispatch, intervalMs, stopStream]);

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
            dispatch(setPlaybackState({
                playbackIndex: 0,
                streamIndex: fullData.length,
            }));
            dispatch(setLoading(false));
            return;
        }

        startStream(rows, {
            playbackIndex: 0,
            streamIndex: 0,
        });
    }, [dispatch, startStream, stopStream]);

    const loadFromUrl = useCallback(async (url = sourceUrl, options = {}) => {
        dispatch(setLoading(true));

        const sources = url === TELEMETRY_SOURCE_URL
            ? [
                { url: TELEMETRY_PROTOBUF_SOURCE_URL, format: 'protobuf' },
                { url: TELEMETRY_SOURCE_URL, format: 'csv' },
            ]
            : [
                {
                    url,
                    format: url.toLowerCase().split('?')[0].endsWith('.pb') ? 'protobuf' : 'csv',
                },
            ];
        let lastError = null;

        for (const source of sources) {
            try {
                const response = await fetch(source.url, { cache: 'no-store' });

                if (!response.ok) {
                    throw new Error(`Telemetry source unavailable (${response.status}).`);
                }

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
        if (!file) {
            return;
        }

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

    useEffect(() => {
        if (!autoStart) {
            return stopStream;
        }

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
        // Intentionally omit telemetry playback state here to avoid restarting the stream on every tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart, loadFromUrl, sourceUrl, startStream, stopStream]);

    const chartData = useMemo(() => buildTelemetryChartData(telemetry.telemetryData), [telemetry.telemetryData]);

    return {
        data: telemetry.telemetryData,
        sourceData: telemetry.sourceData,
        chartData,
        loading: telemetry.loading,
        error: telemetry.error,
        hasData: telemetry.sourceData.length > 0 || telemetry.telemetryData.length > 0,
        latestPoint: telemetry.telemetryData[telemetry.telemetryData.length - 1] || null,
        loadRows,
        loadFromFile,
        loadFromUrl,
        stopStream,
    };
}
