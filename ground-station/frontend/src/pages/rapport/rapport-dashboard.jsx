import React, { useMemo } from 'react';
import { Box, Button, Container, GlobalStyles, Paper, Typography } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import {
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useTelemetryStream } from '../shared/use-telemetry-stream.jsx';
import { AVAILABLE_FIELDS, CHART_COLORS, fieldLabel, fieldStep } from '../shared/chart-fields.js';
import { pagedDomain } from '../shared/chart-logic.js';

const ANALYSE_STORAGE_KEY = 'analyse_charts_config';

// The two hardcoded charts shown at the bottom of /station (BOTTOM_CHART_DEFS).
const STATION_CHARTS = [
    { id: 'report-station-alt',   xKey: '_elapsed_min', lines: [{ key: 'U_Alt', color: '#4fb7d6' }] },
    { id: 'report-station-speed', xKey: '_elapsed_min', lines: [{ key: 'Speed', color: '#ee8a22' }] },
];

function migrateChart(c) {
    if (c.lines) return c;
    return { ...c, xKey: c.x ?? c.xKey, lines: [{ key: c.y, color: c.color ?? CHART_COLORS[0] }] };
}

// All charts the operator configured on /analyse (persisted in localStorage).
function loadAnalyseCharts() {
    try {
        const saved = localStorage.getItem(ANALYSE_STORAGE_KEY);
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        const validKeys = new Set(AVAILABLE_FIELDS.map((f) => f.key));
        return parsed.map(migrateChart).filter(
            (c) => validKeys.has(c.xKey) && c.lines?.some((l) => validKeys.has(l.key)),
        );
    } catch {
        return [];
    }
}

// Thin out the series so static (non-scrolling) report charts stay light in the PDF.
function decimate(data, max = 1500) {
    if (!data || data.length <= max) return data || [];
    const step = Math.ceil(data.length / max);
    const out = [];
    for (let i = 0; i < data.length; i += step) out.push(data[i]);
    if (out[out.length - 1] !== data[data.length - 1]) out.push(data[data.length - 1]);
    return out;
}

// Same "nice" rounding the dashboard chart uses to turn a raw step into a clean
// tick interval (1 / 2 / 5 / 10 × power of ten).
function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return n < 1.5 ? mag : n < 3.5 ? 2 * mag : n < 7.5 ? 5 * mag : 10 * mag;
}

// Build integer-aligned X ticks and step-aligned Y ticks from chart-fields.js
// steps — same logic as telemetryChart.jsx so elapsed_min lands on 1, 2, 3…
// (no fractions) and Y keeps its configured granularity.
function buildAxes(data, xKey, lines) {
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    for (const d of data) {
        const x = Number(d[xKey]) || 0;
        if (x > maxX) maxX = x;
        for (const { key } of lines) {
            const v = Number(d[key]) || 0;
            if (v > maxY) maxY = v;
            if (v < minY) minY = v;
        }
    }
    const stepY = lines.reduce((m, { key }) => Math.max(m, fieldStep(key)), 0) || 100;
    const [yMin, yMax] = pagedDomain(maxY, minY, stepY);

    // Few, evenly-spaced ticks (nice multiples of 1/2/5/10×10ⁿ) so a full-flight
    // X range stays readable in the fixed-width PDF chart instead of cramming a
    // label every minute. Step scales with the range to target ~8 ticks.
    const niceX = niceStep(maxX / 8);
    const xTicks = [];
    for (let v = 0; v <= maxX + niceX * 1e-6 && xTicks.length <= 200; v += niceX) {
        xTicks.push(Math.round(v * 1e9) / 1e9);
    }

    const niceY = niceStep((yMax - yMin) / 8 || stepY);
    const yTicks = [];
    const loY = Math.ceil(yMin / niceY) * niceY;
    for (let v = loY; v <= yMax + niceY * 1e-6 && yTicks.length <= 200; v += niceY) {
        yTicks.push(Math.round(v * 1e9) / 1e9);
    }

    return { xMax: maxX, yMin, yMax, xTicks, yTicks };
}

function ReportChart({ data, xKey, lines }) {
    const hasBlackout = useMemo(() => data.some((d) => d._blackout), [data]);

    // Split each series into a normal segment and a red "ghost" segment so
    // telemetry-loss periods render red in the PDF, same as /station & /analyse.
    const transformed = useMemo(() => {
        if (!hasBlackout) return data;
        const lastIsBlackout = Boolean(data[data.length - 1]?._blackout);
        let connectIdx = -1;
        if (lastIsBlackout) {
            for (let i = data.length - 1; i >= 0; i--) {
                if (!data[i]._blackout) { connectIdx = i; break; }
            }
        }
        return data.map((d, i) => {
            const isGhost = Boolean(d._blackout);
            const isConnect = i === connectIdx;
            const out = { ...d };
            for (const { key } of lines) {
                out[`${key}_normal`] = isGhost ? undefined : d[key];
                out[`${key}_ghost`]  = (isGhost || isConnect) ? d[key] : undefined;
            }
            return out;
        });
    }, [data, lines, hasBlackout]);

    const render = useMemo(() => decimate(transformed), [transformed]);
    const { xMax, yMin, yMax, xTicks, yTicks } = useMemo(
        () => buildAxes(render, xKey, lines),
        [render, xKey, lines],
    );
    return (
        <Paper
            className="report-chart"
            variant="outlined"
            sx={{ p: 2, borderRadius: 2, breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
                {lines.map((l, i) => (
                    <React.Fragment key={l.key}>
                        {i > 0 && ', '}
                        <span style={{ color: l.color }}>{fieldLabel(l.key)}</span>
                    </React.Fragment>
                ))}
                {` vs ${fieldLabel(xKey)}`}
            </Typography>
            <Box sx={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={render} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <XAxis
                            dataKey={xKey}
                            type="number"
                            domain={[0, xMax]}
                            ticks={xTicks}
                            interval={0}
                            allowDecimals={false}
                            height={28}
                            tickMargin={4}
                            tick={{ fontSize: 9 }}
                        />
                        <YAxis
                            domain={[yMin, yMax]}
                            ticks={yTicks}
                            tick={{ fontSize: 9 }}
                            width={48}
                        />
                        <Tooltip formatter={(v, name) => [typeof v === 'number' ? v.toFixed(2) : v, name]} />
                        {lines.length > 1 && <Legend />}
                        {hasBlackout
                            ? lines.flatMap(({ key, color }) => [
                                <Line
                                    key={`${key}_normal`}
                                    type="monotone"
                                    dataKey={`${key}_normal`}
                                    name={fieldLabel(key)}
                                    stroke={color}
                                    dot={false}
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                    connectNulls={false}
                                />,
                                <Line
                                    key={`${key}_ghost`}
                                    type="monotone"
                                    dataKey={`${key}_ghost`}
                                    name={fieldLabel(key)}
                                    stroke="#ff3030"
                                    dot={false}
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                    connectNulls={false}
                                />,
                            ])
                            : lines.map(({ key, color }) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    name={fieldLabel(key)}
                                    stroke={color}
                                    dot={false}
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                />
                            ))}
                    </LineChart>
                </ResponsiveContainer>
            </Box>
        </Paper>
    );
}

export default function RapportDashboard() {
    const { chartData, hasData } = useTelemetryStream();
    const analyseCharts = useMemo(loadAnalyseCharts, []);
    const allCharts = useMemo(() => [...STATION_CHARTS, ...analyseCharts], [analyseCharts]);

    const handleExportPDF = () => window.print();

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            {/* Print rules: hide chrome + controls. Force the chart grid to a
                single block column in print — CSS grid items frequently ignore
                break-inside, so a block layout is what reliably keeps each chart
                whole on one page. */}
            <GlobalStyles
                styles={{
                    '@media print': {
                        '.MuiAppBar-root, .MuiDrawer-root, .no-print': { display: 'none !important' },
                        main: { marginTop: '0 !important' },
                        body: { background: '#fff' },
                        '.report-grid': { display: 'block !important' },
                        '.report-chart': {
                            breakInside: 'avoid',
                            pageBreakInside: 'avoid',
                            width: '100% !important',
                            marginBottom: '16px',
                        },
                    },
                }}
            />

            <Box
                className="no-print"
                sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}
            >
                <Box>
                    <Typography variant="h4">Report</Typography>
                    <Typography variant="body2" color="text.secondary">
                        PDF export of the two /station charts (Altitude, Speed) and all /analyse charts.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    color="error"
                    startIcon={<PictureAsPdfIcon />}
                    onClick={handleExportPDF}
                    disabled={!hasData}
                >
                    Export PDF
                </Button>
            </Box>

            {!hasData && (
                <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Waiting for telemetry…
                </Typography>
            )}

            <Box
                className="report-grid"
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 2,
                }}
            >
                {allCharts.map((c, i) => (
                    <ReportChart
                        key={c.id ?? `${c.xKey}-${c.lines.map((l) => l.key).join('-')}-${i}`}
                        data={chartData}
                        xKey={c.xKey}
                        lines={c.lines}
                    />
                ))}
            </Box>
        </Container>
    );
}
