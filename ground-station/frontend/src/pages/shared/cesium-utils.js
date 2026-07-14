import {
    ArcGisMapServerImageryProvider,
    Cartesian3,
    Cartographic,
    createWorldImageryAsync,
    Ion,
    IonWorldImageryStyle,
    Math as CesiumMath,
    OpenStreetMapImageryProvider,
    TileMapServiceImageryProvider,
} from 'cesium';
import { getTelemetryNumber, toTelemetryNumber } from './telemetry-utils.js';

export const DEFAULT_CENTER = [48.55, -81.35];
export const DEFAULT_GS_POSITION = { lat: DEFAULT_CENTER[0], lon: DEFAULT_CENTER[1] };
export const GS_POSITION_KEY = 'station_ground_station_position';

export function loadGroundStationPosition() {
    try {
        const saved = localStorage.getItem(GS_POSITION_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') return parsed;
        }
    } catch (_) { /* ignore */ }
    return DEFAULT_GS_POSITION;
}

export function saveGroundStationPosition(pos) {
    try { localStorage.setItem(GS_POSITION_KEY, JSON.stringify(pos)); } catch (_) { /* ignore */ }
}
export const MAP_CAMERA_HEIGHT = 180000;
// 27 km — 70% more zoomed than the previous 90 km follow height (90 000 × 0.30).
export const MAP_FOLLOW_CAMERA_HEIGHT = 27000;
export const MAP_CAMERA_PITCH = -48;
export const MAP_CAMERA_HEADING = 32;
export const MAP_MIN_CAMERA_HEIGHT = 12000;
export const MAP_MAX_CAMERA_HEIGHT = 2400000;
export const MAP_ZOOM_FACTOR = 0.36;
export const ARCGIS_WORLD_IMAGERY_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

export const getTelemetryRecordGeo = (record) => {
    const lat = toTelemetryNumber(record?.['U_Lat'], null);
    const lon = toTelemetryNumber(record?.['U_Long'], null);
    const alt = getTelemetryNumber(record, ['U_Alt', 'U Alt'], 0);
    if (lat === null || lon === null) return null;
    // (0,0) is the GPS no-fix sentinel, not a real position — returning null
    // keeps the CubeSat model/trajectory at the last valid fix instead of
    // teleporting to the Gulf of Guinea.
    if (lat === 0 && lon === 0) return null;
    return { lat, lon, alt };
};

export const getCesiumRecordPosition = (record) => {
    const geo = getTelemetryRecordGeo(record);
    if (!geo) return null;
    return Cartesian3.fromDegrees(geo.lon, geo.lat, geo.alt);
};

export const getCesiumGroundPosition = (record) => {
    const geo = getTelemetryRecordGeo(record);
    if (!geo) return null;
    return Cartesian3.fromDegrees(geo.lon, geo.lat, 0);
};

const cameraViewFromLatLon = (lats, lons) => {
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

// Camera fit computed from the ALREADY-DRAWN Cartesian3 positions (the ones that
// passed the plausibility gate), not the raw records. A teleported fix is a
// perfectly valid-looking lat/lon — getTelemetryRecordGeo can't tell — so fitting
// the camera to raw records would zoom all the way out to fit the bad point every
// time the view remounts. Fitting to the gated positions keeps that from happening.
export const getCameraViewFromPositions = (positions) => {
    if (!positions || positions.length === 0) {
        return { lon: DEFAULT_CENTER[1], lat: DEFAULT_CENTER[0], height: MAP_CAMERA_HEIGHT };
    }
    const lats = [];
    const lons = [];
    for (const p of positions) {
        const carto = Cartographic.fromCartesian(p);
        if (!carto) continue;
        lats.push(CesiumMath.toDegrees(carto.latitude));
        lons.push(CesiumMath.toDegrees(carto.longitude));
    }
    if (lats.length === 0) {
        return { lon: DEFAULT_CENTER[1], lat: DEFAULT_CENTER[0], height: MAP_CAMERA_HEIGHT };
    }
    return cameraViewFromLatLon(lats, lons);
};

export const createBaseImageryProvider = async () => {
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
