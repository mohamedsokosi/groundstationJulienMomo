import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Checkbox, Chip, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import StarIcon from '@mui/icons-material/Star';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import { alpha, useTheme } from '@mui/material/styles';
import { useTelemetryStream } from './use-telemetry-stream.jsx';
import { usePageActions } from '../layout/page-actions-context.jsx';
import { distanceKm, getMqttSourceStat, getTelemetryNumber, toTelemetryNumber } from './telemetry-utils.js';
import { AVAILABLE_FIELDS, CHART_COLORS, fieldLabel } from './chart-fields.js';
import { enrich } from './chart-logic.js';
import { TelemetryChart } from './TelemetryChart.jsx';
import { ChartTitle } from './ChartTitle.jsx';
import { CesiumViewport } from './CesiumViewport.jsx';
import { TelemetryStatsBar } from './TelemetryStatsBar.jsx';
import { TelemetryTerminal } from './TelemetryTerminal.jsx';
import { getTelemetryRecordGeo } from './cesium-utils.js';
import './ground-station-view.css';

const MQTT_STATUS_URL = '/api/telemetry/mqtt/status';
const MQTT_STATUS_POLL_MS = 2000;
const ANALYSE_STORAGE_KEY = 'analyse_charts_config';
const STATION_LEFT_COL_KEY = 'station_left_column_config';

const BOTTOM_CHART_DEFS = [
    { id: 'station-bottom-alt',   xKey: '_elapsed_min', lines: [{ key: 'U_Alt',  color: '#4fb7d6' }] },
    { id: 'station-bottom-speed', xKey: '_elapsed_min', lines: [{ key: 'Speed',  color: '#ee8a22' }] },
];

function loadFavoriteCharts() {
    try {
        const saved = localStorage.getItem(ANALYSE_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return parsed.filter((c) => c.favorite === true);
        }
    } catch (_) { /* ignore */ }
    return [];
}

function loadLeftColumnItems() {
    try {
        const saved = localStorage.getItem(STATION_LEFT_COL_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (_) { /* ignore */ }
    const favs = loadFavoriteCharts().map((c) => ({
        id: c.id, type: 'chart', xKey: c.xKey, lines: c.lines,
    }));
    return [...favs, { id: 'terminal-default', type: 'terminal' }];
}

export default function StationDashboard() {
    const theme = useTheme();
    const { chartData, loading, hasData } = useTelemetryStream({ intervalMs: 20000 });

    const enrichedData = useMemo(
        () => (chartData?.length ? chartData.map(enrich) : []),
        [chartData],
    );

    const trajectoryRecords = useMemo(
        () => chartData.filter(
            (p) => toTelemetryNumber(p['U_Lat'], null) !== null &&
                   toTelemetryNumber(p['U_Long'], null) !== null,
        ),
        [chartData],
    );

    const currentRecord = chartData[chartData.length - 1] ?? {};
    const firstRecord = trajectoryRecords[0] ?? null;

    const firstGeo   = firstRecord   ? getTelemetryRecordGeo(firstRecord)   : null;
    const currentGeo = currentRecord ? getTelemetryRecordGeo(currentRecord) : null;
    const distance = distanceKm(
        firstGeo   ? [firstGeo.lat,   firstGeo.lon]   : null,
        currentGeo ? [currentGeo.lat, currentGeo.lon] : null,
    );

    const [mqttStatus, setMqttStatus] = useState(null);

    useEffect(() => {
        let cancelled = false;
        let timer;
        const poll = async () => {
            try {
                const res = await fetch(MQTT_STATUS_URL);
                if (!cancelled && res.ok) setMqttStatus(await res.json());
            } catch (_) { /* ignore */ }
            if (!cancelled) timer = setTimeout(poll, MQTT_STATUS_POLL_MS);
        };
        timer = setTimeout(poll, 0);
        return () => { cancelled = true; clearTimeout(timer); };
    }, []);

    const { setNode } = usePageActions();

    const [leftItems, setLeftItems] = useState(() => loadLeftColumnItems());
    const [editMode, setEditMode] = useState(false);
    const [newX, setNewX] = useState('_elapsed_min');
    const [pendingY, setPendingY] = useState('U_Alt');
    const [newLines, setNewLines] = useState([]);
    const dragSrcId = useRef(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [favouriteIds, setFavouriteIds] = useState(() =>
        new Set(loadFavoriteCharts().map((c) => c.id))
    );
    const [mapOptions, setMapOptions] = useState({ follow: false, trajectory: true, linkBeam: true });
    const [trackingStates, setTrackingStates] = useState(() =>
        Object.fromEntries(
            loadLeftColumnItems().filter((i) => i.type === 'chart').map((i) => [i.id, true])
        )
    );
    const [bottomTrackingStates, setBottomTrackingStates] = useState([true, true]);

    const leftItemsRef = useRef(leftItems);
    leftItemsRef.current = leftItems;

    useEffect(() => {
        localStorage.setItem(STATION_LEFT_COL_KEY, JSON.stringify(leftItems));
    }, [leftItems]);

    const handleToggleMapOption = (key) => {
        setMapOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleTrackingChange = useCallback((id, val) => {
        setTrackingStates((prev) => ({ ...prev, [id]: val }));
    }, []);

    const handleBottomTrackingChange = useCallback((index, val) => {
        setBottomTrackingStates((prev) => {
            const next = [...prev];
            next[index] = val;
            return next;
        });
    }, []);

    const toggleFavorite = useCallback((item) => {
        const newFav = !favouriteIds.has(item.id);
        try {
            const saved = localStorage.getItem(ANALYSE_STORAGE_KEY);
            let config = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(config)) config = [];
            const idx = config.findIndex((c) => c.id === item.id);
            if (idx >= 0) {
                config[idx] = { ...config[idx], favorite: newFav };
            } else {
                config.push({ ...item, cols: 3, ratio: '2/1', track: true, favorite: newFav });
            }
            localStorage.setItem(ANALYSE_STORAGE_KEY, JSON.stringify(config));
            setFavouriteIds(new Set(config.filter((c) => c.favorite).map((c) => c.id)));

            if (!newFav) {
                setLeftItems((prev) => prev.filter((i) => i.id !== item.id));
                try {
                    const raw = localStorage.getItem(STATION_LEFT_COL_KEY);
                    let items = raw ? JSON.parse(raw) : [];
                    if (Array.isArray(items)) {
                        localStorage.setItem(STATION_LEFT_COL_KEY, JSON.stringify(items.filter((i) => i.id !== item.id)));
                    }
                } catch (_) { /* ignore */ }
            }
        } catch (_) { /* ignore */ }
    }, [favouriteIds]);

    const exportConfig = useCallback(() => {
        const blob = new Blob(
            [JSON.stringify({ version: 1, items: leftItemsRef.current }, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'station-colonne-gauche.json';
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
                const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
                if (items.length) setLeftItems(items);
            } catch (_) { /* ignore */ }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, []);

    const addLineToForm = () => {
        if (!pendingY || newLines.find((l) => l.key === pendingY)) return;
        const usedColors = new Set(newLines.map((l) => l.color));
        const color = CHART_COLORS.find((c) => !usedColors.has(c)) ?? CHART_COLORS[newLines.length % CHART_COLORS.length];
        setNewLines((prev) => [...prev, { key: pendingY, color }]);
    };

    const addChart = () => {
        if (!newX || !pendingY) return;
        const effectiveLines = newLines.length > 0
            ? newLines
            : [{ key: pendingY, color: CHART_COLORS[0] }];
        const newId = `chart-${Date.now()}`;
        setLeftItems((prev) => [...prev, { id: newId, type: 'chart', xKey: newX, lines: effectiveLines }]);
        setNewLines([]);
        try {
            const saved = localStorage.getItem(ANALYSE_STORAGE_KEY);
            let config = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(config)) config = [];
            config.push({ id: newId, xKey: newX, lines: effectiveLines, cols: 3, ratio: '2/1', track: true, favorite: true });
            localStorage.setItem(ANALYSE_STORAGE_KEY, JSON.stringify(config));
            setFavouriteIds((prev) => new Set([...prev, newId]));
        } catch (_) { /* ignore */ }
    };

    const addTerminal = () => {
        if (leftItems.some((i) => i.type === 'terminal')) return;
        setLeftItems((prev) => [...prev, { id: `terminal-${Date.now()}`, type: 'terminal' }]);
    };

    const removeItem = (id) => {
        setLeftItems((prev) => prev.filter((i) => i.id !== id));
        try {
            const saved = localStorage.getItem(ANALYSE_STORAGE_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                if (Array.isArray(config)) {
                    const idx = config.findIndex((c) => c.id === id);
                    if (idx >= 0 && config[idx].favorite) {
                        config[idx] = { ...config[idx], favorite: false };
                        localStorage.setItem(ANALYSE_STORAGE_KEY, JSON.stringify(config));
                        setFavouriteIds(new Set(config.filter((c) => c.favorite).map((c) => c.id)));
                    }
                }
            }
        } catch (_) { /* ignore */ }
    };

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
        setLeftItems((prev) => {
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

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'row',
            height: 'calc(100vh - 52px)',
            overflow: 'hidden',
            bgcolor: 'background.default',
        }}>
            {/* Left column: 25% */}
            <Box sx={{
                width: '25%',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                p: 0.5,
                overflowY: 'auto',
            }}>
                {editMode && (
                    <Paper sx={{ p: 1, borderRadius: 1, flexShrink: 0, border: `1px solid ${alpha(theme.palette.primary.main, 0.5)}` }}>
                        <Stack spacing={1}>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                <FormControl size="small" sx={{ minWidth: 110 }}>
                                    <InputLabel>Axe X</InputLabel>
                                    <Select value={newX} onChange={(e) => setNewX(e.target.value)} label="Axe X">
                                        {AVAILABLE_FIELDS.map((f) => (
                                            <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <FormControl size="small" sx={{ minWidth: 110 }}>
                                    <InputLabel>Série Y</InputLabel>
                                    <Select value={pendingY} onChange={(e) => setPendingY(e.target.value)} label="Série Y">
                                        {AVAILABLE_FIELDS.map((f) => (
                                            <MenuItem key={f.key} value={f.key} disabled={!!newLines.find((l) => l.key === f.key)}>
                                                {f.label}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button size="small" variant="outlined" onClick={addLineToForm}
                                    disabled={!!newLines.find((l) => l.key === pendingY)}>
                                    + Série
                                </Button>
                            </Stack>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                {newLines.length > 0 ? newLines.map((l) => (
                                    <Chip key={l.key} label={fieldLabel(l.key)} size="small"
                                        onDelete={() => setNewLines((prev) => prev.filter((x) => x.key !== l.key))}
                                        sx={{ backgroundColor: alpha(l.color, 0.2), borderColor: l.color, border: '1px solid' }} />
                                )) : (
                                    <Chip label={fieldLabel(pendingY)} size="small"
                                        sx={{ backgroundColor: alpha(CHART_COLORS[0], 0.1), borderColor: alpha(CHART_COLORS[0], 0.4), border: '1px dashed', color: 'text.secondary' }} />
                                )}
                            </Stack>
                            <Stack direction="row" spacing={0.5}>
                                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={addChart} sx={{ flex: 1 }}>
                                    Graphe
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addTerminal}
                                    disabled={leftItems.some((i) => i.type === 'terminal')} sx={{ flex: 1 }}>
                                    Terminal
                                </Button>
                            </Stack>
                        </Stack>
                    </Paper>
                )}

                {leftItems.length === 0 && !editMode && (
                    <Box sx={{ p: 1 }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 11 }}>
                            Colonne vide — utilisez Modifier pour ajouter des éléments.
                        </Typography>
                    </Box>
                )}

                {leftItems.map((item) => {
                    const isDragging = editMode && dragSrcId.current === item.id;
                    const isOver    = dragOverId === item.id;
                    return (
                        <Box
                            key={item.id}
                            draggable={editMode}
                            onDragStart={(e) => handleDragStart(e, item.id)}
                            onDragOver={(e) => handleDragOver(e, item.id)}
                            onDrop={(e) => handleDrop(e, item.id)}
                            onDragEnd={handleDragEnd}
                            sx={{
                                width: '100%', aspectRatio: '2 / 1', flexShrink: 0,
                                opacity: isDragging ? 0.35 : 1,
                                transition: 'opacity 0.15s',
                                cursor: editMode ? 'grab' : 'default',
                            }}
                        >
                            {item.type === 'chart' ? (
                                <Paper sx={{
                                    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                                    p: 0, borderRadius: 1, overflow: 'hidden',
                                    outline: isOver
                                        ? `2px solid ${theme.palette.primary.main}`
                                        : editMode
                                            ? `2px dashed ${alpha(theme.palette.primary.main, 0.4)}`
                                            : '2px solid transparent',
                                    transition: 'outline 0.1s',
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, pt: 0.25, flexShrink: 0 }}>
                                        {editMode && <DragIndicatorIcon fontSize="small" sx={{ color: theme.palette.text.disabled, cursor: 'grab', mr: 0.25 }} />}
                                        <Box sx={{ flex: 1, textAlign: 'center' }}>
                                            <ChartTitle chart={item} />
                                        </Box>
                                        {editMode ? (
                                            <IconButton size="small" onClick={() => removeItem(item.id)}
                                                sx={{ color: theme.palette.error.main, p: 0.25 }}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        ) : (
                                            <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                                <IconButton size="small" onClick={() => toggleFavorite(item)}
                                                    sx={{ p: 0.25, color: favouriteIds.has(item.id) ? '#fbbf24' : alpha(theme.palette.text.secondary, 0.3) }}>
                                                    {favouriteIds.has(item.id)
                                                        ? <StarIcon sx={{ fontSize: 14 }} />
                                                        : <StarBorderOutlinedIcon sx={{ fontSize: 14 }} />}
                                                </IconButton>
                                                <Checkbox size="small"
                                                    checked={trackingStates[item.id] ?? true}
                                                    onChange={(e) => handleTrackingChange(item.id, e.target.checked)}
                                                    sx={{ p: 0.25, color: alpha(theme.palette.text.secondary, 0.5) }} />
                                                <Typography variant="caption" sx={{
                                                    fontSize: 10, lineHeight: 1, userSelect: 'none',
                                                    color: (trackingStates[item.id] ?? true) ? 'text.secondary' : alpha(theme.palette.text.secondary, 0.4),
                                                }}>
                                                    Track
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
                                    <Box sx={{ flex: 1, minHeight: 0 }}>
                                        <TelemetryChart data={enrichedData} xKey={item.xKey} lines={item.lines}
                                            tracking={trackingStates[item.id] ?? true}
                                            onTrackingChange={(val) => handleTrackingChange(item.id, val)} />
                                    </Box>
                                </Paper>
                            ) : (
                                <Box sx={{
                                    width: '100%', height: '100%', position: 'relative',
                                    outline: isOver
                                        ? `2px solid ${theme.palette.primary.main}`
                                        : editMode
                                            ? `2px dashed ${alpha(theme.palette.primary.main, 0.4)}`
                                            : 'none',
                                    borderRadius: 1,
                                }}>
                                    {editMode && (
                                        <Box sx={{
                                            position: 'absolute', top: 4, right: 4, zIndex: 10,
                                            display: 'flex', alignItems: 'center', gap: 0.25,
                                            bgcolor: alpha(theme.palette.background.paper, 0.85),
                                            borderRadius: 1, p: 0.25,
                                        }}>
                                            <DragIndicatorIcon fontSize="small" sx={{ color: theme.palette.text.disabled }} />
                                            <IconButton size="small" onClick={() => removeItem(item.id)}
                                                sx={{ color: theme.palette.error.main, p: 0.25 }}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    )}
                                    <TelemetryTerminal />
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {/* Right column: 75% */}
            <Box sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                p: 0.5,
                pl: 0,
                gap: 0.5,
                overflow: 'hidden',
            }}>
                <TelemetryStatsBar
                    currentRecord={currentRecord}
                    distance={distance}
                    mqttStatus={mqttStatus}
                />

                <Box sx={{ flex: 3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <CesiumViewport
                        currentRecord={currentRecord}
                        firstRecord={firstRecord}
                        hasData={hasData}
                        loading={loading}
                        mapOptions={mapOptions}
                        onToggleMapOption={handleToggleMapOption}
                        trajectoryRecords={trajectoryRecords}
                    />
                </Box>

                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: 0.5 }}>
                    {BOTTOM_CHART_DEFS.map((chart, i) => (
                        <Box key={i} sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                            <Paper sx={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                p: 0,
                                borderRadius: 1,
                                overflow: 'hidden',
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, pt: 0.25, flexShrink: 0 }}>
                                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                                        <ChartTitle chart={chart} />
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                        <Checkbox
                                            size="small"
                                            checked={bottomTrackingStates[i]}
                                            onChange={(e) => handleBottomTrackingChange(i, e.target.checked)}
                                            sx={{ p: 0.25, color: alpha(theme.palette.text.secondary, 0.5) }}
                                        />
                                        <Typography variant="caption" sx={{
                                            fontSize: 10, lineHeight: 1, userSelect: 'none',
                                            color: bottomTrackingStates[i]
                                                ? 'text.secondary'
                                                : alpha(theme.palette.text.secondary, 0.4),
                                        }}>
                                            Track
                                        </Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ flex: 1, minHeight: 0 }}>
                                    <TelemetryChart
                                        data={enrichedData}
                                        xKey={chart.xKey}
                                        lines={chart.lines}
                                        tracking={bottomTrackingStates[i]}
                                        onTrackingChange={(val) => handleBottomTrackingChange(i, val)}
                                    />
                                </Box>
                            </Paper>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}
