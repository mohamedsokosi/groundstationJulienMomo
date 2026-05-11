import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Box, Button, Checkbox, IconButton, Paper, Typography } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import { alpha, useTheme } from '@mui/material/styles';
import { useTelemetryStream } from './use-telemetry-stream.jsx';
import { getTelemetryNumber, toTelemetryNumber } from './telemetry-utils.js';
import './ground-station-view.css';

// ── Cesium constants ──────────────────────────────────────────────────
const DEFAULT_CENTER = [48.55, -81.35];
const MAP_CAMERA_HEIGHT = 180000;
const MAP_CAMERA_PITCH = -48;
const MAP_CAMERA_HEADING = 32;
const MAP_MIN_CAMERA_HEIGHT = 12000;
const MAP_MAX_CAMERA_HEIGHT = 2400000;
const MAP_ZOOM_FACTOR = 0.36;
const ARCGIS_WORLD_IMAGERY_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

// ── Link-budget helpers ───────────────────────────────────────────────
const FREQ_MHZ = 437;
function computeFSPL(altM) {
    if (!altM || altM <= 0) return null;
    return +(20 * Math.log10((4 * Math.PI * altM * FREQ_MHZ * 1e6) / 3e8)).toFixed(2);
}
const TX_DBM = 30;
const TX_GAIN_DBI = 8;
const RX_GAIN_DBI = 10;
function computeLinkBudget(fspl) {
    if (fspl === null) return null;
    return +(TX_DBM + TX_GAIN_DBI - fspl + RX_GAIN_DBI).toFixed(2);
}
function enrich(row) {
    const alt = parseFloat(row['U_Alt'] ?? row['U Alt']) || 0;
    const fspl = computeFSPL(alt);
    return { ...row, _fspl: fspl, _bilan: computeLinkBudget(fspl), _distance: alt };
}

// ── Chart field registry ──────────────────────────────────────────────
const AVAILABLE_FIELDS = [
    { key: '_elapsed_s',   label: 'Temps écoulé (s)',       step: 60    },
    { key: '_elapsed_min', label: 'Temps écoulé (min)',     step: 1     },
    { key: 'U_Alt',        label: 'Altitude (m)',           step: 10000 },
    { key: 'Speed',        label: 'Speed (m/s)',            step: 100   },
    { key: 'Vert_speed',   label: 'Vertical Speed (m/s)',   step: 10    },
    { key: 'Pressure',     label: 'Pressure (hPa)',         step: 100   },
    { key: '#_Sat',        label: 'Satellites',             step: 10    },
    { key: 'U_Lat',        label: 'Latitude (°)',           step: 1     },
    { key: 'U_Long',       label: 'Longitude (°)',          step: 1     },
    { key: '_fspl',        label: 'FSPL (dB)',              step: 100   },
    { key: '_bilan',       label: 'Bilan de liaison (dBm)', step: 100   },
    { key: '_distance',    label: 'Distance verticale (m)', step: 10000 },
    { key: 'MIU',          label: 'MIU (V)',                step: 1     },
    { key: 'T1',           label: 'Temp. 1 (°C)',           step: 10    },
    { key: 'T2',           label: 'Temp. 2 (°C)',           step: 10    },
];

function fieldLabel(key) {
    return AVAILABLE_FIELDS.find((f) => f.key === key)?.label || key;
}
function fieldUnit(key) {
    const m = fieldLabel(key).match(/\(([^)]+)\)$/);
    return m ? m[1] : '';
}
function fieldStep(key) {
    return AVAILABLE_FIELDS.find((f) => f.key === key)?.step ?? 100;
}
function pagedDomain(maxVal, minVal, step) {
    const hi = (Math.floor(maxVal / step + 0.5) + 1) * step;
    const lo = minVal < 0 ? -(Math.floor(-minVal / step + 0.5) + 1) * step : 0;
    return [lo, hi];
}

// ── Animated domain (cubic ease-in-out, 700 ms) ───────────────────────
function useAnimatedDomain(target, duration = 700) {
    const valueRef = useRef(target);
    const [displayed, setDisplayed] = useState(target);
    const rafRef = useRef(null);

    useEffect(() => {
        if (target === valueRef.current) return;
        cancelAnimationFrame(rafRef.current);
        const from = valueRef.current;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min((now - t0) / duration, 1);
            const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
            const v = from + (target - from) * e;
            valueRef.current = v;
            setDisplayed(v);
            if (p < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration]);

    return displayed;
}

// ── TelemetryChart (scrollable, animated) ────────────────────────────
function TelemetryChart({ data, xKey, lines, tracking, onTrackingChange }) {
    const theme = useTheme();
    const scrollRef = useRef(null);
    const isAutoScrollLockRef = useRef(false);
    const autoScrollRafRef = useRef(null);
    const hasData = !!data?.length && !!lines?.length;

    const labelFs = theme.typography.caption.fontSize;

    const { maxX, minY, maxY } = useMemo(() => {
        if (!data?.length) return { maxX: 0, minY: 0, maxY: 0 };
        let mx = 0, mn = 0, my = 0;
        for (const d of data) {
            const x = Number(d[xKey]) || 0;
            if (x > mx) mx = x;
            for (const { key } of lines) {
                const v = Number(d[key]) || 0;
                if (v > my) my = v;
                if (v < mn) mn = v;
            }
        }
        return { maxX: mx, minY: mn, maxY: my };
    }, [data, xKey, lines]);

    const stepX = fieldStep(xKey);
    const stepY = lines.reduce((m, { key }) => Math.max(m, fieldStep(key)), 0) || 100;

    const [, xDomainMax] = pagedDomain(maxX, 0, stepX);
    const [yDomainMin, yDomainMax] = pagedDomain(maxY, minY, stepY);

    const animXMax = useAnimatedDomain(xDomainMax);
    const animYMin = useAnimatedDomain(yDomainMin);
    const animYMax = useAnimatedDomain(yDomainMax);

    const xTicks = useMemo(() => {
        if (!animXMax) return [0];
        const raw = stepX / 10;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / mag;
        const nice = n < 1.5 ? mag : n < 3.5 ? 2 * mag : n < 7.5 ? 5 * mag : 10 * mag;
        const count = Math.round(animXMax / nice);
        return Array.from({ length: Math.min(count, 500) + 1 }, (_, i) =>
            Math.round(i * nice * 1e9) / 1e9
        );
    }, [animXMax, stepX]);

    const pagesX = animXMax / stepX;

    const yTicks = useMemo(() => {
        const range = animYMax - animYMin;
        if (range <= 0) return [Math.round(animYMin)];
        const raw = range / 8;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / mag;
        const nice = n < 1.5 ? mag : n < 3.5 ? 2 * mag : n < 7.5 ? 5 * mag : 10 * mag;
        const lo = Math.ceil(animYMin / nice) * nice;
        const result = [];
        for (let v = lo; v <= animYMax + nice * 0.0001; v += nice) {
            result.push(Math.round(v * 1e9) / 1e9);
        }
        return result;
    }, [animYMin, animYMax]);

    useEffect(() => {
        if (!tracking || !hasData) return;
        const el = scrollRef.current;
        if (!el) return;
        const targetLeft = Math.max(0, (maxX / stepX) * el.clientWidth - el.clientWidth * 0.5);
        const start = el.scrollLeft;
        const distance = targetLeft - start;
        if (Math.abs(distance) < 1) return;
        const duration = 300;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min((now - t0) / duration, 1);
            const e = 1 - (1 - p) ** 3;
            isAutoScrollLockRef.current = true;
            el.scrollLeft = start + distance * e;
            if (p < 1) autoScrollRafRef.current = requestAnimationFrame(tick);
        };
        autoScrollRafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(autoScrollRafRef.current);
    }, [tracking, maxX, stepX, hasData]);

    const handleScroll = useCallback(() => {
        if (isAutoScrollLockRef.current) {
            isAutoScrollLockRef.current = false;
            return;
        }
        onTrackingChange(false);
    }, [onTrackingChange]);

    if (!hasData) return null;

    const latestPoint = data[data.length - 1];

    return (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
            <Box sx={{ width: 50, flexShrink: 0, height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 4, right: 0, left: 8, bottom: 34 }}>
                        <YAxis
                            domain={[animYMin, animYMax]}
                            ticks={yTicks}
                            tick={{ fontSize: labelFs, fill: theme.palette.text.secondary }}
                            stroke={theme.palette.divider}
                            width={38}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Box>
            <Box
                ref={scrollRef}
                onScroll={handleScroll}
                sx={{ flex: 1, minWidth: 0, height: '100%', overflowX: 'auto', overflowY: 'hidden' }}
            >
                <Box sx={{ width: `${pagesX * 100}%`, height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.4)} />
                            <XAxis
                                dataKey={xKey}
                                type="number"
                                domain={[0, animXMax]}
                                ticks={xTicks}
                                height={30}
                                tick={{ fontSize: labelFs, fill: theme.palette.text.secondary }}
                                stroke={theme.palette.divider}
                                label={{ value: fieldLabel(xKey), position: 'insideBottom', offset: 2, fontSize: labelFs, fill: theme.palette.text.secondary }}
                            />
                            <YAxis domain={[animYMin, animYMax]} hide width={0} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: theme.palette.background.paper,
                                    border: `1px solid ${theme.palette.divider}`,
                                    borderRadius: 8,
                                    fontSize: 11,
                                }}
                                formatter={(v, name) => [typeof v === 'number' ? v.toFixed(2) : v, fieldLabel(name)]}
                                labelFormatter={(v) => `${fieldLabel(xKey)}: ${typeof v === 'number' ? v.toFixed(1) : v}`}
                            />
                            {lines.map(({ key, color }) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={color}
                                    dot={false}
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </Box>
            </Box>
            {latestPoint && (
                <Box sx={{
                    position: 'absolute',
                    top: 6,
                    left: 58,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    pointerEvents: 'none',
                    zIndex: 10,
                }}>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        {lines.map(({ key, color }) => {
                            const unit = fieldUnit(key);
                            const val = typeof latestPoint[key] === 'number' ? latestPoint[key].toFixed(2) : (latestPoint[key] ?? '—');
                            return (
                                <Typography key={key} variant="caption" sx={{ fontWeight: 700, color, fontSize: 13, lineHeight: 1.2 }}>
                                    {val}{unit && <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.85 }}> {unit}</span>}
                                </Typography>
                            );
                        })}
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11, lineHeight: 1.3 }}>
                        {typeof latestPoint[xKey] === 'number' ? latestPoint[xKey].toFixed(1) : (latestPoint[xKey] ?? '—')}
                        {fieldUnit(xKey) && <span style={{ fontSize: 10, opacity: 0.75 }}> {fieldUnit(xKey)}</span>}
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

function ChartTitle({ chart }) {
    const x = fieldLabel(chart.xKey);
    return (
        <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {chart.lines.map((l, i) => (
                <React.Fragment key={l.key}>
                    {i > 0 && <span style={{ color: 'inherit' }}>, </span>}
                    <span style={{ color: l.color }}>{fieldLabel(l.key)}</span>
                </React.Fragment>
            ))}
            {' vs '}
            {x}
        </Typography>
    );
}

// ── Cesium helpers ────────────────────────────────────────────────────
const getTelemetryRecordGeo = (record) => {
    const lat = toTelemetryNumber(record?.['U_Lat'], null);
    const lon = toTelemetryNumber(record?.['U_Long'], null);
    const alt = getTelemetryNumber(record, ['U_Alt', 'U Alt'], 0);
    if (lat === null || lon === null) return null;
    return { lat, lon, alt };
};

const getCesiumRecordPosition = (record) => {
    const geo = getTelemetryRecordGeo(record);
    if (!geo) return null;
    return Cartesian3.fromDegrees(geo.lon, geo.lat, geo.alt);
};

const getCesiumGroundPosition = (record) => {
    const geo = getTelemetryRecordGeo(record);
    if (!geo) return null;
    return Cartesian3.fromDegrees(geo.lon, geo.lat, 0);
};

const getTrajectoryCameraView = (records) => {
    const points = records.map(getTelemetryRecordGeo).filter(Boolean);
    if (points.length === 0) {
        return { lon: DEFAULT_CENTER[1], lat: DEFAULT_CENTER[0], height: MAP_CAMERA_HEIGHT };
    }
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
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
            return await createWorldImageryAsync({ style: IonWorldImageryStyle.ROAD });
        } catch (error) {
            console.warn('Cesium ion road map unavailable, falling back to OpenStreetMap.', error);
        }
    }
    try {
        return new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
    } catch (error) {
        console.warn('OpenStreetMap unavailable, falling back to ArcGIS satellite imagery.', error);
    }
    try {
        return await ArcGisMapServerImageryProvider.fromUrl(ARCGIS_WORLD_IMAGERY_URL);
    } catch (error) {
        console.warn('ArcGIS unavailable, falling back to local imagery.', error);
        return TileMapServiceImageryProvider.fromUrl('/cesiumStatic/Assets/Textures/NaturalEarthII');
    }
};

const RightControlPanel = ({ onZoomIn, onZoomOut, options, onToggle }) => {
    const controls = [
        { key: 'follow',     label: 'Suivre CubeSat' },
        { key: 'trajectory', label: 'Trajectoire'    },
        { key: 'linkBeam',   label: 'Liaison sol'    },
    ];
    return (
        <aside className="gs-right-panel compact" aria-label="Controles carte">
            <div className="gs-control-stack">
                <div className="gs-zoom-controls" aria-label="Zoom carte">
                    <button className="gs-zoom-button" onClick={onZoomIn} title="Zoom avant" type="button" aria-label="Zoom avant">+</button>
                    <button className="gs-zoom-button" onClick={onZoomOut} title="Zoom arriere" type="button" aria-label="Zoom arriere">-</button>
                </div>
                {controls.map((control) => (
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

const CesiumViewport = ({ currentRecord, firstRecord, hasData, loading, mapOptions, onToggleMapOption, trajectoryRecords }) => {
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
            if (token) Ion.defaultAccessToken = token;
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

        const positions = trajectoryRecords.map(getCesiumRecordPosition).filter(Boolean);
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
                    material: new PolylineGlowMaterialProperty({ glowPower: 0.16, color: Color.CYAN.withAlpha(0.96) }),
                },
            });
        }
        trajectoryEntityRef.current.show = mapOptions.trajectory && positions.length > 1;

        if (startPosition && !startEntityRef.current) {
            startEntityRef.current = viewer.entities.add({
                name: 'Depart trajectoire',
                position: startPosition,
                point: { pixelSize: 11, color: Color.LIME, outlineColor: Color.WHITE, outlineWidth: 1 },
            });
        } else if (startPosition) {
            startEntityRef.current.position = startPosition;
        }

        if (currentPosition && !satelliteEntityRef.current) {
            satelliteEntityRef.current = viewer.entities.add({
                name: 'CubeSat temps reel',
                position: currentPosition,
                point: { pixelSize: 13, color: Color.RED, outlineColor: Color.WHITE, outlineWidth: 2 },
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
                    material: new PolylineGlowMaterialProperty({ glowPower: 0.24, color: Color.YELLOW.withAlpha(0.92) }),
                },
            });
        }
        verticalLineEntityRef.current.show = Boolean(groundPosition && currentPosition);

        if (groundPosition && !groundProjectionEntityRef.current) {
            groundProjectionEntityRef.current = viewer.entities.add({
                name: 'Projection sol CubeSat',
                position: groundPosition,
                point: { pixelSize: 9, color: Color.YELLOW.withAlpha(0.85), outlineColor: Color.BLACK, outlineWidth: 1 },
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
        <section
            className="gs-map-frame gs-cesium-frame"
            aria-label="Globe Cesium de suivi CubeSat"
            style={{ flex: '1 1 auto', minHeight: 0 }}
        >
            <div ref={containerRef} className="gs-cesium-viewer" />
            <RightControlPanel
                onToggle={onToggleMapOption}
                onZoomIn={() => handleZoom('in')}
                onZoomOut={() => handleZoom('out')}
                options={mapOptions}
            />
            {(loading || !hasData) && (
                <div className="gs-map-status">
                    {loading ? 'CHARGEMENT...' : 'AUCUNE TELEMETRIE'}
                </div>
            )}
        </section>
    );
};

// ── Telemetry terminal ────────────────────────────────────────────────
const TERMINAL_FIELDS = ['U_Alt', 'Speed', 'Vert_speed', 'Pressure', '#_Sat', 'U_Lat', 'U_Long'];

function fmtTime(d) {
    const p = (v) => String(v).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function TelemetryTerminal() {
    const { data } = useTelemetryStream();
    const [lines, setLines] = useState([]);
    const prevLengthRef = useRef(0);
    const containerRef = useRef(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const suppressScrollRef = useRef(false);

    useEffect(() => {
        if (!data?.length) {
            if (prevLengthRef.current > 0) {
                setLines([]);
                prevLengthRef.current = 0;
            }
            return;
        }
        if (data.length < prevLengthRef.current) {
            setLines([]);
            prevLengthRef.current = 0;
        }
        if (data.length <= prevLengthRef.current) return;

        const newPoints = data.slice(prevLengthRef.current);
        prevLengthRef.current = data.length;

        const now = new Date();
        const ts = fmtTime(now);
        const newLines = newPoints.map((pt) => {
            const text = TERMINAL_FIELDS
                .filter((k) => pt[k] !== undefined && pt[k] !== null && pt[k] !== '')
                .map((k) => {
                    const v = typeof pt[k] === 'number' ? pt[k].toFixed(2) : pt[k];
                    return `${k}=${v}`;
                })
                .join('  ');
            return { id: `${Date.now()}-${Math.random()}`, ts, text: text || '[vide]' };
        });

        setLines((prev) => {
            const next = [...prev, ...newLines];
            return next.length > 500 ? next.slice(next.length - 500) : next;
        });
    }, [data]);

    useEffect(() => {
        if (!autoScroll) return;
        const el = containerRef.current;
        if (!el) return;
        suppressScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
    }, [lines, autoScroll]);

    const handleScroll = useCallback(() => {
        if (suppressScrollRef.current) {
            suppressScrollRef.current = false;
            return;
        }
        const el = containerRef.current;
        if (!el) return;
        setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - 12);
    }, []);

    const handleClear = useCallback(() => {
        setLines([]);
        prevLengthRef.current = 0;
    }, []);

    return (
        <Paper sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: '#050a0f',
            border: '1px solid #1d2430',
        }}>
            {/* Header bar */}
            <Box sx={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                px: 1,
                py: 0.25,
                borderBottom: '1px solid #1d2430',
                gap: 0.75,
            }}>
                <Typography sx={{
                    fontFamily: 'Consolas, "Courier New", monospace',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#5cc8ff',
                    letterSpacing: 0,
                    lineHeight: 1,
                }}>
                    TÉLÉMÉTRIE LIVE
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Box sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: autoScroll ? '#59d98b' : '#ffcc66',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                }} />
                <Button
                    size="small"
                    onClick={handleClear}
                    sx={{
                        minWidth: 0,
                        px: 0.75,
                        py: 0,
                        fontSize: 9,
                        lineHeight: 1.6,
                        fontFamily: 'Consolas, monospace',
                        fontWeight: 700,
                        color: '#a8b3c4',
                        '&:hover': { color: '#5cc8ff', bgcolor: 'transparent' },
                    }}
                >
                    CLR
                </Button>
            </Box>

            {/* Log body */}
            <Box
                ref={containerRef}
                onScroll={handleScroll}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    p: 0.5,
                    '&::-webkit-scrollbar': { width: 4 },
                    '&::-webkit-scrollbar-track': { bgcolor: '#0d0f13' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: '#293241', borderRadius: 2 },
                }}
            >
                {lines.length === 0 ? (
                    <Typography sx={{
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: 10,
                        color: '#a8b3c4',
                        fontStyle: 'italic',
                        lineHeight: 1.6,
                    }}>
                        En attente de données...
                    </Typography>
                ) : (
                    lines.map((line) => (
                        <Box key={line.id} sx={{ display: 'flex', gap: 1, lineHeight: 1.5 }}>
                            <Typography component="span" sx={{
                                fontFamily: 'Consolas, "Courier New", monospace',
                                fontSize: 10,
                                color: '#a8b3c4',
                                flexShrink: 0,
                                lineHeight: 'inherit',
                            }}>
                                {line.ts}
                            </Typography>
                            <Typography component="span" sx={{
                                fontFamily: 'Consolas, "Courier New", monospace',
                                fontSize: 10,
                                color: '#59d98b',
                                wordBreak: 'break-all',
                                lineHeight: 'inherit',
                            }}>
                                {line.text}
                            </Typography>
                        </Box>
                    ))
                )}
            </Box>
        </Paper>
    );
}

// ── Station Dashboard ─────────────────────────────────────────────────
const ANALYSE_STORAGE_KEY = 'analyse_charts_config';

function loadFavoriteCharts() {
    try {
        const saved = localStorage.getItem(ANALYSE_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return parsed.filter((c) => c.favorite === true);
        }
    } catch {}
    return [];
}

const BOTTOM_CHART_DEFS = [
    { id: 'station-bottom-alt',   xKey: '_elapsed_min', lines: [{ key: 'U_Alt',  color: '#4fb7d6' }] },
    { id: 'station-bottom-speed', xKey: '_elapsed_min', lines: [{ key: 'Speed',  color: '#ee8a22' }] },
];

export default function StationDashboard() {
    const theme = useTheme();
    const { chartData, loading, hasData } = useTelemetryStream({ intervalMs: 20000 });

    const enrichedData = useMemo(
        () => (chartData?.length ? chartData.map(enrich) : []),
        [chartData],
    );

    const trajectoryRecords = useMemo(
        () => chartData.filter(
            (p) => toTelemetryNumber(p['U_Lat'], null) !== null &&
                   toTelemetryNumber(p['U_Long'], null) !== null,
        ),
        [chartData],
    );

    const currentRecord = chartData[chartData.length - 1] ?? {};
    const firstRecord = trajectoryRecords[0] ?? null;

    const [favoriteCharts, setFavoriteCharts] = useState(() => loadFavoriteCharts());
    const [mapOptions, setMapOptions] = useState({ follow: false, trajectory: true, linkBeam: true });
    const [trackingStates, setTrackingStates] = useState(() =>
        Object.fromEntries(loadFavoriteCharts().map((c) => [c.id, true]))
    );
    const [bottomTrackingStates, setBottomTrackingStates] = useState([true, true]);

    const handleToggleMapOption = (key) => {
        setMapOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleTrackingChange = useCallback((id, val) => {
        setTrackingStates((prev) => ({ ...prev, [id]: val }));
    }, []);

    const handleBottomTrackingChange = useCallback((index, val) => {
        setBottomTrackingStates((prev) => {
            const next = [...prev];
            next[index] = val;
            return next;
        });
    }, []);

    const toggleFavorite = useCallback((chart) => {
        try {
            const saved = localStorage.getItem(ANALYSE_STORAGE_KEY);
            let config = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(config)) config = [];
            const idx = config.findIndex((c) => c.id === chart.id);
            if (idx >= 0) {
                config[idx] = { ...config[idx], favorite: !config[idx].favorite };
            } else {
                config.push({ ...chart, cols: 3, ratio: '2/1', track: true, favorite: true });
            }
            localStorage.setItem(ANALYSE_STORAGE_KEY, JSON.stringify(config));
            setFavoriteCharts(config.filter((c) => c.favorite === true));
        } catch {}
    }, []);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'row',
            height: 'calc(100vh - 52px)',
            overflow: 'hidden',
            bgcolor: 'background.default',
        }}>
            {/* Left column: 25% — 2 charts stacked, 1:1 aspect ratio each */}
            <Box sx={{
                width: '25%',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                p: 0.5,
                overflowY: 'auto',
            }}>
                {favoriteCharts.length === 0 ? (
                    <Box sx={{ p: 1 }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 11 }}>
                            Aucun graphe favori — ajoutez des ⭐ dans /analyse.
                        </Typography>
                    </Box>
                ) : (
                    favoriteCharts.map((chart) => (
                        <Box key={chart.id} sx={{ width: '100%', aspectRatio: '2 / 1', flexShrink: 0 }}>
                            <Paper sx={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                p: 0,
                                borderRadius: 1,
                                overflow: 'hidden',
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, pt: 0.25, flexShrink: 0 }}>
                                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                                        <ChartTitle chart={chart} />
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                        <IconButton
                                            size="small"
                                            onClick={() => toggleFavorite(chart)}
                                            sx={{ p: 0.25, color: '#fbbf24' }}
                                        >
                                            <StarIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                        <Checkbox
                                            size="small"
                                            checked={trackingStates[chart.id] ?? true}
                                            onChange={(e) => handleTrackingChange(chart.id, e.target.checked)}
                                            sx={{ p: 0.25, color: alpha(theme.palette.text.secondary, 0.5) }}
                                        />
                                        <Typography variant="caption" sx={{
                                            fontSize: 10, lineHeight: 1, userSelect: 'none',
                                            color: (trackingStates[chart.id] ?? true)
                                                ? 'text.secondary'
                                                : alpha(theme.palette.text.secondary, 0.4),
                                        }}>
                                            Track
                                        </Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ flex: 1, minHeight: 0 }}>
                                    <TelemetryChart
                                        data={enrichedData}
                                        xKey={chart.xKey}
                                        lines={chart.lines}
                                        tracking={trackingStates[chart.id] ?? true}
                                        onTrackingChange={(val) => handleTrackingChange(chart.id, val)}
                                    />
                                </Box>
                            </Paper>
                        </Box>
                    ))
                )}

                {/* Terminal télémétrie live */}
                <Box sx={{ width: '100%', aspectRatio: '2 / 1', flexShrink: 0 }}>
                    <TelemetryTerminal />
                </Box>
            </Box>

            {/* Right column: 75% — Cesium 3/4 height + charts 1/4 height */}
            <Box sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                p: 0.5,
                pl: 0,
                gap: 0.5,
                overflow: 'hidden',
            }}>
                {/* Cesium globe — 3/4 of the right column height */}
                <Box sx={{ flex: 3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <CesiumViewport
                        currentRecord={currentRecord}
                        firstRecord={firstRecord}
                        hasData={hasData}
                        loading={loading}
                        mapOptions={mapOptions}
                        onToggleMapOption={handleToggleMapOption}
                        trajectoryRecords={trajectoryRecords}
                    />
                </Box>

                {/* Bottom charts: Altitude vs Temps + Vitesse vs Temps — 1/4 height, 2:1 ratio */}
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: 0.5 }}>
                    {BOTTOM_CHART_DEFS.map((chart, i) => (
                        <Box key={i} sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                            <Paper sx={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                p: 0,
                                borderRadius: 1,
                                overflow: 'hidden',
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, pt: 0.25, flexShrink: 0 }}>
                                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                                        <ChartTitle chart={chart} />
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                        <Checkbox
                                            size="small"
                                            checked={bottomTrackingStates[i]}
                                            onChange={(e) => handleBottomTrackingChange(i, e.target.checked)}
                                            sx={{ p: 0.25, color: alpha(theme.palette.text.secondary, 0.5) }}
                                        />
                                        <Typography variant="caption" sx={{
                                            fontSize: 10, lineHeight: 1, userSelect: 'none',
                                            color: bottomTrackingStates[i]
                                                ? 'text.secondary'
                                                : alpha(theme.palette.text.secondary, 0.4),
                                        }}>
                                            Track
                                        </Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ flex: 1, minHeight: 0 }}>
                                    <TelemetryChart
                                        data={enrichedData}
                                        xKey={chart.xKey}
                                        lines={chart.lines}
                                        tracking={bottomTrackingStates[i]}
                                        onTrackingChange={(val) => handleBottomTrackingChange(i, val)}
                                    />
                                </Box>
                            </Paper>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}
