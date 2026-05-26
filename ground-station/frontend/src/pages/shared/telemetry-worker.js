// Web Worker: offloads buildTelemetryChartData + enrich off the main thread.
//
// Why: with 5000 frames in the live window, the chart-data build (outage
// reconstruction walk + per-row map producing 18 fields each) plus the
// per-row enrich (FSPL / link budget / distance) takes long enough to stall
// Cesium animation and Recharts re-renders during continuous MQTT updates.
// Moving it to a worker means the main thread only pays the structured-clone
// cost of postMessage, freeing it to keep the globe and charts smooth.
//
// Vite picks this up as an ESM worker via `?worker` import in the hook.

import { buildTelemetryChartData } from './telemetry-data-source.js';
import { enrich } from './chart-logic.js';

self.onmessage = (event) => {
    const { data, requestId } = event.data || {};
    if (!Array.isArray(data)) {
        self.postMessage({ chartData: [], requestId });
        return;
    }
    const chartData = buildTelemetryChartData(data);
    for (const row of chartData) enrich(row);
    self.postMessage({ chartData, requestId });
};
