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

const initialTerminalVariantState = { lines: [], cursor: 0, inBlackout: false, bridgeLogId: 0 };

const initialState = {
    telemetryData: [],
    loading: false,
    error: null,
    selectedPoint: null,
    playbackIndex: 0,
    streamIndex: 0,
    terminalState: {
        telemetry: { ...initialTerminalVariantState },
        verbose:   { ...initialTerminalVariantState },
        errors:    { ...initialTerminalVariantState },
    },
};

const TERMINAL_MAX_LINES = { telemetry: 5, verbose: 1, errors: 500 };

const telemetrySlice = createSlice({
    name: 'telemetry',
    initialState,
    reducers: {
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
        clearTelemetryData: (state) => {
            state.telemetryData = [];
            state.selectedPoint = null;
            state.playbackIndex = 0;
            state.streamIndex = 0;
            state.loading = false;
            state.error = null;
            for (const k of Object.keys(state.terminalState)) {
                state.terminalState[k] = { ...initialTerminalVariantState };
            }
        },
        appendTerminalLines: (state, action) => {
            const {
                variant, lines, cursor, inBlackout, bridgeLogId, fromCursor, backendDown,
            } = action.payload || {};
            const v = state.terminalState[variant];
            if (!v) return;
            // Telemetry-derived batches declare the cursor they were computed
            // from. Two mounted errors terminals (left column + stats bar) — or a
            // StrictMode effect re-run — process the same new frames and dispatch
            // the SAME batch twice; only the first still matches v.cursor, the
            // echo is dropped whole. This is what keeps every anomaly line from
            // appearing twice.
            if (fromCursor !== undefined && fromCursor !== v.cursor) return;
            // Backend down/up transition lines: idempotent via a persisted flag,
            // so concurrent terminal instances can't both announce the same event.
            if (backendDown !== undefined) {
                if (Boolean(v.backendDown) === backendDown) return;
                v.backendDown = backendDown;
            }
            if (cursor !== undefined) v.cursor = cursor;
            if (inBlackout !== undefined) v.inBlackout = inBlackout;
            if (bridgeLogId !== undefined) v.bridgeLogId = bridgeLogId;
            if (lines?.length) {
                // Dedup by stable id: bridge-log lines carry `bridge-<id>` and a
                // re-poll can re-deliver the same entry (telemetry batches are
                // already handled by the fromCursor guard above).
                const seen = new Set(v.lines.map((l) => l.id));
                const fresh = lines.filter((l) => !seen.has(l.id));
                if (fresh.length) {
                    v.lines.push(...fresh);
                    const max = TERMINAL_MAX_LINES[variant] ?? 500;
                    if (v.lines.length > max) v.lines = v.lines.slice(v.lines.length - max);
                }
            }
        },
        resetTerminalVariant: (state, action) => {
            const variant = action.payload;
            const v = state.terminalState[variant];
            if (!v) return;
            v.lines = [];
            v.cursor = 0;
            v.inBlackout = false;
        },
        resetAllTerminalVariants: (state) => {
            for (const k of Object.keys(state.terminalState)) {
                state.terminalState[k] = { ...initialTerminalVariantState };
            }
        },
    },
});

export const {
    setTelemetryData,
    appendTelemetryPoint,
    appendTelemetryPoints,
    setLoading,
    setError,
    setSelectedPoint,
    setPlaybackState,
    clearTelemetryData,
    appendTerminalLines,
    resetTerminalVariant,
    resetAllTerminalVariants,
} = telemetrySlice.actions;

export default telemetrySlice.reducer;
