import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
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

const AVAILABLE_FIELDS = [
    { key: 'U_Alt',      label: 'Altitude (m)' },
    { key: 'Speed',      label: 'Speed (m/s)' },
    { key: 'Vert_speed', label: 'Vertical Speed (m/s)' },
    { key: 'Pressure',   label: 'Pressure (hPa)' },
    { key: '#_Sat',      label: 'Satellites' },
    { key: 'U_Lat',      label: 'Latitude (°)' },
    { key: 'U_Long',     label: 'Longitude (°)' },
    { key: '_fspl',      label: 'FSPL (dB)' },
    { key: '_bilan',     label: 'Bilan de liaison (dBm)' },
    { key: '_distance',  label: 'Distance verticale (m)' },
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

// chart = { id, xKey, lines: [{key, color}], cols, ratio }
function TelemetryChart({ data, xKey, lines }) {
    const theme = useTheme();
    if (!data?.length || !lines?.length) return null;
    return (
        <Box sx={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.4)} />
                    <XAxis
                        dataKey={xKey}
                        tick={{ fontSize: 9, fill: theme.palette.text.secondary }}
                        stroke={theme.palette.divider}
                        label={{ value: fieldLabel(xKey), position: 'insideBottom', offset: 2, fontSize: 9, fill: theme.palette.text.secondary }}
                    />
                    <YAxis
                        tick={{ fontSize: 9, fill: theme.palette.text.secondary }}
                        stroke={theme.palette.divider}
                        width={38}
                        label={{ value: lines.length === 1 ? fieldLabel(lines[0].key) : '', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: theme.palette.text.secondary }}
                    />
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

function chartTitle(chart) {
    const x = fieldLabel(chart.xKey);
    if (chart.lines.length === 1) return `${fieldLabel(chart.lines[0].key)} vs ${x}`;
    return `${chart.lines.map((l) => fieldLabel(l.key)).join(', ')} vs ${x}`;
}

export default function AnalyseDashboard() {
    const theme = useTheme();
    const { chartData } = useTelemetryStream();
    const { setNode } = usePageActions();

    const [editMode, setEditMode] = useState(false);
    const [charts, setCharts] = useState(() => loadSavedCharts() ?? DEFAULT_CHARTS);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
    }, [charts]);

    // Add-chart form state
    const [newX, setNewX] = useState('U_Alt');
    const [newLines, setNewLines] = useState([{ key: 'Pressure', color: CHART_COLORS[0] }]);
    const [pendingY, setPendingY] = useState('Speed');

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
        const color = CHART_COLORS[newLines.length % CHART_COLORS.length];
        setNewLines((prev) => [...prev, { key: pendingY, color }]);
    };

    const removeLineFromForm = (key) => setNewLines((prev) => prev.filter((l) => l.key !== key));

    const addChart = () => {
        if (!newX || newLines.length === 0) return;
        setCharts((prev) => [
            ...prev,
            { id: Date.now(), xKey: newX, lines: newLines, cols: 3, ratio: '1/1' },
        ]);
        setNewLines([{ key: pendingY, color: CHART_COLORS[0] }]);
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
                            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={addChart}
                                disabled={newLines.length === 0}>
                                Créer graphique
                            </Button>
                        </Stack>

                        {/* Selected lines chips */}
                        {newLines.length > 0 && (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                {newLines.map((l) => (
                                    <Chip
                                        key={l.key}
                                        label={fieldLabel(l.key)}
                                        size="small"
                                        onDelete={() => removeLineFromForm(l.key)}
                                        sx={{ backgroundColor: alpha(l.color, 0.2), borderColor: l.color, border: '1px solid' }}
                                    />
                                ))}
                            </Stack>
                        )}
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
                                    <Box sx={{ flexShrink: 0, textAlign: 'center' }}>
                                        <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                                            {chartTitle(chart)}
                                        </Typography>
                                    </Box>
                                )}

                                <Box sx={{ flex: 1, minHeight: 0 }}>
                                    <TelemetryChart
                                        data={enrichedData}
                                        xKey={chart.xKey}
                                        lines={chart.lines}
                                    />
                                </Box>

                                {editMode && (
                                    <Typography variant="caption" color="text.secondary" sx={{ px: 0.5, pb: 0.25, flexShrink: 0, textAlign: 'center' }}>
                                        {chartTitle(chart)}
                                    </Typography>
                                )}
                            </Paper>
                        </Box>
                    );
                })}
            </Box>
        </Container>
    );
}
