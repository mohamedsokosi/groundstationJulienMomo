import {
    ArcGisMapServerImageryProvider,
    Cartesian3,
    createWorldImageryAsync,
    Ion,
    IonWorldImageryStyle,
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

export const getTrajectoryCameraView = (records) => {
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
