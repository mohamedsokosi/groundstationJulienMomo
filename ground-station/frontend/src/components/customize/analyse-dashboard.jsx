import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
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
import UploadIcon from '@mui/icons-material/Upload';
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

function TelemetryChart({ data, xKey, yKey, color = '#4cbc74' }) {
    const theme = useTheme();
    if (!data?.length) return null;
    return (
        <Box sx={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.4)} />
                    <XAxis
                        dataKey={xKey}
                        tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                        label={{ value: fieldLabel(xKey), position: 'insideBottom', offset: -16, fontSize: 11, fill: theme.palette.text.secondary }}
                        stroke={theme.palette.divider}
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                        label={{ value: fieldLabel(yKey), angle: -90, position: 'insideLeft', offset: 12, fontSize: 11, fill: theme.palette.text.secondary }}
                        stroke={theme.palette.divider}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: theme.palette.background.paper,
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                        formatter={(v) => [typeof v === 'number' ? v.toFixed(2) : v, fieldLabel(yKey)]}
                        labelFormatter={(v) => `${fieldLabel(xKey)}: ${typeof v === 'number' ? v.toFixed(1) : v}`}
                    />
                    <Line type="monotone" dataKey={yKey} stroke={color} dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        </Box>
    );
}

const STORAGE_KEY = 'analyse_charts_config';

const loadSavedCharts = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            const validKeys = new Set(AVAILABLE_FIELDS.map((f) => f.key));
            const valid = parsed.filter((c) => validKeys.has(c.x) && validKeys.has(c.y));
            if (valid.length) return valid;
        }
    } catch {}
    return null;
};

const DEFAULT_CHARTS = [
    { id: 'default-0', x: 'U_Alt', y: '_bilan',   color: '#4cbc74', cols: 3, ratio: '1/1' },
    { id: 'default-1', x: 'U_Alt', y: '_fspl',    color: '#ee8a22', cols: 3, ratio: '1/1' },
    { id: 'default-2', x: 'U_Alt', y: 'Pressure', color: '#4fb7d6', cols: 3, ratio: '1/1' },
    { id: 'default-3', x: 'U_Alt', y: 'Speed',    color: '#d2b04c', cols: 3, ratio: '1/1' },
];

export default function AnalyseDashboard() {
    const theme = useTheme();
    const { chartData, hasData, loading, loadFromFile } = useTelemetryStream();

    const [editMode, setEditMode] = useState(false);
    const [charts, setCharts] = useState(() => loadSavedCharts() ?? DEFAULT_CHARTS);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
    }, [charts]);
    const [newX, setNewX] = useState('U_Alt');
    const [newY, setNewY] = useState('Pressure');

    // Drag state
    const dragSrcId = useRef(null);
    const [dragOverId, setDragOverId] = useState(null);

    const enrichedData = useMemo(
        () => (chartData?.length ? chartData.map(enrich) : []),
        [chartData],
    );

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        void loadFromFile(file, { stream: true });
        e.target.value = '';
    };

    const addChart = () => {
        if (newX && newY && newX !== newY) {
            const colorIdx = charts.length % CHART_COLORS.length;
            setCharts((prev) => [
                ...prev,
                { id: Date.now(), x: newX, y: newY, color: CHART_COLORS[colorIdx], cols: 3, ratio: '1/1' },
            ]);
        }
    };

    const removeChart = (id) => setCharts((prev) => prev.filter((c) => c.id !== id));

    const updateChart = (id, patch) =>
        setCharts((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));

    const exportConfig = () => {
        const config = { version: 1, charts };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'analyse-graphiques.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const importConfig = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                const raw = Array.isArray(parsed) ? parsed : (parsed.charts ?? []);
                const validKeys = new Set(AVAILABLE_FIELDS.map((f) => f.key));
                const imported = raw
                    .filter((c) => validKeys.has(c.x) && validKeys.has(c.y))
                    .map((c) => ({
                        x: c.x,
                        y: c.y,
                        color: c.color ?? CHART_COLORS[0],
                        cols: c.cols ?? 3,
                        ratio: c.ratio ?? '1/1',
                        id: `imported-${Date.now()}-${Math.random()}`,
                    }));
                if (imported.length) setCharts(imported);
            } catch {
                // fichier JSON invalide — silencieux
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleDragStart = (e, id) => {
        dragSrcId.current = id;
        e.dataTransfer.effectAllowed = 'move';
        // ghost image = the element itself, so default is fine
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
        <Container maxWidth="xl" sx={{ py: 4 }}>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ mb: 1.5 }}>Analyse</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 860 }}>
                    Graphiques de télémétrie personnalisables.
                </Typography>
                <Box sx={{ mt: 2.5 }}>
                    <Button variant="contained" component="label" startIcon={<UploadIcon />}>
                        Charger un CSV
                        <input type="file" accept=".csv" hidden onChange={handleFileUpload} />
                    </Button>
                </Box>
            </Box>

            {!hasData && !loading && (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>Aucune donnée chargée</Typography>
                    <Typography color="text.secondary">
                        Chargez un fichier CSV de télémétrie pour afficher les graphiques.
                    </Typography>
                </Paper>
            )}

            {hasData && (
                <Box>
                    {/* Section header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                            Graphiques personnalisés
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <Button
                                variant="outlined"
                                startIcon={<FileUploadIcon />}
                                onClick={exportConfig}
                                size="small"
                            >
                                Exporter
                            </Button>
                            <Button
                                variant="outlined"
                                component="label"
                                startIcon={<FileDownloadIcon />}
                                size="small"
                            >
                                Importer
                                <input type="file" accept=".json" hidden onChange={importConfig} />
                            </Button>
                            <Button
                                variant={editMode ? 'contained' : 'outlined'}
                                startIcon={editMode ? <CheckIcon /> : <EditIcon />}
                                onClick={() => setEditMode((v) => !v)}
                                color={editMode ? 'success' : 'primary'}
                                size="small"
                            >
                                {editMode ? 'Terminer' : 'Modifier'}
                            </Button>
                        </Stack>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {editMode
                            ? 'Glissez pour réordonner, redimensionnez ou supprimez les graphiques.'
                            : 'Cliquez sur Modifier pour personnaliser les graphiques.'}
                    </Typography>

                    {/* Add chart form — edit mode only */}
                    {editMode && (
                        <Paper sx={{ p: 2.5, borderRadius: 2, mb: 3, border: `1px solid ${alpha(theme.palette.primary.main, 0.5)}` }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700 }}>
                                Ajouter un graphique
                            </Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-end' }}>
                                <FormControl size="small" sx={{ minWidth: 220 }}>
                                    <InputLabel>Axe X</InputLabel>
                                    <Select value={newX} onChange={(e) => setNewX(e.target.value)} label="Axe X">
                                        {AVAILABLE_FIELDS.map((f) => (
                                            <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <FormControl size="small" sx={{ minWidth: 220 }}>
                                    <InputLabel>Axe Y</InputLabel>
                                    <Select value={newY} onChange={(e) => setNewY(e.target.value)} label="Axe Y">
                                        {AVAILABLE_FIELDS.map((f) => (
                                            <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={addChart}
                                    disabled={newX === newY}
                                >
                                    Ajouter
                                </Button>
                            </Stack>
                        </Paper>
                    )}

                    {charts.length === 0 && (
                        <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            Aucun graphique. Activez le mode édition pour en créer.
                        </Typography>
                    )}

                    {/* Charts grid — 12 columns on md+ */}
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(12, 1fr)' },
                        gap: 3,
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
                                        p: 2,
                                        borderRadius: 2,
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
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, flexShrink: 0, flexWrap: 'wrap' }}>
                                                {/* Drag handle */}
                                                <DragIndicatorIcon
                                                    fontSize="small"
                                                    sx={{ color: theme.palette.text.disabled, cursor: 'grab', mr: 0.25 }}
                                                />

                                                {/* Size */}
                                                <ToggleButtonGroup
                                                    value={cols}
                                                    exclusive
                                                    onChange={(_, v) => { if (v) updateChart(chart.id, { cols: v }); }}
                                                    size="small"
                                                >
                                                    {SIZE_OPTIONS.map((o) => (
                                                        <ToggleButton key={o.value} value={o.value} sx={{ px: 1, py: 0.25, fontSize: 11, lineHeight: 1.5, minWidth: 28 }}>
                                                            {o.label}
                                                        </ToggleButton>
                                                    ))}
                                                </ToggleButtonGroup>

                                                {/* Aspect ratio */}
                                                <ToggleButtonGroup
                                                    value={ratio}
                                                    exclusive
                                                    onChange={(_, v) => { if (v) updateChart(chart.id, { ratio: v }); }}
                                                    size="small"
                                                >
                                                    {RATIO_OPTIONS.map((o) => (
                                                        <ToggleButton key={o.value} value={o.value} sx={{ px: 1, py: 0.25, fontSize: 11, lineHeight: 1.5, minWidth: 34 }}>
                                                            {o.label}
                                                        </ToggleButton>
                                                    ))}
                                                </ToggleButtonGroup>

                                                {/* Delete */}
                                                <IconButton
                                                    size="small"
                                                    onClick={() => removeChart(chart.id)}
                                                    sx={{ color: theme.palette.error.main, ml: 'auto' }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        ) : (
                                            <Box sx={{ mb: 1, flexShrink: 0 }}>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                                                    {fieldLabel(chart.y)} vs {fieldLabel(chart.x)}
                                                </Typography>
                                            </Box>
                                        )}

                                        <Box sx={{ flex: 1, minHeight: 0 }}>
                                            <TelemetryChart
                                                data={enrichedData}
                                                xKey={chart.x}
                                                yKey={chart.y}
                                                color={chart.color}
                                            />
                                        </Box>

                                        {editMode && (
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, flexShrink: 0 }}>
                                                {fieldLabel(chart.y)} vs {fieldLabel(chart.x)}
                                            </Typography>
                                        )}
                                    </Paper>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            )}
        </Container>
    );
}
