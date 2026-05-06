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
    ArcType,
    ArcGisMapServerImageryProvider,
    Cartesian2,
    Cartesian3,
    CallbackProperty,
    Color,
    ColorMaterialProperty,
    createWorldImageryAsync,
    Ion,
    IonWorldImageryStyle,
    LabelStyle,
    HeadingPitchRange,
    Math as CesiumMath,
    Matrix4,
    OpenStreetMapImageryProvider,
    PolylineGlowMaterialProperty,
    TileMapServiceImageryProvider,
    VerticalOrigin,
    Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ComposedChart,
    Line,
    LineChart,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    getTelemetryNumber,
    isTelemetryNumericHeader,
    normalizeTelemetryHeader,
    toTelemetryNumber,
} from './telemetry-utils.js';
import './ground-station-view.css';

const DEFAULT_CENTER = [48.55, -81.35];
const MAP_CAMERA_HEIGHT = 180000;
const MAP_CAMERA_PITCH = -48;
const MAP_CAMERA_HEADING = 32;
const MAP_MIN_CAMERA_HEIGHT = 12000;
const MAP_MAX_CAMERA_HEIGHT = 2400000;
const MAP_ZOOM_FACTOR = 0.36;
const ARCGIS_WORLD_IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

const parseCSV = (text) => {
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const headers = lines[0].split(',').map(header => header.trim());

    return lines.slice(1).map((line, rowIndex) => {
        const values = line.split(',').map(value => value.trim());
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

const formatDateTime = (date) => {
    const pad = (value) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatClock = (value, fallback) => {
    if (!value) return fallback;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;

    return date.toLocaleTimeString('fr-CA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
};

const getRecordClock = (record, fallback) => {
    return formatClock(record?.['m-time'] || record?.m_time || record?.['Ublox UTC'] || record?.Ublox_UTC, fallback);
};

const distanceKm = (start, end) => {
    if (!start || !end) return 0;

    const earthRadiusKm = 6371;
    const toRadians = (value) => value * Math.PI / 180;
    const dLat = toRadians(end[0] - start[0]);
    const dLon = toRadians(end[1] - start[1]);
    const lat1 = toRadians(start[0]);
    const lat2 = toRadians(end[0]);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const TopNav = ({ activeTab, onTabChange }) => {
    const [now, setNow] = useState(() => new Date());
    const tabs = [
        { id: 'globe', label: 'Vue Globe 3D' },
        { id: 'analyse', label: 'Analyse' },
    ];

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <header className="gs-top-nav">
            <nav className="gs-nav-tabs" aria-label="Vues station sol">
                {tabs.map(tab => (
                    <button
                        className={`gs-nav-tab${activeTab === tab.id ? ' is-active' : ''}`}
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        type="button"
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
            <time className="gs-nav-clock" dateTime={now.toISOString()}>
                {formatDateTime(now)}
            </time>
        </header>
    );
};

const TelemetryStatsBar = ({ currentRecord, distance }) => {
    const altitude = getTelemetryNumber(currentRecord, ['U_Alt', 'U Alt'], 0);
    const speed = getTelemetryNumber(currentRecord, 'Speed', 0);
    const satellites = getTelemetryNumber(currentRecord, ['#_Sat', '#Sat'], 0);
    const pressure = getTelemetryNumber(currentRecord, 'Pressure', 0);
    const stats = [
        { label: 'ALTITUDE', value: `${altitude.toFixed(0)} m` },
        { label: 'DISTANCE', value: `${distance.toFixed(4)} km` },
        { label: 'VITESSE', value: `${speed.toFixed(2)} m/s` },
        { label: 'GPS SAT', value: satellites.toFixed(0) },
        { label: 'PRESSION', value: `${pressure.toFixed(1)} hPa` },
        { label: 'STATUS', value: 'NOMINAL', status: true },
    ];

    return (
        <section className="gs-stats-bar" aria-label="Resume telemetrie">
            {stats.map(stat => (
                <article className={`gs-stat-card${stat.status ? ' gs-stat-status' : ''}`} key={stat.label}>
                    <span className="gs-stat-label">{stat.label}</span>
                    <span className="gs-stat-value">{stat.value}</span>
                </article>
            ))}
        </section>
    );
};

const RightControlPanel = ({ onZoomIn, onZoomOut, options, onToggle }) => {
    const controls = [
        { key: 'follow', label: 'Suivre CubeSat' },
        { key: 'trajectory', label: 'Trajectoire' },
        { key: 'linkBeam', label: 'Liaison sol' },
    ];

    return (
        <aside className="gs-right-panel compact" aria-label="Controles carte">
            <div className="gs-control-stack">
                <div className="gs-zoom-controls" aria-label="Zoom carte">
                    <button
                        className="gs-zoom-button"
                        onClick={onZoomIn}
                        title="Zoom avant"
                        type="button"
                        aria-label="Zoom avant"
                    >
                        +
                    </button>
                    <button
                        className="gs-zoom-button"
                        onClick={onZoomOut}
                        title="Zoom arriere"
                        type="button"
                        aria-label="Zoom arriere"
                    >
                        -
                    </button>
                </div>
                {controls.map(control => (
                    <button
                        className={`gs-cyan-button${options[control.key] ? ' is-on' : ''}`}
                        key={control.key}
                        onClick={() => onToggle(control.key)}
                        type="button"
                    >
                        {control.label} {options[control.key] ? 'ON' : 'OFF'}
                    </button>
                ))}
            </div>
        </aside>
    );
};

const getTelemetryRecordGeo = (record) => {
    const lat = toTelemetryNumber(record?.['U_Lat'], null);
    const lon = toTelemetryNumber(record?.['U_Long'], null);
    const alt = getTelemetryNumber(record, ['U_Alt', 'U Alt'], 0);

    if (lat === null || lon === null) {
        return null;
    }

    return { lat, lon, alt };
};

const getCesiumRecordPosition = (record) => {
    const geo = getTelemetryRecordGeo(record);

    if (!geo) {
        return null;
    }

    const { lat, lon, alt } = geo;
    return Cartesian3.fromDegrees(lon, lat, alt);
};

const getCesiumGroundPosition = (record) => {
    const geo = getTelemetryRecordGeo(record);

    if (!geo) {
        return null;
    }

    return Cartesian3.fromDegrees(geo.lon, geo.lat, 0);
};

const getTrajectoryCameraView = (records) => {
    const points = records
        .map(getTelemetryRecordGeo)
        .filter(Boolean);

    if (points.length === 0) {
        return {
            lon: DEFAULT_CENTER[1],
            lat: DEFAULT_CENTER[0],
            height: MAP_CAMERA_HEIGHT,
        };
    }

    const lats = points.map(point => point.lat);
    const lons = points.map(point => point.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const span = Math.max(maxLat - minLat, maxLon - minLon);

    return {
        lon: (minLon + maxLon) / 2,
        lat: (minLat + maxLat) / 2,
        height: Math.min(MAP_MAX_CAMERA_HEIGHT, Math.max(MAP_CAMERA_HEIGHT, span * 640000)),
    };
};

const createBaseImageryProvider = async () => {
    if (Ion.defaultAccessToken) {
        try {
            return await createWorldImageryAsync({
                style: IonWorldImageryStyle.ROAD,
            });
        } catch (error) {
            console.warn('Cesium ion road map unavailable, falling back to OpenStreetMap.', error);
        }
    }

    try {
        return new OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/',
        });
    } catch (error) {
        console.warn('OpenStreetMap unavailable, falling back to ArcGIS satellite imagery.', error);
    }

    try {
        return await ArcGisMapServerImageryProvider.fromUrl(ARCGIS_WORLD_IMAGERY_URL);
    } catch (error) {
        console.warn('ArcGIS satellite imagery unavailable, falling back to local Cesium imagery.', error);
        return TileMapServiceImageryProvider.fromUrl('/cesiumStatic/Assets/Textures/NaturalEarthII');
    }
};

const MapViewport = ({
    currentRecord,
    firstRecord,
    hasData,
    loading,
    mapOptions,
    onToggleMapOption,
    trajectoryRecords,
}) => {
    const containerRef = useRef(null);
    const viewerRef = useRef(null);
    const satelliteEntityRef = useRef(null);
    const startEntityRef = useRef(null);
    const trajectoryEntityRef = useRef(null);
    const linkEntityRef = useRef(null);
    const verticalLineEntityRef = useRef(null);
    const groundProjectionEntityRef = useRef(null);
    const trajectoryPositionsRef = useRef([]);
    const linkPositionsRef = useRef([]);
    const verticalPositionsRef = useRef([]);
    const initializedRef = useRef(false);
    const cameraHeightRef = useRef(MAP_CAMERA_HEIGHT);

    const setThreeDCameraView = (viewer, lon, lat, height = cameraHeightRef.current) => {
        const nextHeight = Math.min(MAP_MAX_CAMERA_HEIGHT, Math.max(MAP_MIN_CAMERA_HEIGHT, height));

        cameraHeightRef.current = nextHeight;
        viewer.camera.lookAt(
            Cartesian3.fromDegrees(lon, lat, 0),
            new HeadingPitchRange(
                CesiumMath.toRadians(MAP_CAMERA_HEADING),
                CesiumMath.toRadians(MAP_CAMERA_PITCH),
                nextHeight,
            ),
        );
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    };

    const handleZoom = (direction) => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        const currentHeight = viewer.camera.positionCartographic.height || cameraHeightRef.current;
        const nextHeight = direction === 'in'
            ? currentHeight * (1 - MAP_ZOOM_FACTOR)
            : currentHeight * (1 + MAP_ZOOM_FACTOR);

        cameraHeightRef.current = Math.min(MAP_MAX_CAMERA_HEIGHT, Math.max(MAP_MIN_CAMERA_HEIGHT, nextHeight));

        if (direction === 'in') {
            viewer.camera.zoomIn(currentHeight - cameraHeightRef.current);
        } else {
            viewer.camera.zoomOut(cameraHeightRef.current - currentHeight);
        }
    };

    useEffect(() => {
        let disposed = false;
        let resizeObserver = null;

        const initializeViewer = async () => {
            if (!containerRef.current || viewerRef.current) return;

            const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
            if (token) {
                Ion.defaultAccessToken = token;
            }

            if (disposed || !containerRef.current) return;

            const viewer = new Viewer(containerRef.current, {
                animation: false,
                baseLayerPicker: false,
                fullscreenButton: false,
                geocoder: false,
                homeButton: false,
                infoBox: false,
                navigationHelpButton: false,
                sceneModePicker: false,
                selectionIndicator: false,
                timeline: false,
                baseLayer: false,
            });

            viewer.scene.globe.enableLighting = false;
            viewer.scene.globe.depthTestAgainstTerrain = false;
            viewer.scene.globe.baseColor = Color.fromCssColorString('#0a141e');
            viewer.scene.skyAtmosphere.show = false;
            viewer.scene.skyBox.show = false;
            viewer.scene.sun.show = false;
            viewer.scene.moon.show = false;
            viewer.scene.backgroundColor = Color.fromCssColorString('#050a0f');
            viewer.scene.requestRenderMode = false;
            setThreeDCameraView(viewer, DEFAULT_CENTER[1], DEFAULT_CENTER[0], MAP_CAMERA_HEIGHT);
            const controls = viewer.scene.screenSpaceCameraController;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.enableTilt = true;
            controls.enableLook = false;
            controls.zoomFactor = 3;
            controls.minimumZoomDistance = MAP_MIN_CAMERA_HEIGHT;
            controls.maximumZoomDistance = MAP_MAX_CAMERA_HEIGHT;

            resizeObserver = new ResizeObserver(() => viewer.resize());
            resizeObserver.observe(containerRef.current);
            viewerRef.current = viewer;

            const maxTextureSize = viewer.scene.context?.maximumTextureSize;
            if (maxTextureSize !== 0) {
                createBaseImageryProvider().then((imageryProvider) => {
                    if (!disposed && viewerRef.current && !viewerRef.current.isDestroyed()) {
                        viewer.imageryLayers.addImageryProvider(imageryProvider, 0);
                    }
                }).catch((error) => {
                    console.warn('Cesium imagery layer could not be loaded.', error);
                });
            }
        };

        initializeViewer();

        return () => {
            disposed = true;
            resizeObserver?.disconnect();
            if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                viewerRef.current.destroy();
            }
            viewerRef.current = null;
        };
    }, []);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        const positions = trajectoryRecords
            .map(getCesiumRecordPosition)
            .filter(Boolean);
        const currentPosition = getCesiumRecordPosition(currentRecord);
        const groundPosition = getCesiumGroundPosition(currentRecord);
        const startPosition = getCesiumRecordPosition(firstRecord);
        const linkPositions = startPosition && currentPosition ? [startPosition, currentPosition] : [];
        const verticalPositions = groundPosition && currentPosition ? [groundPosition, currentPosition] : [];

        trajectoryPositionsRef.current = positions;
        linkPositionsRef.current = linkPositions;
        verticalPositionsRef.current = verticalPositions;

        if (!trajectoryEntityRef.current) {
            trajectoryEntityRef.current = viewer.entities.add({
                name: 'Trajectoire CubeSat',
                polyline: {
                    positions: new CallbackProperty(() => trajectoryPositionsRef.current, false),
                    width: 4,
                    arcType: ArcType.NONE,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: 0.16,
                        color: Color.CYAN.withAlpha(0.96),
                    }),
                },
            });
        }
        trajectoryEntityRef.current.show = mapOptions.trajectory && positions.length > 1;

        if (startPosition && !startEntityRef.current) {
            startEntityRef.current = viewer.entities.add({
                name: 'Depart trajectoire',
                position: startPosition,
                point: {
                    pixelSize: 11,
                    color: Color.LIME,
                    outlineColor: Color.WHITE,
                    outlineWidth: 1,
                },
            });
        } else if (startPosition) {
            startEntityRef.current.position = startPosition;
        }

        if (currentPosition && !satelliteEntityRef.current) {
            satelliteEntityRef.current = viewer.entities.add({
                name: 'CubeSat temps reel',
                position: currentPosition,
                point: {
                    pixelSize: 13,
                    color: Color.RED,
                    outlineColor: Color.WHITE,
                    outlineWidth: 2,
                },
                label: {
                    text: 'CubeSat',
                    font: '12px Consolas',
                    fillColor: Color.CYAN,
                    outlineColor: Color.BLACK,
                    outlineWidth: 3,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    pixelOffset: new Cartesian2(0, -16),
                },
            });
        } else if (currentPosition) {
            satelliteEntityRef.current.position = currentPosition;
        }

        if (!linkEntityRef.current) {
            linkEntityRef.current = viewer.entities.add({
                name: 'Liaison sol',
                polyline: {
                    positions: new CallbackProperty(() => linkPositionsRef.current, false),
                    width: 2,
                    arcType: ArcType.NONE,
                    material: new ColorMaterialProperty(Color.LIME.withAlpha(0.78)),
                },
            });
        }
        linkEntityRef.current.show = mapOptions.linkBeam && Boolean(startPosition && currentPosition);

        if (!verticalLineEntityRef.current) {
            verticalLineEntityRef.current = viewer.entities.add({
                name: 'Axe Z CubeSat',
                polyline: {
                    positions: new CallbackProperty(() => verticalPositionsRef.current, false),
                    width: 3,
                    arcType: ArcType.NONE,
                    material: new PolylineGlowMaterialProperty({
                        glowPower: 0.24,
                        color: Color.YELLOW.withAlpha(0.92),
                    }),
                },
            });
        }
        verticalLineEntityRef.current.show = Boolean(groundPosition && currentPosition);

        if (groundPosition && !groundProjectionEntityRef.current) {
            groundProjectionEntityRef.current = viewer.entities.add({
                name: 'Projection sol CubeSat',
                position: groundPosition,
                point: {
                    pixelSize: 9,
                    color: Color.YELLOW.withAlpha(0.85),
                    outlineColor: Color.BLACK,
                    outlineWidth: 1,
                },
            });
        } else if (groundPosition) {
            groundProjectionEntityRef.current.position = groundPosition;
        }
        if (groundProjectionEntityRef.current) {
            groundProjectionEntityRef.current.show = Boolean(groundPosition);
        }

        if (!initializedRef.current && positions.length > 1) {
            initializedRef.current = true;
            const cameraView = getTrajectoryCameraView(trajectoryRecords);
            setThreeDCameraView(viewer, cameraView.lon, cameraView.lat, cameraView.height);
        }

        viewer.trackedEntity = undefined;

        if (mapOptions.follow && currentRecord) {
            const currentGeo = getTelemetryRecordGeo(currentRecord);

            if (currentGeo) {
                setThreeDCameraView(viewer, currentGeo.lon, currentGeo.lat, cameraHeightRef.current);
            }
        }
    }, [currentRecord, firstRecord, mapOptions.follow, mapOptions.linkBeam, mapOptions.trajectory, trajectoryRecords]);

    return (
        <section className="gs-map-frame gs-cesium-frame" aria-label="Globe Cesium de suivi CubeSat">
            <div ref={containerRef} className="gs-cesium-viewer" />
            <RightControlPanel
                onToggle={onToggleMapOption}
                onZoomIn={() => handleZoom('in')}
                onZoomOut={() => handleZoom('out')}
                options={mapOptions}
            />
            {(loading || !hasData) && (
                <div className="gs-map-status">
                    {loading ? 'CHARGEMENT CSV...' : 'AUCUNE TELEMETRIE'}
                </div>
            )}
        </section>
    );
};

const chartTooltipStyle = {
    backgroundColor: 'rgba(8, 22, 36, 0.96)',
    border: '1px solid rgba(0, 216, 255, 0.42)',
    color: '#c9eaff',
};

const AnalysisView = ({ data }) => (
    <section className="gs-analysis">
        <article className="gs-chart-card">
            <h2>Altitude vs Temps</h2>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="altitudeFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00ff9c" stopOpacity={0.78} />
                            <stop offset="95%" stopColor="#00ff9c" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(111, 145, 168, 0.26)" strokeDasharray="3 3" />
                    <XAxis dataKey="Time Index" stroke="#6f91a8" />
                    <YAxis stroke="#6f91a8" />
                    <RechartsTooltip contentStyle={chartTooltipStyle} />
                    <Area dataKey="U_Alt" fill="url(#altitudeFill)" name="Altitude" stroke="#00ff9c" />
                </AreaChart>
            </ResponsiveContainer>
        </article>

        <article className="gs-chart-card">
            <h2>Vitesse vs Temps</h2>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data}>
                    <CartesianGrid stroke="rgba(111, 145, 168, 0.26)" strokeDasharray="3 3" />
                    <XAxis dataKey="Time Index" stroke="#6f91a8" />
                    <YAxis stroke="#6f91a8" />
                    <RechartsTooltip contentStyle={chartTooltipStyle} />
                    <Line dataKey="Speed" dot={false} name="Vitesse horizontale" stroke="#ffaa00" strokeWidth={2} />
                    <Line dataKey="Vert_speed" dot={false} name="Vitesse verticale" stroke="#ff3b3b" strokeDasharray="5 5" strokeWidth={2} />
                </ComposedChart>
            </ResponsiveContainer>
        </article>

        <article className="gs-chart-card">
            <h2>Pression vs Altitude</h2>
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                    <CartesianGrid stroke="rgba(111, 145, 168, 0.26)" strokeDasharray="3 3" />
                    <XAxis dataKey="U_Alt" name="Altitude" stroke="#6f91a8" type="number" />
                    <YAxis dataKey="Pressure" name="Pression" stroke="#6f91a8" />
                    <RechartsTooltip contentStyle={chartTooltipStyle} />
                    <Scatter data={data} fill="#00d8ff" name="Donnees" />
                </ScatterChart>
            </ResponsiveContainer>
        </article>

        <article className="gs-chart-card">
            <h2>Satellites visibles vs Temps</h2>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid stroke="rgba(111, 145, 168, 0.26)" strokeDasharray="3 3" />
                    <XAxis dataKey="Time Index" stroke="#6f91a8" />
                    <YAxis stroke="#6f91a8" />
                    <RechartsTooltip contentStyle={chartTooltipStyle} />
                    <Line dataKey="#_Sat" dot={false} name="Satellites GPS" stroke="#00d8ff" strokeWidth={2} />
                </LineChart>
            </ResponsiveContainer>
        </article>
    </section>
);

const TimelineControls = ({
    currentLabel,
    endLabel,
    isPlaying,
    onReset,
    onSeek,
    onSpeedChange,
    onTogglePlay,
    progress,
    speedMs,
    startLabel,
}) => (
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
            onChange={(event) => onSeek(Number(event.target.value))}
            type="range"
            value={progress}
            aria-label="Pass timeline"
        />
        <span className="gs-timecode">{currentLabel || endLabel}</span>
        <select
            className="gs-speed-select"
            onChange={(event) => onSpeedChange(Number(event.target.value))}
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
    const [activeTab, setActiveTab] = useState('globe');
    const [sourceData, setSourceData] = useState([]);
    const [data, setData] = useState([]);
    const [hasData, setHasData] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);
    const [loading, setLoading] = useState(true);
    const [speedMs, setSpeedMs] = useState(500);
    const [mapOptions, setMapOptions] = useState({
        follow: false,
        trajectory: true,
        linkBeam: true,
    });
    const sourceIndexRef = useRef(0);
    const streamIndexRef = useRef(0);

    useEffect(() => {
        let isMounted = true;

        const loadTelemetry = async () => {
            const endpoints = ['/api/telemetry.csv', '/telemetry.csv'];

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint);

                    if (!response.ok) {
                        continue;
                    }

                    const parsedData = parseCSV(await response.text());

                    if (isMounted) {
                        setSourceData(parsedData);
                        setHasData(parsedData.length > 0);
                        setLoading(false);
                    }

                    return;
                } catch (error) {
                    console.log(`Erreur de chargement ${endpoint}:`, error);
                }
            }

            if (isMounted) {
                setHasData(false);
                setLoading(false);
            }
        };

        loadTelemetry();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!isPlaying || sourceData.length === 0) return undefined;

        const interval = setInterval(() => {
            const sourcePoint = sourceData[sourceIndexRef.current];
            const nextPoint = {
                ...sourcePoint,
                streamIndex: streamIndexRef.current,
            };
            const maxStreamPoints = Math.max(sourceData.length * 3, 500);

            setData((previousData) => {
                const nextData = [...previousData, nextPoint];
                return nextData.length > maxStreamPoints
                    ? nextData.slice(nextData.length - maxStreamPoints)
                    : nextData;
            });

            sourceIndexRef.current = (sourceIndexRef.current + 1) % sourceData.length;
            streamIndexRef.current += 1;
        }, speedMs);

        return () => clearInterval(interval);
    }, [isPlaying, sourceData, speedMs]);

    const chartData = useMemo(() => {
        return data.map((item, index) => ({
            ...item,
            index,
            'Time Index': item.streamIndex ?? index,
            'U_Alt': getTelemetryNumber(item, ['U_Alt', 'U Alt']),
            'Speed': getTelemetryNumber(item, 'Speed'),
            'Vert_speed': getTelemetryNumber(item, ['Vert_speed', 'Vert speed']),
            'Pressure': getTelemetryNumber(item, 'Pressure'),
            'U_Lat': getTelemetryNumber(item, ['U_Lat', 'U Lat'], null),
            'U_Long': getTelemetryNumber(item, ['U_Long', 'U Long'], null),
            '#_Sat': getTelemetryNumber(item, ['#_Sat', '#Sat']),
        }));
    }, [data]);

    const trajectoryPoints = useMemo(() => {
        return chartData
            .map(point => [
                toTelemetryNumber(point['U_Lat'], null),
                toTelemetryNumber(point['U_Long'], null),
            ])
            .filter(([lat, lon]) => lat !== null && lon !== null);
    }, [chartData]);

    const trajectoryRecords = useMemo(() => {
        return chartData.filter(point => (
            toTelemetryNumber(point['U_Lat'], null) !== null &&
            toTelemetryNumber(point['U_Long'], null) !== null
        ));
    }, [chartData]);

    const firstPoint = trajectoryPoints[0] ?? null;
    const currentPoint = trajectoryPoints[trajectoryPoints.length - 1] ?? null;
    const firstRecord = trajectoryRecords[0] ?? null;
    const currentRecord = chartData[chartData.length - 1] ?? sourceData[0] ?? {};
    const distance = distanceKm(firstPoint, currentPoint);
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
        setData(previousData => [
            ...previousData,
            {
                ...sourceData[nextIndex],
                streamIndex: streamIndexRef.current,
            },
        ]);
    };

    const handleToggleMapOption = (key) => {
        setMapOptions(previous => ({
            ...previous,
            [key]: !previous[key],
        }));
    };

    const startLabel = getRecordClock(sourceData[0], '15:43:24');
    const endLabel = getRecordClock(sourceData[sourceData.length - 1], '17:54:46');
    const currentLabel = getRecordClock(currentRecord, startLabel);

    return (
        <main className="ground-station-shell">
            <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
            <TelemetryStatsBar currentRecord={currentRecord} distance={distance} />
            {activeTab === 'analyse' ? (
                <AnalysisView data={chartData} />
            ) : (
                <>
                    <MapViewport
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
                        onTogglePlay={() => setIsPlaying(previous => !previous)}
                        progress={progress}
                        speedMs={speedMs}
                        startLabel={startLabel}
                    />
                </>
            )}
        </main>
    );
}
