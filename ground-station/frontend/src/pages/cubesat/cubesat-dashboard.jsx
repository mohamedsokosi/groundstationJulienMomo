import React, { useMemo, useState } from 'react';
import {
    Box,
    Button,
    Container,
    Divider,
    Grid,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { TelemetrySummary } from '../shared/telemetry-components.jsx';
import { CUBESAT_SUBSYSTEMS } from './cubesat-config.js';
import CubeSatAnnotatedVisual from './cubesat-annotated-visual.jsx';
import CubeSatSubsystemPanel from './cubesat-subsystem-panel.jsx';
import { getSubsystemById, getSubsystemStatus } from './cubesat-utils.js';
import { useTelemetryStream } from '../shared/use-telemetry-stream.jsx';

export default function CubeSatDashboard() {
    const theme = useTheme();
    const [selectedSubsystemId, setSelectedSubsystemId] = useState(null);
    const [hoveredSubsystemId, setHoveredSubsystemId] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const {
        chartData,
        loading,
        latestPoint,
        hasData,
    } = useTelemetryStream();

    const selectedSubsystem = useMemo(
        () => getSubsystemById(selectedSubsystemId),
        [selectedSubsystemId],
    );

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ mb: 1.5 }}>
                    CubeSat Interactive View
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 900 }}>
                    Explore CubeSat subsystems in an annotated 2D view, select an area,
                    then view the telemetry fields available in the current stream.
                </Typography>

            </Box>

            {hasData && (
                <Box sx={{ mb: 3 }}>
                    <TelemetrySummary data={chartData} />
                </Box>
            )}

            {/* Single Paper containing both sides */}
            <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>

                    {/* Left: image */}
                    <Box sx={{ flex: '0 0 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    CubeSat layout map
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {editMode
                                        ? 'Drag the corner handles to reposition each zone. Click > Copy < when done.'
                                        : 'Hover for names, click to lock a subsystem.'}
                                </Typography>
                            </Box>
                            {/* <Button
                                variant={editMode ? 'contained' : 'outlined'}
                                size="small"
                                onClick={() => setEditMode((v) => !v)}
                                sx={{ flexShrink: 0, mt: 0.5 }}
                            >
                                {editMode ? 'DONE' : '> EDIT <'}
                            </Button> */}
                        </Box>

                        <Box sx={{ width: '70%', mx: 'auto' }}>
                            <CubeSatAnnotatedVisual
                                selectedSubsystemId={selectedSubsystemId}
                                hoveredSubsystemId={hoveredSubsystemId}
                                onHoverSubsystem={setHoveredSubsystemId}
                                onLeaveSubsystem={() => setHoveredSubsystemId(null)}
                                onSelectSubsystem={setSelectedSubsystemId}
                                editMode={editMode}
                            />
                        </Box>
                    </Box>

                    <Divider orientation="vertical" flexItem />

                    {/* Right: subsystem buttons (top) + telemetry (bottom, scrollable) */}
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>

                        {/* Subsystem buttons */}
                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Subsystems
                            </Typography>
                            <Grid container spacing={1.5}>
                                {CUBESAT_SUBSYSTEMS.map((subsystem) => {
                                    const status = getSubsystemStatus(subsystem, latestPoint);
                                    const isSelected = subsystem.id === selectedSubsystemId;

                                    return (
                                        <Grid item xs={6} key={subsystem.id}>
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
                        </Box>

                        <Divider />

                        {/* Telemetry panel — scrollable */}
                        <Box sx={{ overflowY: 'auto', maxHeight: '55vh' }}>
                            <CubeSatSubsystemPanel
                                subsystem={selectedSubsystem}
                                latestPoint={latestPoint}
                                chartData={chartData}
                            />
                        </Box>
                    </Box>
                </Box>
            </Paper>

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
