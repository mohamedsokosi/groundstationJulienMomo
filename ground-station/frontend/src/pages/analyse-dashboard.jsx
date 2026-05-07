import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Container,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
} from '@mui/material';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useTelemetryStream } from './use-telemetry-stream.jsx';
import { usePageActions } from '../layout/page-actions-context.jsx';

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

// step = fixed page size for X-axis windowing (threshold to expand = 75% of step)
const AVAILABLE_FIELDS = [
    { key: '_elapsed_s',   label: 'Temps écoulé (s)',       step: 1000  },
    { key: '_elapsed_min', label: 'Temps écoulé (min)',     step: 100   },
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
    { key: 'T3',           label: 'Temp. 3 (°C)',           step: 10    },
    { key: 'T4',           label: 'Temp. 4 (°C)',           step: 10    },
    { key: 'T5',           label: 'Temp. 5 (°C)',           step: 10    },
    { key: 'T6',           label: 'Temp. 6 (°C)',           step: 10    },
    { key: 'T7',           label: 'Temp. 7 (°C)',           step: 10    },
    { key: 'T8',           label: 'Temp. 8 (°C)',           step: 10    },
];

function fieldLabel(key) {
    return AVAILABLE_FIELDS.find((f) => f.key === key)?.label || key;
}

function enrich(row) {
    const alt = parseFloat(row['U_Alt'] ?? row['U Alt']) || 0;
    const fspl = computeFSPL(alt);
    return { ...row, _fspl: fspl, _bilan: computeLinkBudget(fspl), _distance: alt };
}

const CHART_COLORS = ['#4cbc74', '#ee8a22', '#4fb7d6', '#d2b04c', '#8797ab', '#2e9f69'];

const SIZE_OPTIONS = [
    { value: 3,  label: '¼' },
    { value: 4,  label: '⅓' },
    { value: 6,  label: '½' },
    { value: 12, label: '1' },
];

const RATIO_OPTIONS = [
    { value: '1/1', label: '1:1' },
    { value: '2/1', label: '2:1' },
];

function gridCol(cols) {
    return {
        xs: '1 / -1',
        sm: cols >= 6 ? '1 / -1' : 'auto',
        md: `span ${cols}`,
    };
}

function fieldStep(key) {
    return AVAILABLE_FIELDS.find(f => f.key === key)?.step ?? 100;
}

function pagedDomain(maxVal, minVal, step) {
    const hi = (Math.floor(maxVal / step + 0.5) + 1) * step;
    const lo = minVal < 0 ? -(Math.floor(-minVal / step + 0.5) + 1) * step : 0;
    return [lo, hi];
}

// Smoothly animate a domain boundary whenever it changes (ease-out cubic, 500 ms)
function useAnimatedDomain(target, duration = 500) {
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
            const e = 1 - (1 - p) ** 3;
            const v = Math.round(from + (target - from) * e);
            valueRef.current = v;
            setDisplayed(v);
            if (p < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration]);

    return displayed;
}

// chart = { id, xKey, lines: [{key, color}], cols, ratio }
function TelemetryChart({ data, xKey, lines, tracking, onTrackingChange }) {
    const theme = useTheme();
    const scrollRef = useRef(null);
    const isPointerDownRef = useRef(false);
    const hasData = !!data?.length && !!lines?.length;

    // Track pointer state globally so we can tell a scrollbar drag from programmatic scrollTo
    useEffect(() => {
        const onDown = () => { isPointerDownRef.current = true; };
        const onUp   = () => { isPointerDownRef.current = false; };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('pointerup',   onUp);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointerup',   onUp);
        };
    }, []);
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

    // Build explicit X tick array so 0 is always shown and density is ~10 ticks/page.
    // Snap the interval to a "nice" power-of-10 multiple so labels are round numbers.
    const xTicks = useMemo(() => {
        if (!xDomainMax) return [0];
        const raw = stepX / 10;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / mag;
        const nice = n < 1.5 ? mag : n < 3.5 ? 2 * mag : n < 7.5 ? 5 * mag : 10 * mag;
        const count = Math.round(xDomainMax / nice);
        return Array.from({ length: Math.min(count, 500) + 1 }, (_, i) =>
            Math.round(i * nice * 1e9) / 1e9
        );
    }, [xDomainMax, stepX]);

    const pagesX = animXMax / stepX;

    // Auto-scroll to keep the latest X value near the right edge of the viewport
    useEffect(() => {
        if (!tracking || !hasData) return;
        const el = scrollRef.current;
        if (!el) return;
        // Map maxX to its pixel position inside the inner box, then place it at 50% across the viewport
        const dataPixel = (maxX / stepX) * el.clientWidth;
        const targetLeft = Math.max(0, dataPixel - el.clientWidth * 0.5);
        if (Math.abs(el.scrollLeft - targetLeft) < 2) return;
        el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }, [tracking, maxX, stepX, hasData]);

    // scrollTo never presses a pointer button, so isPointerDownRef stays false
    // during auto-scroll. Only an actual user drag raises the flag.
    const handleScroll = useCallback(() => {
        if (!isPointerDownRef.current) return;
        onTrackingChange(false);
    }, [onTrackingChange]);

    // Mouse wheel / trackpad — always user-initiated, no pointer-down needed
    const handleWheel = useCallback(() => {
        onTrackingChange(false);
    }, [onTrackingChange]);

    if (!hasData) return null;

    return (
        <Box sx={{ width: '100%', height: '100%', display: 'flex' }}>
            {/* Fixed Y-axis panel — does not scroll */}
            <Box sx={{ width: 50, flexShrink: 0, height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 4, right: 0, left: 8, bottom: 34 }}>
                        <YAxis
                            domain={[animYMin, animYMax]}
                            tick={{ fontSize: labelFs, fill: theme.palette.text.secondary }}
                            stroke={theme.palette.divider}
                            width={38}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Box>

            {/* Scrollable chart body */}
            <Box
                ref={scrollRef}
                onScroll={handleScroll}
                onWheel={handleWheel}
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
        </Box>
    );
}

const STORAGE_KEY = 'analyse_charts_config';

// Migrate old format { x, y, color } → new { xKey, lines: [{key, color}] }
function migrateChart(c) {
    if (c.lines) return c;
    return { ...c, xKey: c.x ?? c.xKey, lines: [{ key: c.y, color: c.color ?? CHART_COLORS[0] }] };
}

const loadSavedCharts = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            const validKeys = new Set(AVAILABLE_FIELDS.map((f) => f.key));
            const migrated = parsed.map(migrateChart).filter(
                (c) => validKeys.has(c.xKey) && c.lines?.some((l) => validKeys.has(l.key))
            );
            if (migrated.length) return migrated;
        }
    } catch {}
    return null;
};

const DEFAULT_CHARTS = [
    { id: 'default-0', xKey: 'U_Alt', lines: [{ key: '_bilan',   color: '#4cbc74' }], cols: 3, ratio: '1/1' },
    { id: 'default-1', xKey: 'U_Alt', lines: [{ key: '_fspl',    color: '#ee8a22' }], cols: 3, ratio: '1/1' },
    { id: 'default-2', xKey: 'U_Alt', lines: [{ key: 'Pressure', color: '#4fb7d6' }], cols: 3, ratio: '1/1' },
    { id: 'default-3', xKey: 'U_Alt', lines: [{ key: 'Speed',    color: '#d2b04c' }], cols: 3, ratio: '1/1' },
];

function ChartTitle({ chart, sx }) {
    const x = fieldLabel(chart.xKey);
    return (
        <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2, ...sx }}>
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

export default function AnalyseDashboard() {
    const theme = useTheme();
    const { chartData } = useTelemetryStream();
    const { setNode } = usePageActions();

    const [editMode, setEditMode] = useState(false);
    const [charts, setCharts] = useState(() => loadSavedCharts() ?? DEFAULT_CHARTS);
    const [trackingMap, setTrackingMap] = useState({});
    const isTracking = useCallback((id) => trackingMap[id] !== false, [trackingMap]);
    const setChartTracking = useCallback((id, val) => setTrackingMap(prev => ({ ...prev, [id]: val })), []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
    }, [charts]);

    // Add-chart form state
    const [newX, setNewX] = useState('_elapsed_min');
    const [newLines, setNewLines] = useState([]);
    const [pendingY, setPendingY] = useState('U_Alt');

    const chartsRef = useRef(charts);
    chartsRef.current = charts;

    const dragSrcId = useRef(null);
    const [dragOverId, setDragOverId] = useState(null);

    const enrichedData = useMemo(
        () => (chartData?.length ? chartData.map(enrich) : []),
        [chartData],
    );

    const addLineToForm = () => {
        if (!pendingY || newLines.find((l) => l.key === pendingY)) return;
        const usedColors = new Set(newLines.map((l) => l.color));
        const color = CHART_COLORS.find((c) => !usedColors.has(c)) ?? CHART_COLORS[newLines.length % CHART_COLORS.length];
        setNewLines((prev) => [...prev, { key: pendingY, color }]);
    };

    const removeLineFromForm = (key) => setNewLines((prev) => prev.filter((l) => l.key !== key));

    const addChart = () => {
        if (!newX || !pendingY) return;
        const effectiveLines = newLines.length > 0
            ? newLines
            : [{ key: pendingY, color: CHART_COLORS[0] }];
        setCharts((prev) => [
            ...prev,
            { id: Date.now(), xKey: newX, lines: effectiveLines, cols: 3, ratio: '1/1' },
        ]);
        setNewLines([]);
    };

    const removeChart = (id) => setCharts((prev) => prev.filter((c) => c.id !== id));
    const updateChart = (id, patch) =>
        setCharts((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));

    const exportConfig = useCallback(() => {
        const config = { version: 2, charts: chartsRef.current };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'analyse-graphiques.json';
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    const importConfig = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                const raw = Array.isArray(parsed) ? parsed : (parsed.charts ?? []);
                const validKeys = new Set(AVAILABLE_FIELDS.map((f) => f.key));
                const imported = raw.map(migrateChart).filter(
                    (c) => validKeys.has(c.xKey) && c.lines?.some((l) => validKeys.has(l.key))
                ).map((c) => ({ ...c, id: `imported-${Date.now()}-${Math.random()}` }));
                if (imported.length) setCharts(imported);
            } catch {}
        };
        reader.readAsText(file);
        e.target.value = '';
    }, []);

    useEffect(() => {
        setNode(
            <Stack direction="row" spacing={1} sx={{ mr: 1 }}>
                <Button variant="outlined" size="small" startIcon={<FileUploadIcon />} onClick={exportConfig}
                    sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white' } }}>
                    Exporter
                </Button>
                <Button variant="outlined" size="small" component="label" startIcon={<FileDownloadIcon />}
                    sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white' } }}>
                    Importer
                    <input type="file" accept=".json" hidden onChange={importConfig} />
                </Button>
                <Button
                    variant={editMode ? 'contained' : 'outlined'}
                    size="small"
                    startIcon={editMode ? <CheckIcon /> : <EditIcon />}
                    onClick={() => setEditMode((v) => !v)}
                    color={editMode ? 'success' : 'inherit'}
                    sx={editMode ? {} : { color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white' } }}
                >
                    {editMode ? 'Terminer' : 'Modifier'}
                </Button>
            </Stack>
        );
        return () => setNode(null);
    }, [editMode, exportConfig, importConfig, setNode]);

    const handleDragStart = (e, id) => {
        dragSrcId.current = id;
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragOver = (e, id) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (id !== dragSrcId.current) setDragOverId(id);
    };
    const handleDrop = (e, targetId) => {
        e.preventDefault();
        const srcId = dragSrcId.current;
        if (!srcId || srcId === targetId) return;
        setCharts((prev) => {
            const next = [...prev];
            const from = next.findIndex((c) => c.id === srcId);
            const to   = next.findIndex((c) => c.id === targetId);
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
        dragSrcId.current = null;
        setDragOverId(null);
    };
    const handleDragEnd = () => {
        dragSrcId.current = null;
        setDragOverId(null);
    };

    return (
        <Container maxWidth="xl" sx={{ py: 1, px: 1 }}>
            {/* Add chart form — edit mode only */}
            {editMode && (
                <Paper sx={{ p: 1, borderRadius: 1, mb: 0.5, border: `1px solid ${alpha(theme.palette.primary.main, 0.5)}` }}>
                    <Stack spacing={1}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-end' }}>
                            {/* X axis */}
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                                <InputLabel>Axe X</InputLabel>
                                <Select value={newX} onChange={(e) => setNewX(e.target.value)} label="Axe X">
                                    {AVAILABLE_FIELDS.map((f) => (
                                        <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {/* Add a Y series */}
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                                <InputLabel>Ajouter série Y</InputLabel>
                                <Select value={pendingY} onChange={(e) => setPendingY(e.target.value)} label="Ajouter série Y">
                                    {AVAILABLE_FIELDS.map((f) => (
                                        <MenuItem key={f.key} value={f.key} disabled={!!newLines.find((l) => l.key === f.key)}>
                                            {f.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addLineToForm}
                                disabled={!!newLines.find((l) => l.key === pendingY)}>
                                Série
                            </Button>
                            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={addChart}>
                                Créer graphique
                            </Button>
                        </Stack>

                        {/* Series chips — show explicit lines or implicit pendingY preview */}
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {newLines.length > 0 ? (
                                newLines.map((l) => (
                                    <Chip
                                        key={l.key}
                                        label={fieldLabel(l.key)}
                                        size="small"
                                        onDelete={() => removeLineFromForm(l.key)}
                                        sx={{ backgroundColor: alpha(l.color, 0.2), borderColor: l.color, border: '1px solid' }}
                                    />
                                ))
                            ) : (
                                <Chip
                                    label={fieldLabel(pendingY)}
                                    size="small"
                                    sx={{ backgroundColor: alpha(CHART_COLORS[0], 0.1), borderColor: alpha(CHART_COLORS[0], 0.4), border: '1px dashed', color: 'text.secondary' }}
                                />
                            )}
                        </Stack>
                    </Stack>
                </Paper>
            )}

            {/* Charts grid */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(12, 1fr)' },
                gap: 0.5,
            }}>
                {charts.map((chart) => {
                    const cols  = chart.cols  ?? 3;
                    const ratio = chart.ratio ?? '1/1';
                    const isDragging = dragSrcId.current === chart.id;
                    const isOver    = dragOverId === chart.id;

                    return (
                        <Box
                            key={chart.id}
                            draggable={editMode}
                            onDragStart={(e) => handleDragStart(e, chart.id)}
                            onDragOver={(e) => handleDragOver(e, chart.id)}
                            onDrop={(e) => handleDrop(e, chart.id)}
                            onDragEnd={handleDragEnd}
                            sx={{
                                gridColumn: gridCol(cols),
                                aspectRatio: ratio,
                                minWidth: 0,
                                opacity: isDragging ? 0.35 : 1,
                                transition: 'opacity 0.15s',
                                cursor: editMode ? 'grab' : 'default',
                            }}
                        >
                            <Paper sx={{
                                p: 0,
                                borderRadius: 1,
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                outline: isOver
                                    ? `2px solid ${theme.palette.primary.main}`
                                    : editMode
                                        ? `2px dashed ${alpha(theme.palette.primary.main, 0.4)}`
                                        : '2px solid transparent',
                                transition: 'outline 0.1s',
                            }}>
                                {/* Edit toolbar */}
                                {editMode ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.5, pt: 0.5, flexShrink: 0, flexWrap: 'wrap' }}>
                                        <DragIndicatorIcon fontSize="small" sx={{ color: theme.palette.text.disabled, cursor: 'grab' }} />
                                        <ToggleButtonGroup value={cols} exclusive size="small"
                                            onChange={(_, v) => { if (v) updateChart(chart.id, { cols: v }); }}>
                                            {SIZE_OPTIONS.map((o) => (
                                                <ToggleButton key={o.value} value={o.value} sx={{ px: 1, py: 0.25, fontSize: 11, lineHeight: 1.5, minWidth: 28 }}>
                                                    {o.label}
                                                </ToggleButton>
                                            ))}
                                        </ToggleButtonGroup>
                                        <ToggleButtonGroup value={ratio} exclusive size="small"
                                            onChange={(_, v) => { if (v) updateChart(chart.id, { ratio: v }); }}>
                                            {RATIO_OPTIONS.map((o) => (
                                                <ToggleButton key={o.value} value={o.value} sx={{ px: 1, py: 0.25, fontSize: 11, lineHeight: 1.5, minWidth: 34 }}>
                                                    {o.label}
                                                </ToggleButton>
                                            ))}
                                        </ToggleButtonGroup>
                                        <IconButton size="small" onClick={() => removeChart(chart.id)}
                                            sx={{ color: theme.palette.error.main, ml: 'auto' }}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                ) : (
                                    <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', px: 0.5, pt: 0.25 }}>
                                        <Box sx={{ flex: 1, textAlign: 'center' }}>
                                            <ChartTitle chart={chart} />
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                            <Checkbox
                                                size="small"
                                                checked={isTracking(chart.id)}
                                                onChange={(e) => setChartTracking(chart.id, e.target.checked)}
                                                sx={{ p: 0.25, color: alpha(theme.palette.text.secondary, 0.5) }}
                                            />
                                            <Typography variant="caption" sx={{
                                                fontSize: 10, lineHeight: 1, userSelect: 'none',
                                                color: isTracking(chart.id) ? 'text.secondary' : alpha(theme.palette.text.secondary, 0.4),
                                            }}>
                                                Track
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}

                                <Box sx={{ flex: 1, minHeight: 0 }}>
                                    <TelemetryChart
                                        data={enrichedData}
                                        xKey={chart.xKey}
                                        lines={chart.lines}
                                        tracking={isTracking(chart.id)}
                                        onTrackingChange={(val) => setChartTracking(chart.id, val)}
                                    />
                                </Box>

                                {editMode && (
                                    <Box sx={{ px: 0.5, pb: 0.25, flexShrink: 0, textAlign: 'center' }}>
                                        <ChartTitle chart={chart} />
                                    </Box>
                                )}
                            </Paper>
                        </Box>
                    );
                })}
            </Box>
        </Container>
    );
}
