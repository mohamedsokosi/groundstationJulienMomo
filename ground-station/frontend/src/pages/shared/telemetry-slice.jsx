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

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    telemetryData: [],
    sourceData: [],
    loading: false,
    error: null,
    selectedPoint: null,
    playbackIndex: 0,
    streamIndex: 0,
    mode: 'stream',
    sourceMode: 'mqtt',
};

const telemetrySlice = createSlice({
    name: 'telemetry',
    initialState,
    reducers: {
        setTelemetrySourceData: (state, action) => {
            state.sourceData = action.payload || [];
            state.error = null;
        },
        setTelemetryData: (state, action) => {
            state.telemetryData = action.payload;
            state.error = null;
        },
        appendTelemetryPoint: (state, action) => {
            const { point, maxPoints = 500 } = action.payload || {};

            if (!point) {
                return;
            }

            const last = state.telemetryData[state.telemetryData.length - 1];
            if (last !== undefined && point.streamIndex <= last.streamIndex) {
                state.telemetryData = [];
            }

            state.telemetryData.push(point);

            if (state.telemetryData.length > maxPoints) {
                state.telemetryData = state.telemetryData.slice(-maxPoints);
            }

            state.error = null;
        },
        appendTelemetryPoints: (state, action) => {
            const { points, maxPoints = 500 } = action.payload || {};
            if (!points?.length) return;
            for (const point of points) {
                const last = state.telemetryData[state.telemetryData.length - 1];
                if (last !== undefined && point.streamIndex <= last.streamIndex) {
                    state.telemetryData = [];
                }
                state.telemetryData.push(point);
            }
            if (state.telemetryData.length > maxPoints) {
                state.telemetryData = state.telemetryData.slice(-maxPoints);
            }
            state.error = null;
        },
        setLoading: (state, action) => {
            state.loading = action.payload;
        },
        setError: (state, action) => {
            state.error = action.payload;
        },
        setSelectedPoint: (state, action) => {
            state.selectedPoint = action.payload;
        },
        setPlaybackState: (state, action) => {
            state.playbackIndex = action.payload?.playbackIndex ?? state.playbackIndex;
            state.streamIndex = action.payload?.streamIndex ?? state.streamIndex;
        },
        setTelemetryMode: (state, action) => {
            state.mode = action.payload || 'stream';
        },
        resetTelemetryStream: (state) => {
            state.telemetryData = [];
            state.playbackIndex = 0;
            state.streamIndex = 0;
            state.selectedPoint = null;
            state.error = null;
        },
        clearTelemetryData: (state) => {
            state.telemetryData = [];
            state.sourceData = [];
            state.selectedPoint = null;
            state.playbackIndex = 0;
            state.streamIndex = 0;
            state.loading = false;
            state.error = null;
            state.mode = 'stream';
        },
        setSourceMode: (state, action) => {
            state.sourceMode = action.payload === 'mqtt' ? 'mqtt' : 'csv';
        },
    },
});

export const {
    setTelemetrySourceData,
    setTelemetryData,
    appendTelemetryPoint,
    appendTelemetryPoints,
    setLoading,
    setError,
    setSelectedPoint,
    setPlaybackState,
    setTelemetryMode,
    resetTelemetryStream,
    clearTelemetryData,
    setSourceMode,
} = telemetrySlice.actions;

export default telemetrySlice.reducer;
