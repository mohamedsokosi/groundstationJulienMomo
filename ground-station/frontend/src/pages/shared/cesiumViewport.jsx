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
    HeadingPitchRoll,
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
// Projects stripes.png onto the ground where the CubeSat's camera looks, using the
// IMU attitude quaternion. Camera model (body frame): boresight = -Z, right = +X,
// image-up = +Y — so at identity attitude the camera looks straight down (nadir).
// The half-FOVs are derived from the real optics: a 400 mm lens on a full-frame
// 3:2 sensor (Sony a7, 36×24 mm). The sensor's own 3:2 ratio (36/24) makes the
// footprint 3:2, matching the 3:2 stripes.png. At ~30 km altitude this is a narrow
// ~2.7×1.8 km footprint (H FOV ≈ 5.15°, V FOV ≈ 3.44°). Update the three constants
// below if the lens focal length or sensor size changes.
const PROJECTION_IMAGE = '/stripes.png';
const LENS_FOCAL_MM = 400;   // objective focal length
const SENSOR_W_MM = 36.0;    // full-frame sensor width  (landscape = image right, +X)
const SENSOR_H_MM = 24.0;    // full-frame sensor height (image up, +Y)
const PROJ_H_HALF_FOV = Math.atan((SENSOR_W_MM / 2) / LENS_FOCAL_MM); // ≈ 2.58°
const PROJ_V_HALF_FOV = Math.atan((SENSOR_H_MM / 2) / LENS_FOCAL_MM); // ≈ 1.72°

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

// --- Forest-fire danger zones ----------------------------------------------------
// The CubeSat transmits the danger zones it has imaged as GeoJSON polygons — the
// irregular outline already within its camera vision. Each detection frame carries
// Fire_GeoJSON (a GeoJSON Polygon string) + Fire_Level (colour). The ground station
// just parses and draws each polygon it receives, once, and keeps it — no clipping,
// no generation.
// Level → colour: red = grand danger, orange = danger, yellow = petit danger.
const FIRE_ZONE_LEVELS = {
    1: { color: '#ffd60a', label: 'PETIT DANGER' },
    2: { color: '#ff8c00', label: 'DANGER' },
    3: { color: '#ff2d2d', label: 'GRAND DANGER' },
};

// Parse a GeoJSON Polygon string → outer-ring Cesium ground positions (height 0),
// or null if malformed. Accepts a Polygon geometry or a Feature wrapping one.
function fireGeojsonPositions(geojson) {
    let parsed;
    try {
        parsed = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
    } catch (_) {
        return null;
    }
    const geom = parsed?.type === 'Feature' ? parsed.geometry : parsed;
    if (!geom || geom.type !== 'Polygon' || !Array.isArray(geom.coordinates?.[0])) return null;
    const coords = [];
    for (const pt of geom.coordinates[0]) {
        if (Array.isArray(pt) && pt.length >= 2) coords.push(pt[0], pt[1]); // [lon, lat]
    }
    if (coords.length < 6) return null;
    return Cartesian3.fromDegreesArray(coords);
}

// --- CubeSat 3D model marker -----------------------------------------------------
// Replaces the red dot with the actual CubeSat model, oriented by the IMU
// quaternion. The rendered orientation is model→ECEF = (ENU→ECEF) ⊗ (body→ENU) ⊗
// MODEL_FIX, so the model sits upright on the curved globe and rotates with the
// attitude. MODEL_FIX is a constant correction for the model's own rest axes —
// tweak its heading/pitch/roll (radians) if the CubeSat sits/points wrong.
const CUBESAT_MODEL = '/cubesat.glb';
// Rest-axis correction (HeadingPitchRoll radians): roll +90° stands the model
// upright on the globe (confirmed visually). The IMU quaternion is applied on top.
const MODEL_FIX = Quaternion.fromHeadingPitchRoll(new HeadingPitchRoll(0, 0, Math.PI / 2), new Quaternion());
const _enuMat3 = new Matrix3();

function computeModelOrientation(position, q) {
    const enuMat3 = Matrix4.getMatrix3(Transforms.eastNorthUpToFixedFrame(position), _enuMat3);
    const enuQuat = Quaternion.fromRotationMatrix(enuMat3, new Quaternion());
    const bodyQuat = new Quaternion(q.x, q.y, q.z, q.w);
    if (Quaternion.magnitude(bodyQuat) < 1e-6) Quaternion.clone(Quaternion.IDENTITY, bodyQuat);
    Quaternion.normalize(bodyQuat, bodyQuat);
    const out = Quaternion.multiply(bodyQuat, MODEL_FIX, new Quaternion());
    return Quaternion.multiply(enuQuat, out, out); // model → ECEF
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
        { key: 'fireZones',  label: 'Zones feu'      },
    ];
    const fireLegend = [
        ['#ff2d2d', 'Grand danger'],
        ['#ff8c00', 'Danger'],
        ['#ffd60a', 'Petit danger'],
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
                {options.fireZones && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '1px 0 2px' }}>
                        {fireLegend.map(([color, text]) => (
                            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, background: color, borderRadius: 2, flex: '0 0 auto' }} />
                                <span style={{ fontSize: 9, color: '#a8b3c4', fontFamily: 'Consolas' }}>{text}</span>
                            </div>
                        ))}
                    </div>
                )}
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
    // Map keyed by GeoJSON content → the Cesium entity drawn for one received fire
    // zone, so each transmitted polygon is drawn once and persists.
    const fireZonesRef = useRef(new Map());
    const prevFireVisibleRef = useRef(true);
    const satelliteOrientationRef = useRef(undefined);
    const trajectoryPositionsRef = useRef([]);
    const linkPositionsRef = useRef([]);
    const verticalPositionsRef = useRef([]);
    const prevTrajLengthRef = useRef(0);
    const lastTrajGeoKeyRef = useRef(null);
    // FIX 2: initializedRef lives inside the viewer lifecycle, not across remounts.
    // It is reset to false whenever the viewer is (re)created.
    const initializedRef = useRef(false);
    const cameraHeightRef = useRef(MAP_CAMERA_HEIGHT);
    // Tracks whether follow mode was active on the previous frame, so we can
    // snap to a nice zoom once when it is first enabled and then leave zoom
    // entirely under the operator's control.
    const wasFollowingRef = useRef(false);

    const setThreeDCameraView = (viewer, lon, lat, height = cameraHeightRef.current, targetAlt = 0) => {
        const nextHeight = Math.min(MAP_MAX_CAMERA_HEIGHT, Math.max(MAP_MIN_CAMERA_HEIGHT, height));
        cameraHeightRef.current = nextHeight;
        viewer.camera.lookAt(
            Cartesian3.fromDegrees(lon, lat, targetAlt),
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
            fireZonesRef.current = new Map();
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
            fireZonesRef.current = new Map();
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
            // Data was reset — clear cached positions and drawn fire zones
            trajectoryPositionsRef.current = [];
            prevTrajLengthRef.current = 0;
            lastTrajGeoKeyRef.current = null;
            for (const ent of fireZonesRef.current.values()) viewer.entities.remove(ent);
            fireZonesRef.current.clear();
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

        // --- CubeSat current position (3D model oriented by the IMU quaternion) ---
        if (!satelliteEntityRef.current) {
            satelliteEntityRef.current = viewer.entities.add({
                name: 'CubeSat temps reel',
                position: currentPosition ?? Cartesian3.fromDegrees(0, 0, 0),
                // Read via CallbackProperty so the attitude always updates live.
                orientation: new CallbackProperty(() => satelliteOrientationRef.current, false),
                model: {
                    uri: CUBESAT_MODEL,
                    minimumPixelSize: 46, // stay visible when zoomed out (mini CubeSat marker)
                    maximumScale: 6000,
                    scale: 1,
                },
                label: {
                    text: 'CubeSat',
                    font: '12px Consolas',
                    fillColor: Color.CYAN,
                    outlineColor: Color.BLACK,
                    outlineWidth: 3,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    pixelOffset: new Cartesian2(0, -34),
                },
            });
        }
        if (currentPosition) {
            satelliteEntityRef.current.position = currentPosition;
            const q = {
                w: Number(currentRecord?.Quat_w ?? 1),
                x: Number(currentRecord?.Quat_x ?? 0),
                y: Number(currentRecord?.Quat_y ?? 0),
                z: Number(currentRecord?.Quat_z ?? 0),
            };
            satelliteOrientationRef.current = computeModelOrientation(currentPosition, q);
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

        // --- Camera footprint: stripes.png projected on the ground along the IMU look axis ---
        const quat = currentRecord ? {
            w: Number(currentRecord.Quat_w ?? 1),
            x: Number(currentRecord.Quat_x ?? 0),
            y: Number(currentRecord.Quat_y ?? 0),
            z: Number(currentRecord.Quat_z ?? 0),
        } : null;
        footprintCornersRef.current = currentPosition ? computeCameraFootprint(currentPosition, quat) : null;

        if (!cameraFootprintEntityRef.current) {
            cameraFootprintEntityRef.current = viewer.entities.add({
                name: 'Projection caméra (stripes)',
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

        // --- Fire-danger zones: draw the GeoJSON polygons the CubeSat transmits ---
        // Each detection frame carries a GeoJSON Polygon (already the outline within
        // the camera vision). We parse and add each one once (dedup by content) and
        // keep it, so the map shows exactly what the satellite has imaged.
        const fireVisible = mapOptions.fireZones !== false;
        for (const rec of trajectoryRecords) {
            const level = Number(rec?.Fire_Level ?? 0);
            const geojson = rec?.Fire_GeoJSON;
            if (!level || !geojson) continue;
            const key = `${level}:${geojson}`;
            if (fireZonesRef.current.has(key)) continue;
            const positions = fireGeojsonPositions(geojson);
            if (!positions) continue;
            const meta = FIRE_ZONE_LEVELS[level] ?? FIRE_ZONE_LEVELS[3];
            const color = Color.fromCssColorString(meta.color);
            fireZonesRef.current.set(key, viewer.entities.add({
                name: 'Zone feu',
                polygon: {
                    hierarchy: new PolygonHierarchy(positions),
                    material: new ColorMaterialProperty(color.withAlpha(0.45)),
                    outline: true,
                    outlineColor: color,
                    height: 0,
                },
                show: fireVisible,
            }));
        }

        // Toggle visibility only when it changes (avoid per-poll churn).
        if (fireVisible !== prevFireVisibleRef.current) {
            for (const ent of fireZonesRef.current.values()) ent.show = fireVisible;
            prevFireVisibleRef.current = fireVisible;
        }

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
                // Aim at the CubeSat's real altitude, not the ground point below it
                // (the yellow projection dot) — otherwise the camera centres on the
                // sol and the CubeSat drifts off-screen when it is high.
                const targetAlt = currentGeo.alt || 0;
                let followHeight;
                if (!wasFollowingRef.current) {
                    // Follow just enabled: snap once to a sensible zoom so the
                    // CubeSat is actually framed, without exceeding whatever the
                    // operator was already at if they were tighter.
                    followHeight = Math.min(cameraHeightRef.current, MAP_FOLLOW_CAMERA_HEIGHT);
                } else {
                    // Already following: preserve the operator's current zoom by
                    // reusing the real camera→CubeSat distance, so re-centering
                    // never forces the zoom in or out — only the center is locked.
                    const target = Cartesian3.fromDegrees(currentGeo.lon, currentGeo.lat, targetAlt);
                    followHeight = Cartesian3.distance(viewer.camera.positionWC, target);
                }
                setThreeDCameraView(viewer, currentGeo.lon, currentGeo.lat, followHeight, targetAlt);
            }
            wasFollowingRef.current = true;
        } else {
            wasFollowingRef.current = false;
        }
    }, [currentRecord, groundStationPos, mapOptions.follow, mapOptions.linkBeam, mapOptions.trajectory, mapOptions.projection, mapOptions.fireZones, trajectoryRecords]);

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