/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    getTelemetryNumber,
    isTelemetryNumericHeader,
    normalizeTelemetryHeader,
    toTelemetryNumber,
    distanceKm,
} from './telemetry-utils.js';
import {
    parseTelemetryProtobuf,
    TELEMETRY_PROTOBUF_SOURCE_URL,
    TELEMETRY_SOURCE_URL,
} from './telemetry-data-source.js';
import { getTelemetryRecordGeo } from './cesium-utils.js';
import { CesiumViewport } from './CesiumViewport.jsx';
import { TelemetryStatsBar } from './TelemetryStatsBar.jsx';
import './ground-station-view.css';

const TELEMETRY_ENDPOINTS = [
    { url: TELEMETRY_PROTOBUF_SOURCE_URL, format: 'protobuf' },
    { url: TELEMETRY_SOURCE_URL, format: 'csv' },
    { url: '/telemetry.csv', format: 'csv' },
];
const TELEMETRY_POLL_INTERVAL_MS = 2000;
const MQTT_STATUS_URL = '/api/telemetry/mqtt/status';
const MQTT_STATUS_POLL_INTERVAL_MS = 2000;

const withTelemetryCacheBuster = (endpoint) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}_=${Date.now()}`;
};

const getTelemetryPayloadSignature = (payload, format) => {
    if (format !== 'protobuf') return `${format}:${payload}`;
    const bytes = new Uint8Array(payload);
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i += 1) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 16777619);
    }
    return `${format}:${bytes.byteLength}:${hash >>> 0}`;
};

const getTelemetryRowIdentity = (record = {}) => [
    record.sequenceNumber ?? record.sequence_number ?? '',
    record['m-time'] ?? record.m_time ?? '',
    record.U_Lat ?? record['U Lat'] ?? '',
    record.U_Long ?? record['U Long'] ?? '',
    record.U_Alt ?? record['U Alt'] ?? '',
].join('|');

const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map((line, rowIndex) => {
        const values = line.split(',').map(v => v.trim());
        const obj = { streamIndex: rowIndex };
        headers.forEach((header, index) => {
            const value = values[index];
            const parsedValue = isTelemetryNumericHeader(header)
                ? toTelemetryNumber(value)
                : value ?? '';
            const normalizedHeader = normalizeTelemetryHeader(header);
            obj[header] = parsedValue;
            obj[normalizedHeader] = parsedValue;
        });
        return obj;
    });
};

const formatClock = (value, fallback) => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const getRecordClock = (record, fallback) =>
    formatClock(record?.['m-time'] || record?.m_time || record?.['Ublox UTC'] || record?.Ublox_UTC, fallback);

const TimelineControls = ({ currentLabel, endLabel, isPlaying, onReset, onSeek, onSpeedChange, onTogglePlay, progress, speedMs, startLabel }) => (
    <footer className="gs-timeline" aria-label="Timeline player">
        <button className="gs-play-button" onClick={onTogglePlay} type="button">
            {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <button className="gs-reset-button" onClick={onReset} type="button" aria-label="Reset timeline">
            RESET
        </button>
        <span className="gs-timecode">{startLabel}</span>
        <input
            className="gs-range"
            max="100"
            min="0"
            onChange={(e) => onSeek(Number(e.target.value))}
            type="range"
            value={progress}
            aria-label="Pass timeline"
        />
        <span className="gs-timecode">{currentLabel || endLabel}</span>
        <select
            className="gs-speed-select"
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            value={speedMs}
            aria-label="Vitesse lecture"
        >
            <option value={500}>500ms</option>
            <option value={250}>250ms</option>
            <option value={60}>60ms</option>
        </select>
    </footer>
);

export default function TelemetryDashboard() {
    const [sourceData, setSourceData] = useState([]);
    const [data, setData] = useState([]);
    const [hasData, setHasData] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);
    const [loading, setLoading] = useState(true);
    const [mqttStatus, setMqttStatus] = useState(null);
    const [speedMs, setSpeedMs] = useState(500);
    const [mapOptions, setMapOptions] = useState({ follow: false, trajectory: true, linkBeam: true });
    const sourceIndexRef = useRef(0);
    const sourceRowsLengthRef = useRef(0);
    const streamIndexRef = useRef(0);
    const telemetryEndpointRef = useRef(null);
    const telemetryPayloadRef = useRef({ signature: '', text: '', lastRowIdentity: '' });

    useEffect(() => {
        let isMounted = true;
        let pollInterval = null;

        const loadTelemetry = async ({ initial = false } = {}) => {
            const activeEndpoint = telemetryEndpointRef.current;
            const endpoints = activeEndpoint
                ? [activeEndpoint, ...TELEMETRY_ENDPOINTS.filter(e => e.url !== activeEndpoint.url)]
                : TELEMETRY_ENDPOINTS;

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(withTelemetryCacheBuster(endpoint.url), { cache: 'no-store' });
                    if (!response.ok) continue;

                    const payload = endpoint.format === 'protobuf'
                        ? await response.arrayBuffer()
                        : await response.text();

                    if (!isMounted) return;

                    telemetryEndpointRef.current = endpoint;
                    const payloadSignature = getTelemetryPayloadSignature(payload, endpoint.format);
                    const previousPayload = telemetryPayloadRef.current;

                    if (payloadSignature === previousPayload.signature) {
                        setLoading(false);
                        return;
                    }

                    const previousLength = sourceRowsLengthRef.current;
                    const parsedData = endpoint.format === 'protobuf'
                        ? parseTelemetryProtobuf(payload)
                        : parseCSV(payload);
                    const isCsvAppend = endpoint.format === 'csv'
                        && previousPayload.text
                        && payload.startsWith(previousPayload.text)
                        && parsedData.length >= previousLength;
                    const isProtobufAppend = endpoint.format === 'protobuf'
                        && previousPayload.signature
                        && previousLength > 0
                        && parsedData.length > previousLength
                        && getTelemetryRowIdentity(parsedData[previousLength - 1]) === previousPayload.lastRowIdentity;
                    const isAppend = isCsvAppend || isProtobufAppend;
                    const shouldResetPlayback = initial || Boolean(previousPayload.signature && !isAppend);

                    telemetryPayloadRef.current = {
                        signature: payloadSignature,
                        text: endpoint.format === 'csv' ? payload : '',
                        lastRowIdentity: getTelemetryRowIdentity(parsedData[parsedData.length - 1]),
                    };
                    sourceRowsLengthRef.current = parsedData.length;

                    if (shouldResetPlayback) {
                        sourceIndexRef.current = 0;
                        streamIndexRef.current = 0;
                        setData([]);
                    } else if (isAppend && parsedData.length > previousLength) {
                        sourceIndexRef.current = previousLength;
                    } else if (parsedData.length > 0) {
                        sourceIndexRef.current %= parsedData.length;
                    } else {
                        sourceIndexRef.current = 0;
                        setData([]);
                    }

                    setSourceData(parsedData);
                    setHasData(parsedData.length > 0);
                    setLoading(false);
                    return;
                } catch (error) {
                    console.log(`Erreur de chargement ${endpoint.url}:`, error);
                }
            }

            if (isMounted) {
                setHasData(false);
                setLoading(false);
            }
        };

        loadTelemetry({ initial: true });
        pollInterval = setInterval(() => loadTelemetry(), TELEMETRY_POLL_INTERVAL_MS);
        return () => { isMounted = false; clearInterval(pollInterval); };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadMqttStatus = async () => {
            try {
                const response = await fetch(withTelemetryCacheBuster(MQTT_STATUS_URL), { cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                if (isMounted) setMqttStatus(await response.json());
            } catch (_) {
                if (isMounted) setMqttStatus(null);
            }
        };
        loadMqttStatus();
        const interval = setInterval(loadMqttStatus, MQTT_STATUS_POLL_INTERVAL_MS);
        return () => { isMounted = false; clearInterval(interval); };
    }, []);

    useEffect(() => {
        if (!isPlaying || sourceData.length === 0) return undefined;

        const interval = setInterval(() => {
            if (sourceIndexRef.current >= sourceData.length) {
                setIsPlaying(false);
                return;
            }

            const sourcePoint = sourceData[sourceIndexRef.current];
            const nextPoint = { ...sourcePoint, streamIndex: streamIndexRef.current };
            const maxStreamPoints = Math.max(sourceData.length * 3, 500);

            setData((prev) => {
                const next = [...prev, nextPoint];
                return next.length > maxStreamPoints ? next.slice(next.length - maxStreamPoints) : next;
            });

            sourceIndexRef.current += 1;
            streamIndexRef.current += 1;
        }, speedMs);

        return () => clearInterval(interval);
    }, [isPlaying, sourceData, speedMs]);

    const chartData = useMemo(() => data.map((item, index) => ({
        ...item,
        index,
        'Time Index': item.streamIndex ?? index,
        'U_Alt':      getTelemetryNumber(item, ['U_Alt', 'U Alt']),
        'Speed':      getTelemetryNumber(item, 'Speed'),
        'Vert_speed': getTelemetryNumber(item, ['Vert_speed', 'Vert speed']),
        'Pressure':   getTelemetryNumber(item, 'Pressure'),
        'U_Lat':      getTelemetryNumber(item, ['U_Lat', 'U Lat'], null),
        'U_Long':     getTelemetryNumber(item, ['U_Long', 'U Long'], null),
        '#_Sat':      getTelemetryNumber(item, ['#_Sat', '#Sat']),
    })), [data]);

    const trajectoryRecords = useMemo(() =>
        chartData.filter(p =>
            toTelemetryNumber(p['U_Lat'], null) !== null &&
            toTelemetryNumber(p['U_Long'], null) !== null
        ),
    [chartData]);

    const firstRecord  = trajectoryRecords[0] ?? null;
    const currentRecord = chartData[chartData.length - 1] ?? sourceData[0] ?? {};

    const firstGeo   = firstRecord   ? getTelemetryRecordGeo(firstRecord)   : null;
    const currentGeo = currentRecord ? getTelemetryRecordGeo(currentRecord) : null;
    const distance = distanceKm(
        firstGeo   ? [firstGeo.lat,   firstGeo.lon]   : null,
        currentGeo ? [currentGeo.lat, currentGeo.lon] : null,
    );

    const progress = sourceData.length > 0
        ? Math.round((sourceIndexRef.current / sourceData.length) * 100)
        : 0;

    const handleReset = () => {
        sourceIndexRef.current = 0;
        streamIndexRef.current = 0;
        setData([]);
        setIsPlaying(true);
    };

    const handleSeek = (percentage) => {
        if (sourceData.length === 0) return;
        const nextIndex = Math.min(
            sourceData.length - 1,
            Math.max(0, Math.round((percentage / 100) * (sourceData.length - 1)))
        );
        sourceIndexRef.current = nextIndex;
        streamIndexRef.current += 1;
        setData(prev => [...prev, { ...sourceData[nextIndex], streamIndex: streamIndexRef.current }]);
    };

    const handleToggleMapOption = (key) =>
        setMapOptions(prev => ({ ...prev, [key]: !prev[key] }));

    const startLabel   = getRecordClock(sourceData[0], '15:43:24');
    const endLabel     = getRecordClock(sourceData[sourceData.length - 1], '17:54:46');
    const currentLabel = getRecordClock(currentRecord, startLabel);

    return (
        <main className="ground-station-shell">
            <TelemetryStatsBar
                currentRecord={currentRecord}
                distance={distance}
                mqttStatus={mqttStatus}
            />
            <CesiumViewport
                currentRecord={currentRecord}
                firstRecord={firstRecord}
                hasData={hasData}
                loading={loading}
                mapOptions={mapOptions}
                onToggleMapOption={handleToggleMapOption}
                trajectoryRecords={trajectoryRecords}
            />
            <TimelineControls
                currentLabel={currentLabel}
                endLabel={endLabel}
                isPlaying={isPlaying}
                onReset={handleReset}
                onSeek={handleSeek}
                onSpeedChange={setSpeedMs}
                onTogglePlay={() => setIsPlaying(prev => !prev)}
                progress={progress}
                speedMs={speedMs}
                startLabel={startLabel}
            />
        </main>
    );
}
