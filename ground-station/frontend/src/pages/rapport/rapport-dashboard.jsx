import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    Container,
    Divider,
    FormControl,
    Grid,
    InputAdornment,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import UploadIcon from '@mui/icons-material/Upload';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import DataObjectIcon from '@mui/icons-material/DataObject';
import GifBoxIcon from '@mui/icons-material/GifBox';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useTelemetryStream } from '../shared/use-telemetry-stream.jsx';

const LS_KEY = 'rapport_sim_params';

const DEFAULT_PARAMS = {
    antenneTx: 'λ/2 Dipole',
    antenneRx: 'Yagi-Uda',
    frequencyMHz: 902,
    powerTxDBm: 24,
    gainTxDBi: 2.15,
    gainRxDBi: 10,
    sensitivityDBm: -130,
};

const TX_ANTENNAS = ['λ/2 Dipole', 'λ/4 Monopole', 'Patch', 'Helix', 'Yagi-Uda', 'Isotropic'];
const RX_ANTENNAS = ['Yagi-Uda', 'λ/2 Dipole', 'Patch', 'Helix', 'Parabolic', 'Isotropic'];
const GIF_RESOLUTIONS = ['480p', '720p', '1080p'];

function fsplDB(distM, freqMHz) {
    if (!distM || distM <= 0) return null;
    return 20 * Math.log10((4 * Math.PI * distM * freqMHz * 1e6) / 3e8);
}

function downloadText(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function StatCard({ label, value, unit, color }) {
    const theme = useTheme();
    return (
        <Card
            variant="outlined"
            sx={{
                borderRadius: 2,
                border: `1px solid ${alpha(color || theme.palette.primary.main, 0.3)}`,
                backgroundColor: alpha(color || theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.04),
                height: '100%',
            }}
        >
            <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mt: 0.5 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: color || 'text.primary', lineHeight: 1.1 }}>
                        {value}
                    </Typography>
                    {unit && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                            {unit}
                        </Typography>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
}

function SectionHeader({ title, subtitle }) {
    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {title}
            </Typography>
            {subtitle && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {subtitle}
                </Typography>
            )}
        </Box>
    );
}

export default function RapportDashboard() {
    const theme = useTheme();
    const importRef = useRef();
    const { chartData, hasData, loading, loadFromFile } = useTelemetryStream();

    const [params, setParams] = useState(() => {
        try {
            const saved = localStorage.getItem(LS_KEY);
            return saved ? { ...DEFAULT_PARAMS, ...JSON.parse(saved) } : DEFAULT_PARAMS;
        } catch {
            return DEFAULT_PARAMS;
        }
    });

    const [gifResolution, setGifResolution] = useState('720p');
    const [gifFrameStep, setGifFrameStep] = useState(5);
    const [gifFrameDelay, setGifFrameDelay] = useState(100);

    useEffect(() => {
        localStorage.setItem(LS_KEY, JSON.stringify(params));
    }, [params]);

    const setParam = (key) => (e) => setParams((p) => ({ ...p, [key]: e.target.value }));

    // ── Compute stats from telemetry ──
    const stats = useMemo(() => {
        if (!chartData?.length) return null;

        const pts = chartData
            .map((row) => {
                const alt = parseFloat(row['U_Alt'] ?? row['U Alt']) || 0;
                const loss = fsplDB(alt, params.frequencyMHz);
                if (loss === null) return null;
                const prx = params.powerTxDBm + params.gainTxDBi - loss + params.gainRxDBi;
                const margin = prx - params.sensitivityDBm;
                return { prx, margin };
            })
            .filter(Boolean);

        if (!pts.length) return null;

        const margins = pts.map((p) => p.margin);
        const prxs = pts.map((p) => p.prx);
        const reliable = pts.filter((p) => p.margin > 0).length;

        return {
            nbPoints: chartData.length,
            fiabilite: ((reliable / pts.length) * 100).toFixed(1),
            margeMin: Math.min(...margins).toFixed(1),
            margeMax: Math.max(...margins).toFixed(1),
            prxMoyen: (prxs.reduce((a, b) => a + b, 0) / prxs.length).toFixed(1),
        };
    }, [chartData, params]);

    // ── Exports ──
    const handleExportConfig = () => {
        downloadText('report-config.json', JSON.stringify(params, null, 2), 'application/json');
    };

    const handleImportConfig = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                setParams((p) => ({ ...p, ...imported }));
            } catch {
                // silently ignore malformed JSON
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleExportCSV = () => {
        if (!chartData?.length) return;
        const keys = Object.keys(chartData[0]);
        const header = keys.join(',');
        const rows = chartData.map((row) => keys.map((k) => row[k] ?? '').join(','));
        downloadText('telemetry.csv', [header, ...rows].join('\n'), 'text/csv');
    };

    const handleExportJSON = () => {
        const payload = { params, stats, exportedAt: new Date().toISOString() };
        downloadText('report.json', JSON.stringify(payload, null, 2), 'application/json');
    };

    const handleExportPDF = () => {
        const w = window.open('', '_blank');
        w.document.write(`
            <html><head><title>Ground Station Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
                h1 { font-size: 24px; margin-bottom: 8px; }
                h2 { font-size: 16px; margin-top: 28px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                td, th { padding: 8px 12px; border: 1px solid #ddd; font-size: 13px; }
                th { background: #f4f4f4; font-weight: bold; }
                .stat { display: inline-block; margin: 8px 16px 8px 0; }
                .stat-val { font-size: 28px; font-weight: bold; }
                .stat-lbl { font-size: 12px; color: #666; }
            </style></head><body>
            <h1>Simulation Report — Ground Station</h1>
            <p style="color:#666;font-size:13px">Generated on ${new Date().toLocaleString('en-US')}</p>
            <h2>Summary</h2>
            ${stats ? `
            <div class="stat"><div class="stat-val">${stats.nbPoints}</div><div class="stat-lbl">Points</div></div>
            <div class="stat"><div class="stat-val">${stats.fiabilite}%</div><div class="stat-lbl">Reliability</div></div>
            <div class="stat"><div class="stat-val">${stats.margeMin}/${stats.margeMax} dB</div><div class="stat-lbl">Min/Max Margin</div></div>
            <div class="stat"><div class="stat-val">${stats.prxMoyen} dBm</div><div class="stat-lbl">Avg RX Power</div></div>
            ` : '<p>No telemetry data.</p>'}
            <h2>Parameters</h2>
            <table>
                <tr><th>Parameter</th><th>Value</th></tr>
                <tr><td>TX Antenna</td><td>${params.antenneTx}</td></tr>
                <tr><td>RX Antenna</td><td>${params.antenneRx}</td></tr>
                <tr><td>Frequency</td><td>${params.frequencyMHz} MHz</td></tr>
                <tr><td>TX Power</td><td>${params.powerTxDBm} dBm</td></tr>
                <tr><td>TX Gain</td><td>${params.gainTxDBi} dBi</td></tr>
                <tr><td>RX Gain</td><td>${params.gainRxDBi} dBi</td></tr>
                <tr><td>RX Sensitivity</td><td>${params.sensitivityDBm} dBm</td></tr>
            </table>
            </body></html>
        `);
        w.document.close();
        w.focus();
        w.print();
    };

    const handleTelemetryUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        void loadFromFile(file, { stream: false });
    };

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ mb: 5 }}>
                <Typography variant="h4" sx={{ mb: 1 }}>Report</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
                    Simulation summary, RF parameters, exports and report generation.
                </Typography>
                <Button variant="contained" component="label" startIcon={<UploadIcon />}>
                    Load CSV
                    <input type="file" accept=".csv" hidden onChange={handleTelemetryUpload} />
                </Button>
            </Box>

            <Stack spacing={5}>

                {/* ── Configuration ── */}
                <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <SectionHeader
                        title="Configuration"
                        subtitle="Save your current configuration for later reuse, or import an existing one."
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Button variant="contained" startIcon={<SaveIcon />} onClick={handleExportConfig}>
                            Export config
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<FolderOpenIcon />}
                            onClick={() => importRef.current?.click()}
                        >
                            Import config
                        </Button>
                        <input ref={importRef} type="file" accept=".json" hidden onChange={handleImportConfig} />
                    </Stack>
                </Paper>

                {/* ── Generate Report ── */}
                <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <SectionHeader
                        title="Generate Report"
                        subtitle="Generate a complete simulation report (PDF), export data (CSV/JSON) for external analysis, or export a high-resolution animated GIF of the 3D Cesium Globe view."
                    />

                    {/* GIF controls */}
                    <Paper
                        variant="outlined"
                        sx={{ p: 2.5, borderRadius: 2, mb: 3, backgroundColor: alpha(theme.palette.divider, 0.04) }}
                    >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                            GIF Options
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                                <InputLabel>GIF Resolution</InputLabel>
                                <Select
                                    value={gifResolution}
                                    onChange={(e) => setGifResolution(e.target.value)}
                                    label="GIF Resolution"
                                >
                                    {GIF_RESOLUTIONS.map((r) => (
                                        <MenuItem key={r} value={r}>{r}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                size="small"
                                label="Frame step"
                                type="number"
                                value={gifFrameStep}
                                onChange={(e) => setGifFrameStep(Number(e.target.value))}
                                inputProps={{ min: 1, max: 100 }}
                                sx={{ width: 170 }}
                            />
                            <TextField
                                size="small"
                                label="Frame delay"
                                type="number"
                                value={gifFrameDelay}
                                onChange={(e) => setGifFrameDelay(Number(e.target.value))}
                                InputProps={{ endAdornment: <InputAdornment position="end">ms</InputAdornment> }}
                                inputProps={{ min: 10, max: 2000, step: 10 }}
                                sx={{ width: 170 }}
                            />
                        </Stack>
                    </Paper>

                    {/* Export buttons */}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={<PictureAsPdfIcon />}
                            onClick={handleExportPDF}
                        >
                            Export PDF
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<TableChartIcon />}
                            onClick={handleExportCSV}
                            disabled={!hasData}
                        >
                            Export CSV
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<DataObjectIcon />}
                            onClick={handleExportJSON}
                        >
                            Export JSON
                        </Button>
                        <Tooltip title="Requires the 3D Globe view to be active (coming soon)">
                            <span>
                                <Button
                                    variant="outlined"
                                    startIcon={<GifBoxIcon />}
                                    disabled
                                >
                                    Export GIF
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>
                </Paper>

                {/* ── Simulation Summary ── */}
                <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <SectionHeader
                        title="Simulation Summary"
                        subtitle={hasData ? 'Calculated from telemetry data and RF parameters below.' : 'Load a CSV file to view statistics.'}
                    />
                    {!hasData && !loading && (
                        <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            No data available.
                        </Typography>
                    )}
                    {stats && (
                        <Grid container spacing={2}>
                            <Grid item xs={6} sm={3}>
                                <StatCard label="Data Points" value={stats.nbPoints} color="#4cbc74" />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <StatCard label="Avg Reliability" value={stats.fiabilite} unit="%" color="#4fb7d6" />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <StatCard label="Min / Max Margin" value={`${stats.margeMin} / ${stats.margeMax}`} unit="dB" color="#d2b04c" />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <StatCard label="Avg RX Power" value={stats.prxMoyen} unit="dBm" color="#ee8a22" />
                            </Grid>
                        </Grid>
                    )}
                </Paper>

                {/* ── Simulation Parameters ── */}
                <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <SectionHeader
                        title="Simulation Parameters"
                        subtitle="These values feed the link budget calculation and reliability statistics."
                    />
                    <Grid container spacing={2.5}>
                        <Grid item xs={12} sm={6} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>TX Antenna</InputLabel>
                                <Select value={params.antenneTx} onChange={setParam('antenneTx')} label="TX Antenna">
                                    {TX_ANTENNAS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>RX Antenna</InputLabel>
                                <Select value={params.antenneRx} onChange={setParam('antenneRx')} label="RX Antenna">
                                    {RX_ANTENNAS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <TextField
                                fullWidth size="small"
                                label="Frequency"
                                type="number"
                                value={params.frequencyMHz}
                                onChange={setParam('frequencyMHz')}
                                InputProps={{ endAdornment: <InputAdornment position="end">MHz</InputAdornment> }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <TextField
                                fullWidth size="small"
                                label="TX Power"
                                type="number"
                                value={params.powerTxDBm}
                                onChange={setParam('powerTxDBm')}
                                InputProps={{ endAdornment: <InputAdornment position="end">dBm</InputAdornment> }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <TextField
                                fullWidth size="small"
                                label="TX Gain"
                                type="number"
                                value={params.gainTxDBi}
                                onChange={setParam('gainTxDBi')}
                                InputProps={{ endAdornment: <InputAdornment position="end">dBi</InputAdornment> }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <TextField
                                fullWidth size="small"
                                label="RX Gain"
                                type="number"
                                value={params.gainRxDBi}
                                onChange={setParam('gainRxDBi')}
                                InputProps={{ endAdornment: <InputAdornment position="end">dBi</InputAdornment> }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <TextField
                                fullWidth size="small"
                                label="RX Sensitivity"
                                type="number"
                                value={params.sensitivityDBm}
                                onChange={setParam('sensitivityDBm')}
                                InputProps={{ endAdornment: <InputAdornment position="end">dBm</InputAdornment> }}
                            />
                        </Grid>
                    </Grid>
                </Paper>

            </Stack>
        </Container>
    );
}
