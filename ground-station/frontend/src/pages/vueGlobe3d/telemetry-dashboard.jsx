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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { distanceKm, toTelemetryNumber } from '../shared/telemetry-utils.js';
import {
    getTelemetryRecordGeo,
    loadGroundStationPosition,
    saveGroundStationPosition,
} from '../shared/cesium-utils.js';
import { CesiumViewport } from '../shared/cesiumViewport.jsx';
import { TelemetryStatsBar } from '../shared/telemetryStatsBar.jsx';
import { useTelemetryStream } from '../shared/use-telemetry-stream.jsx';
import '../shared/ground-station-view.css';

const MQTT_STATUS_URL = '/api/telemetry/mqtt/status';
const MQTT_STATUS_POLL_MS = 2000;

export default function TelemetryDashboard() {
    const { chartData, loading, hasData } = useTelemetryStream();
    const [mqttStatus, setMqttStatus] = useState(null);
    const [mapOptions, setMapOptions] = useState({ follow: false, trajectory: true, linkBeam: true });
    const [groundStationPos, setGroundStationPos] = useState(loadGroundStationPosition);

    useEffect(() => {
        let cancelled = false;
        let timer;
        const poll = async () => {
            try {
                const res = await fetch(MQTT_STATUS_URL, { cache: 'no-store' });
                if (!cancelled && res.ok) setMqttStatus(await res.json());
            } catch (_) { /* ignore */ }
            if (!cancelled) timer = setTimeout(poll, MQTT_STATUS_POLL_MS);
        };
        timer = setTimeout(poll, 0);
        return () => { cancelled = true; clearTimeout(timer); };
    }, []);

    const trajectoryRecords = useMemo(() =>
        chartData.filter((p) =>
            toTelemetryNumber(p['U_Lat'], null) !== null &&
            toTelemetryNumber(p['U_Long'], null) !== null,
        ),
    [chartData]);

    const firstRecord  = trajectoryRecords[0] ?? null;
    const currentRecord = chartData[chartData.length - 1] ?? {};

    const firstGeo   = firstRecord   ? getTelemetryRecordGeo(firstRecord)   : null;
    const currentGeo = currentRecord ? getTelemetryRecordGeo(currentRecord) : null;
    const distance = distanceKm(
        firstGeo   ? [firstGeo.lat,   firstGeo.lon]   : null,
        currentGeo ? [currentGeo.lat, currentGeo.lon] : null,
    );

    const handleToggleMapOption = useCallback((key) =>
        setMapOptions((prev) => ({ ...prev, [key]: !prev[key] })), []);

    const handleGroundStationChange = useCallback((pos) => {
        setGroundStationPos(pos);
        saveGroundStationPosition(pos);
    }, []);

    return (
        <main className="ground-station-shell">
            <TelemetryStatsBar
                currentRecord={currentRecord}
                distance={distance}
                mqttStatus={mqttStatus}
            />
            <CesiumViewport
                currentRecord={currentRecord}
                groundStationPos={groundStationPos}
                onGroundStationChange={handleGroundStationChange}
                hasData={hasData}
                loading={loading}
                mapOptions={mapOptions}
                onToggleMapOption={handleToggleMapOption}
                trajectoryRecords={trajectoryRecords}
            />
        </main>
    );
}
