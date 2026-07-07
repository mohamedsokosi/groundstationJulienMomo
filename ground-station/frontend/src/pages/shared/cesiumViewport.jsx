import React, { useEffect, useRef, useState } from 'react';
import {
    ArcType,
    CallbackProperty,
    Cartesian2,
    Cartesian3,
    Color,
    ColorMaterialProperty,
    Ellipsoid,
    HeadingPitchRange,
    ImageMaterialProperty,
    IntersectionTests,
    Ion,
    LabelStyle,
    Math as CesiumMath,
    Matrix3,
    Matrix4,
    PolygonHierarchy,
    PolylineGlowMaterialProperty,
    Quaternion,
    Ray,
    Transforms,
    VerticalOrigin,
    Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
    createBaseImageryProvider,
    DEFAULT_CENTER,
    getCesiumGroundPosition,
    getCesiumRecordPosition,
    getTelemetryRecordGeo,
    getTrajectoryCameraView,
    MAP_CAMERA_HEADING,
    MAP_CAMERA_HEIGHT,
    MAP_CAMERA_PITCH,
    MAP_FOLLOW_CAMERA_HEIGHT,
    MAP_MAX_CAMERA_HEIGHT,
    MAP_MIN_CAMERA_HEIGHT,
} from './cesium-utils.js';

// --- Camera footprint projection -------------------------------------------------
// Projects heat.jpeg onto the ground where the CubeSat's camera looks, using the
// IMU attitude quaternion. Camera model (body frame): boresight = -Z, right = +X,
// image-up = +Y — so at identity attitude the camera looks straight down (nadir).
// The image is 3:2 (width:height), so the horizontal half-FOV is derived from the
// vertical one to keep that ratio. Tune PROJ_V_HALF_FOV / the body axes as needed.
const PROJECTION_IMAGE = '/heat.jpeg';
const PROJ_V_HALF_FOV = CesiumMath.toRadians(20);
const PROJ_H_HALF_FOV = Math.atan(1.5 * Math.tan(PROJ_V_HALF_FOV)); // 3:2 aspect

// Boresight-corner signs (right, up) in order top-left, top-right, bottom-right,
// bottom-left, and the matching image UVs (Cesium texture v=1 = top of image).
const FOOTPRINT_CORNER_SIGNS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
const FOOTPRINT_UVS = new PolygonHierarchy([
    new Cartesian2(0, 1),
    new Cartesian2(1, 1),
    new Cartesian2(1, 0),
    new Cartesian2(0, 0),
]);

// Ray-casts the 4 camera-frustum corners onto the WGS84 ellipsoid and returns the
// 4 ground Cartesian3 corners, or null if the camera doesn't fully see the ground
// (looking at/above the horizon) or the quaternion is missing/degenerate.
function computeCameraFootprint(satPosition, q) {
    if (!satPosition || !q) return null;
    const quat = new Quaternion(q.x, q.y, q.z, q.w);
    if (Quaternion.magnitude(quat) < 1e-6) return null;
    Quaternion.normalize(quat, quat);
    const bodyRot = Matrix3.fromQuaternion(quat, new Matrix3());
    const enuRot = Matrix4.getMatrix3(Transforms.eastNorthUpToFixedFrame(satPosition), new Matrix3());
    const tanH = Math.tan(PROJ_H_HALF_FOV);
    const tanV = Math.tan(PROJ_V_HALF_FOV);

    const corners = [];
    for (const [sx, sy] of FOOTPRINT_CORNER_SIGNS) {
        const dirBody = new Cartesian3(sx * tanH, sy * tanV, -1);
        Cartesian3.normalize(dirBody, dirBody);
        const dirEnu = Matrix3.multiplyByVector(bodyRot, dirBody, new Cartesian3());
        const dirEcef = Matrix3.multiplyByVector(enuRot, dirEnu, new Cartesian3());
        Cartesian3.normalize(dirEcef, dirEcef);
        const ray = new Ray(satPosition, dirEcef);
        const interval = IntersectionTests.rayEllipsoid(ray, Ellipsoid.WGS84);
        if (!interval) return null;
        corners.push(Ray.getPoint(ray, interval.start, new Cartesian3()));
    }
    return corners;
}

const GS_INPUT_STYLE = {
    width: '100%', height: 24, padding: '0 6px',
    border: '1px solid #293241', borderLeft: '3px solid #59d98b',
    borderRadius: 4, color: '#59d98b', background: '#0d141e',
    fontSize: 11, fontFamily: 'Consolas, monospace',
    outline: 'none', boxSizing: 'border-box',
};

export const RightControlPanel = ({ groundStationPos, onGroundStationChange, options, onToggle }) => {
    const [showGsForm, setShowGsForm] = useState(false);
    const [draftLat, setDraftLat] = useState(() => String(groundStationPos.lat));
    const [draftLon, setDraftLon] = useState(() => String(groundStationPos.lon));
    const prevPosRef = useRef(groundStationPos);

    useEffect(() => {
        if (prevPosRef.current !== groundStationPos) {
            setDraftLat(String(groundStationPos.lat));
            setDraftLon(String(groundStationPos.lon));
            prevPosRef.current = groundStationPos;
        }
    }, [groundStationPos]);

    const handleApply = () => {
        const lat = parseFloat(draftLat);
        const lon = parseFloat(draftLon);
        if (!Number.isNaN(lat) && !Number.isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            onGroundStationChange({ lat, lon });
        }
    };

    const controls = [
        { key: 'follow',     label: 'Suivre CubeSat' },
        { key: 'trajectory', label: 'Trajectoire'    },
        { key: 'linkBeam',   label: 'Liaison sol'    },
        { key: 'projection', label: 'Projection'     },
    ];
    return (
        <aside className="gs-right-panel compact" aria-label="Controles carte">
            <div className="gs-control-stack">
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
                <button
                    className={`gs-cyan-button${showGsForm ? ' is-on' : ''}`}
                    onClick={() => setShowGsForm((v) => !v)}
                    type="button"
                >
                    Position GS {showGsForm ? '▲' : '▼'}
                </button>
                {showGsForm && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 9, color: '#a8b3c4', fontFamily: 'Consolas', letterSpacing: 0 }}>LAT</span>
                            <input
                                type="number" step="0.0001" min="-90" max="90"
                                value={draftLat}
                                onChange={(e) => setDraftLat(e.target.value)}
                                style={GS_INPUT_STYLE}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 9, color: '#a8b3c4', fontFamily: 'Consolas', letterSpacing: 0 }}>LON</span>
                            <input
                                type="number" step="0.0001" min="-180" max="180"
                                value={draftLon}
                                onChange={(e) => setDraftLon(e.target.value)}
                                style={GS_INPUT_STYLE}
                            />
                        </div>
                        <button
                            className="gs-cyan-button is-on"
                            onClick={handleApply}
                            type="button"
                            style={{ marginTop: 2 }}
                        >
                            Appliquer
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
};

export const CesiumViewport = ({ currentRecord, groundStationPos, onGroundStationChange, hasData, loading, mapOptions, onToggleMapOption, trajectoryRecords }) => {
    const containerRef = useRef(null);
    const viewerRef = useRef(null);
    const satelliteEntityRef = useRef(null);
    const startEntityRef = useRef(null);
    const trajectoryEntityRef = useRef(null);
    const linkEntityRef = useRef(null);
    const verticalLineEntityRef = useRef(null);
    const groundProjectionEntityRef = useRef(null);
    const cameraFootprintEntityRef = useRef(null);
    const footprintCornersRef = useRef(null);
    const trajectoryPositionsRef = useRef([]);
    const linkPositionsRef = useRef([]);
    const verticalPositionsRef = useRef([]);
    const prevTrajLengthRef = useRef(0);
    const lastTrajGeoKeyRef = useRef(null);
    // FIX 2: initializedRef lives inside the viewer lifecycle, not across remounts.
    // It is reset to false whenever the viewer is (re)created.
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

            // FIX 2: Reset all entity refs and initializedRef when viewer is (re)created
            // so the entity-update effect rebuilds everything from scratch.
            satelliteEntityRef.current = null;
            startEntityRef.current = null;
            trajectoryEntityRef.current = null;
            linkEntityRef.current = null;
            verticalLineEntityRef.current = null;
            groundProjectionEntityRef.current = null;
            cameraFootprintEntityRef.current = null;
            footprintCornersRef.current = null;
            initializedRef.current = false;

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
            // FIX 2: Also clear entity refs on unmount so a future remount starts clean.
            satelliteEntityRef.current = null;
            startEntityRef.current = null;
            trajectoryEntityRef.current = null;
            linkEntityRef.current = null;
            verticalLineEntityRef.current = null;
            groundProjectionEntityRef.current = null;
            cameraFootprintEntityRef.current = null;
            footprintCornersRef.current = null;
            initializedRef.current = false;
            prevTrajLengthRef.current = 0;
            lastTrajGeoKeyRef.current = null;
        };
    }, []);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        // Incremental trajectory: only convert newly arrived GPS positions to Cartesian3.
        // Converting all N records on every poll (O(n) trig math per second) is the main
        // cause of Cesium map lag. We detect changes via GPS key and only process new records.
        const lastTraj = trajectoryRecords[trajectoryRecords.length - 1];
        const newGeoKey = lastTraj ? `${lastTraj['U_Lat']}-${lastTraj['U_Long']}` : null;

        if (trajectoryRecords.length < prevTrajLengthRef.current) {
            // Data was reset — clear cached positions
            trajectoryPositionsRef.current = [];
            prevTrajLengthRef.current = 0;
            lastTrajGeoKeyRef.current = null;
        }
        if (newGeoKey !== lastTrajGeoKeyRef.current) {
            if (trajectoryRecords.length > prevTrajLengthRef.current) {
                // Growing: append only positions that haven't been converted yet
                const newPos = trajectoryRecords
                    .slice(prevTrajLengthRef.current)
                    .map(getCesiumRecordPosition)
                    .filter(Boolean);
                trajectoryPositionsRef.current = [...trajectoryPositionsRef.current, ...newPos];
            } else if (lastTraj) {
                // Sliding window (deque full): 1 new frame at end, 1 old evicted at front
                const p = getCesiumRecordPosition(lastTraj);
                if (p) trajectoryPositionsRef.current = [...trajectoryPositionsRef.current, p];
            }
            prevTrajLengthRef.current = trajectoryRecords.length;
            lastTrajGeoKeyRef.current = newGeoKey;
        }

        const currentPosition = getCesiumRecordPosition(currentRecord);
        const groundPosition = getCesiumGroundPosition(currentRecord);
        const gsCartesian = Cartesian3.fromDegrees(groundStationPos.lon, groundStationPos.lat, 0);
        const linkPositions = currentPosition ? [gsCartesian, currentPosition] : [];
        const verticalPositions = groundPosition && currentPosition ? [groundPosition, currentPosition] : [];

        // Update refs BEFORE entities read them (CallbackProperty reads on next frame).
        linkPositionsRef.current = linkPositions;
        verticalPositionsRef.current = verticalPositions;

        // --- Trajectory polyline ---
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
        trajectoryEntityRef.current.show = mapOptions.trajectory && trajectoryPositionsRef.current.length > 1;

        // --- Ground station (green dot + "GS" label) — fixed configurable position ---
        if (!startEntityRef.current) {
            startEntityRef.current = viewer.entities.add({
                name: 'Station Sol',
                position: gsCartesian,
                point: { pixelSize: 11, color: Color.LIME, outlineColor: Color.WHITE, outlineWidth: 1 },
                label: {
                    text: 'GS',
                    font: '10px Consolas',
                    fillColor: Color.LIME,
                    outlineColor: Color.BLACK,
                    outlineWidth: 3,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    pixelOffset: new Cartesian2(0, -14),
                },
            });
        } else {
            startEntityRef.current.position = gsCartesian;
        }
        startEntityRef.current.show = true;

        // --- CubeSat current position (red dot) ---
        if (!satelliteEntityRef.current) {
            satelliteEntityRef.current = viewer.entities.add({
                name: 'CubeSat temps reel',
                position: currentPosition ?? Cartesian3.fromDegrees(0, 0, 0),
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
        }
        if (currentPosition) {
            satelliteEntityRef.current.position = currentPosition;
        }
        satelliteEntityRef.current.show = Boolean(currentPosition);

        // --- Link line: depart → CubeSat (green) ---
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
        linkEntityRef.current.show = mapOptions.linkBeam && linkPositions.length === 2;

        // --- Vertical line: ground projection → CubeSat (yellow) ---
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
        verticalLineEntityRef.current.show = verticalPositions.length === 2;

        // --- Ground projection dot (yellow) ---
        if (!groundProjectionEntityRef.current) {
            groundProjectionEntityRef.current = viewer.entities.add({
                name: 'Projection sol CubeSat',
                position: groundPosition ?? Cartesian3.fromDegrees(0, 0, 0),
                point: { pixelSize: 9, color: Color.YELLOW.withAlpha(0.85), outlineColor: Color.BLACK, outlineWidth: 1 },
            });
        }
        if (groundPosition) {
            groundProjectionEntityRef.current.position = groundPosition;
        }
        groundProjectionEntityRef.current.show = Boolean(groundPosition);

        // --- Camera footprint: heat.jpeg projected on the ground along the IMU look axis ---
        const quat = currentRecord ? {
            w: Number(currentRecord.Quat_w ?? 1),
            x: Number(currentRecord.Quat_x ?? 0),
            y: Number(currentRecord.Quat_y ?? 0),
            z: Number(currentRecord.Quat_z ?? 0),
        } : null;
        footprintCornersRef.current = currentPosition ? computeCameraFootprint(currentPosition, quat) : null;

        if (!cameraFootprintEntityRef.current) {
            cameraFootprintEntityRef.current = viewer.entities.add({
                name: 'Projection caméra (heat)',
                polygon: {
                    hierarchy: new CallbackProperty(
                        () => new PolygonHierarchy(footprintCornersRef.current ?? []),
                        false,
                    ),
                    textureCoordinates: FOOTPRINT_UVS,
                    material: new ImageMaterialProperty({ image: PROJECTION_IMAGE, transparent: true }),
                    perPositionHeight: false,
                    height: 0,
                },
            });
        }
        cameraFootprintEntityRef.current.show = Boolean(footprintCornersRef.current) && (mapOptions.projection !== false);

        // --- Initial camera fit (runs once after first trajectory data arrives) ---
        if (!initializedRef.current && trajectoryPositionsRef.current.length > 1) {
            initializedRef.current = true;
            const cameraView = getTrajectoryCameraView(trajectoryRecords);
            setThreeDCameraView(viewer, cameraView.lon, cameraView.lat, cameraView.height);
        }

        viewer.trackedEntity = undefined;

        if (mapOptions.follow && currentRecord) {
            const currentGeo = getTelemetryRecordGeo(currentRecord);
            if (currentGeo) {
                const followHeight = Math.min(cameraHeightRef.current, MAP_FOLLOW_CAMERA_HEIGHT);
                setThreeDCameraView(viewer, currentGeo.lon, currentGeo.lat, followHeight);
            }
        }
    }, [currentRecord, groundStationPos, mapOptions.follow, mapOptions.linkBeam, mapOptions.trajectory, mapOptions.projection, trajectoryRecords]);

    return (
        <section
            className="gs-map-frame gs-cesium-frame"
            aria-label="Globe Cesium de suivi CubeSat"
            style={{ flex: '1 1 auto', minHeight: 0 }}
        >
            <div ref={containerRef} className="gs-cesium-viewer" />
            <RightControlPanel
                groundStationPos={groundStationPos}
                onGroundStationChange={onGroundStationChange}
                onToggle={onToggleMapOption}
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