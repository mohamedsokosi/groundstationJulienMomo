import React, { useMemo, useState } from 'react';
import {
    Box,
    Button,
    Container,
    Grid,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import UploadIcon from '@mui/icons-material/Upload';
import { TelemetrySummary } from './telemetry-components.jsx';
import { CUBESAT_SUBSYSTEMS, DEFAULT_CUBESAT_SUBSYSTEM_ID } from './cubesat-config.js';
import CubeSatAnnotatedVisual from './cubesat-annotated-visual.jsx';
import CubeSatSubsystemPanel from './cubesat-subsystem-panel.jsx';
import { getSubsystemById, getSubsystemStatus } from './cubesat-utils.js';
import { useTelemetryStream } from './use-telemetry-stream.jsx';

export default function CubeSatDashboard() {
    const theme = useTheme();
    const [selectedSubsystemId, setSelectedSubsystemId] = useState(DEFAULT_CUBESAT_SUBSYSTEM_ID);
    const [hoveredSubsystemId, setHoveredSubsystemId] = useState(null);
    const {
        chartData,
        loading,
        latestPoint,
        hasData,
        loadFromFile,
    } = useTelemetryStream();

    const selectedSubsystem = useMemo(
        () => getSubsystemById(selectedSubsystemId),
        [selectedSubsystemId],
    );

    const handleFileUpload = (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        void loadFromFile(file, { stream: false });
    };

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                    Vue interactive du CubeSat
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 900 }}>
                    Explorez les sous-systèmes du CubeSat dans une vue 2D annotée, sélectionnez une zone,
                    puis consultez les champs de télémétrie déjà disponibles dans le flux actuel.
                </Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ mt: 2.5 }}>
                    <Button
                        variant="contained"
                        component="label"
                        startIcon={<UploadIcon />}
                    >
                        Charger un autre CSV
                        <input
                            type="file"
                            accept=".csv"
                            hidden
                            onChange={handleFileUpload}
                        />
                    </Button>
                    <Paper
                        sx={{
                            px: 1.5,
                            py: 1,
                            borderRadius: 2,
                            backgroundColor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.18 : 0.08),
                        }}
                    >
                        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                            Visual baseline
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            2D traced view based on the provided CubeSat image, with hotspot geometry kept in config.
                        </Typography>
                    </Paper>
                </Stack>
            </Box>

            {hasData && (
                <Box sx={{ mb: 3 }}>
                    <TelemetrySummary data={chartData} />
                </Box>
            )}

            <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    CubeSat layout map
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Hover for names, click to lock a subsystem, and inspect the mapped telemetry on the right.
                                </Typography>
                            </Box>

                            <CubeSatAnnotatedVisual
                                selectedSubsystemId={selectedSubsystemId}
                                hoveredSubsystemId={hoveredSubsystemId}
                                onHoverSubsystem={setHoveredSubsystemId}
                                onLeaveSubsystem={() => setHoveredSubsystemId(null)}
                                onSelectSubsystem={setSelectedSubsystemId}
                            />

                            <Grid container spacing={1.5}>
                                {CUBESAT_SUBSYSTEMS.map((subsystem) => {
                                    const status = getSubsystemStatus(subsystem, latestPoint);
                                    const isSelected = subsystem.id === selectedSubsystemId;

                                    return (
                                        <Grid item xs={12} sm={6} md={4} key={subsystem.id}>
                                            <Paper
                                                onMouseEnter={() => setHoveredSubsystemId(subsystem.id)}
                                                onMouseLeave={() => setHoveredSubsystemId(null)}
                                                onClick={() => setSelectedSubsystemId(subsystem.id)}
                                                sx={{
                                                    p: 1.5,
                                                    borderRadius: 2,
                                                    cursor: 'pointer',
                                                    border: `1px solid ${alpha(subsystem.color, isSelected ? 0.55 : 0.22)}`,
                                                    backgroundColor: alpha(subsystem.color, isSelected ? 0.16 : 0.06),
                                                    transition: 'all 160ms ease',
                                                    '&:hover': {
                                                        borderColor: alpha(subsystem.color, 0.48),
                                                        transform: 'translateY(-1px)',
                                                    },
                                                }}
                                            >
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                                    {subsystem.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: subsystem.color, fontWeight: 700 }}>
                                                    {status.label}
                                                </Typography>
                                            </Paper>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <CubeSatSubsystemPanel
                        subsystem={selectedSubsystem}
                        latestPoint={latestPoint}
                        chartData={chartData}
                    />
                </Grid>
            </Grid>

            {!hasData && !loading && (
                <Paper sx={{ p: 4, textAlign: 'center', mt: 3 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        No telemetry source loaded
                    </Typography>
                    <Typography color="text.secondary">
                        The CubeSat view is ready, but it needs CSV telemetry to populate navigation, OBC, and environmental metrics.
                    </Typography>
                </Paper>
            )}
        </Container>
    );
}
