import React, { useMemo, useState } from 'react';
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
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
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

// Free Space Path Loss: FSPL(dB) = 20·log10(4π·d·f/c)
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

const DEFAULT_CHARTS = [
    { id: 'default-0', x: 'U_Alt', y: '_bilan',   color: '#4cbc74' },
    { id: 'default-1', x: 'U_Alt', y: '_fspl',    color: '#ee8a22' },
    { id: 'default-2', x: 'U_Alt', y: 'Pressure', color: '#4fb7d6' },
    { id: 'default-3', x: 'U_Alt', y: 'Speed',    color: '#d2b04c' },
];

export default function AnalyseDashboard() {
    const theme = useTheme();
    const { chartData, hasData, loading, loadFromFile } = useTelemetryStream();

    const [charts, setCharts] = useState(DEFAULT_CHARTS);
    const [newX, setNewX] = useState('U_Alt');
    const [newY, setNewY] = useState('Pressure');

    const enrichedData = useMemo(
        () => (chartData?.length ? chartData.map(enrich) : []),
        [chartData],
    );

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        void loadFromFile(file, { stream: false });
    };

    const addChart = () => {
        if (newX && newY && newX !== newY) {
            const colorIdx = charts.length % CHART_COLORS.length;
            setCharts((prev) => [...prev, { id: Date.now(), x: newX, y: newY, color: CHART_COLORS[colorIdx] }]);
        }
    };

    const removeChart = (id) => setCharts((prev) => prev.filter((c) => c.id !== id));

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Analyse
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 860 }}>
                    Graphiques de télémétrie personnalisables. Créez vos propres graphiques ou supprimez ceux par défaut.
                </Typography>
                <Box sx={{ mt: 2.5 }}>
                    <Button variant="contained" component="label" startIcon={<UploadIcon />}>
                        Charger un CSV
                        <input type="file" accept=".csv" hidden onChange={handleFileUpload} />
                    </Button>
                </Box>
            </Box>

            {/* No data */}
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
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                        Graphiques personnalisés
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Sélectionnez deux champs pour créer un graphique. Les champs calculés (FSPL, bilan) sont aussi disponibles.
                    </Typography>

                    {/* Builder row */}
                    <Paper sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
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

                    {charts.length === 0 && (
                        <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            Aucun graphique. Utilisez le formulaire ci-dessus pour en créer.
                        </Typography>
                    )}

                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                        gap: 3,
                    }}>
                        {charts.map((chart) => (
                            <Box key={chart.id} sx={{ aspectRatio: '1', minWidth: 0 }}>
                                <Paper sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1, flexShrink: 0 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                                            {fieldLabel(chart.y)} vs {fieldLabel(chart.x)}
                                        </Typography>
                                        <IconButton
                                            size="small"
                                            onClick={() => removeChart(chart.id)}
                                            sx={{ color: theme.palette.error.main, ml: 1, flexShrink: 0 }}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                    <Box sx={{ flex: 1, minHeight: 0 }}>
                                        <TelemetryChart
                                            data={enrichedData}
                                            xKey={chart.x}
                                            yKey={chart.y}
                                            color={chart.color}
                                        />
                                    </Box>
                                </Paper>
                            </Box>
                        ))}
                    </Box>
                </Box>
            )}
        </Container>
    );
}
