import React from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import {
    Box,
    ButtonBase,
    Chip,
    Paper,
    Tooltip,
    Typography,
} from '@mui/material';
import cubesatBaseImage from '../../assets/cubesat-annotated-base.svg';
import { CUBESAT_SUBSYSTEMS, CUBESAT_VIEWBOX } from './cubesat-config.js';

function getPolygonPath(points = []) {
    return points.map((point) => point.join(',')).join(' ');
}

export default function CubeSatAnnotatedVisual({
    selectedSubsystemId,
    hoveredSubsystemId,
    onHoverSubsystem,
    onLeaveSubsystem,
    onSelectSubsystem,
}) {
    const theme = useTheme();
    const activeSubsystemId = hoveredSubsystemId || selectedSubsystemId;
    const activeSubsystem = CUBESAT_SUBSYSTEMS.find((subsystem) => subsystem.id === activeSubsystemId) || null;

    return (
        <Box
            sx={{
                position: 'relative',
                width: '100%',
                aspectRatio: `${CUBESAT_VIEWBOX.width} / ${CUBESAT_VIEWBOX.height}`,
                borderRadius: 2,
                overflow: 'hidden',
                background: theme.palette.mode === 'dark'
                    ? 'radial-gradient(circle at 44% 12%, rgba(79, 183, 214, 0.18), transparent 24%), radial-gradient(circle at 73% 52%, rgba(76, 188, 116, 0.1), transparent 32%), linear-gradient(160deg, rgba(4, 12, 20, 0.99), rgba(9, 22, 34, 0.97) 48%, rgba(3, 8, 14, 0.99))'
                    : 'radial-gradient(circle at 44% 12%, rgba(25, 118, 210, 0.18), transparent 25%), radial-gradient(circle at 72% 52%, rgba(76, 175, 80, 0.1), transparent 34%), linear-gradient(160deg, rgba(249, 252, 255, 0.98), rgba(238, 245, 250, 0.96))',
                border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                boxShadow: theme.palette.mode === 'dark'
                    ? `inset 0 1px 0 ${alpha('#ffffff', 0.06)}, 0 24px 70px ${alpha('#000000', 0.32)}`
                    : `inset 0 1px 0 ${alpha('#ffffff', 0.72)}, 0 18px 50px ${alpha('#1f3148', 0.12)}`,
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `linear-gradient(${alpha(theme.palette.divider, 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.palette.divider, 0.08)} 1px, transparent 1px)`,
                    backgroundSize: '22px 22px',
                    maskImage: 'radial-gradient(circle at center, black 42%, transparent 82%)',
                    opacity: theme.palette.mode === 'dark' ? 0.7 : 0.5,
                    pointerEvents: 'none',
                },
                '&::after': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    background: theme.palette.mode === 'dark'
                        ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 18%, transparent 72%, rgba(0, 0, 0, 0.2))'
                        : 'linear-gradient(180deg, rgba(255, 255, 255, 0.42), transparent 24%, transparent 74%, rgba(31, 49, 72, 0.08))',
                    pointerEvents: 'none',
                },
            }}
        >
            <Box
                component="img"
                src={cubesatBaseImage}
                alt="Annotated CubeSat visual"
                sx={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    userSelect: 'none',
                    pointerEvents: 'none',
                    zIndex: 1,
                    filter: theme.palette.mode === 'dark'
                        ? 'drop-shadow(0 26px 32px rgba(0, 0, 0, 0.48)) drop-shadow(0 0 18px rgba(79, 183, 214, 0.08))'
                        : 'drop-shadow(0 18px 24px rgba(22, 34, 56, 0.16))',
                }}
            />

            <Box
                component="svg"
                viewBox={`0 0 ${CUBESAT_VIEWBOX.width} ${CUBESAT_VIEWBOX.height}`}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 2,
                }}
            >
                {CUBESAT_SUBSYSTEMS.map((subsystem) => {
                    const isActive = subsystem.id === selectedSubsystemId || subsystem.id === hoveredSubsystemId;
                    const fillColor = alpha(subsystem.color, subsystem.id === selectedSubsystemId ? 0.36 : 0.22);

                    return (
                        <polygon
                            key={subsystem.id}
                            points={getPolygonPath(subsystem.hotspot.polygon)}
                            fill={isActive ? fillColor : 'transparent'}
                            stroke={isActive ? subsystem.color : alpha(subsystem.color, 0.28)}
                            strokeWidth={isActive ? 1.7 : 1.1}
                            strokeDasharray={subsystem.id === selectedSubsystemId ? 'none' : '4 4'}
                            style={{ cursor: 'pointer', transition: 'all 160ms ease' }}
                            onMouseEnter={() => onHoverSubsystem(subsystem.id)}
                            onMouseLeave={onLeaveSubsystem}
                            onClick={() => onSelectSubsystem(subsystem.id)}
                        />
                    );
                })}
            </Box>

            {CUBESAT_SUBSYSTEMS.map((subsystem) => {
                const isSelected = subsystem.id === selectedSubsystemId;
                const isHovered = subsystem.id === hoveredSubsystemId;

                return (
                    <Tooltip key={subsystem.id} title={subsystem.name} placement="top">
                        <ButtonBase
                            onMouseEnter={() => onHoverSubsystem(subsystem.id)}
                            onMouseLeave={onLeaveSubsystem}
                            onClick={() => onSelectSubsystem(subsystem.id)}
                            sx={{
                                position: 'absolute',
                                left: `${subsystem.hotspot.anchor.x}%`,
                                top: `${subsystem.hotspot.anchor.y}%`,
                                transform: 'translate(-50%, -50%)',
                                width: isSelected ? 22 : 18,
                                height: isSelected ? 22 : 18,
                                borderRadius: '50%',
                                border: `2px solid ${theme.palette.background.paper}`,
                                backgroundColor: subsystem.color,
                                zIndex: 3,
                                boxShadow: isHovered || isSelected
                                    ? `0 0 0 8px ${alpha(subsystem.color, 0.18)}`
                                    : `0 0 0 4px ${alpha(subsystem.color, 0.12)}`,
                                transition: 'all 160ms ease',
                                '&::after': {
                                    content: '""',
                                    position: 'absolute',
                                    inset: -6,
                                    borderRadius: '50%',
                                    border: `1px solid ${alpha(subsystem.color, 0.45)}`,
                                },
                            }}
                            aria-label={subsystem.name}
                        />
                    </Tooltip>
                );
            })}

            {activeSubsystem && (
                <Paper
                    elevation={3}
                    sx={{
                        position: 'absolute',
                        left: `${activeSubsystem.hotspot.anchor.x + activeSubsystem.hotspot.labelOffset.x}%`,
                        top: `${activeSubsystem.hotspot.anchor.y + activeSubsystem.hotspot.labelOffset.y}%`,
                        transform: 'translateY(-50%)',
                        px: 1.4,
                        py: 0.8,
                        borderRadius: 2,
                        border: `1px solid ${alpha(activeSubsystem.color, 0.4)}`,
                        backgroundColor: alpha(theme.palette.background.paper, 0.94),
                        backdropFilter: 'blur(10px)',
                        pointerEvents: 'none',
                        maxWidth: 210,
                        zIndex: 4,
                    }}
                >
                    <Typography variant="caption" sx={{ color: activeSubsystem.color, fontWeight: 700, display: 'block' }}>
                        Subsystem
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {activeSubsystem.name}
                    </Typography>
                </Paper>
            )}

            <Box
                sx={{
                    position: 'absolute',
                    left: 16,
                    bottom: 16,
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                    maxWidth: 'calc(100% - 32px)',
                    zIndex: 3,
                }}
            >
                <Chip
                    size="small"
                    label="2D annotated view"
                    sx={{
                        backgroundColor: alpha(theme.palette.background.paper, 0.88),
                        backdropFilter: 'blur(8px)',
                    }}
                />
                <Chip
                    size="small"
                    label="Hotspots are configurable"
                    sx={{
                        backgroundColor: alpha(theme.palette.background.paper, 0.88),
                        backdropFilter: 'blur(8px)',
                    }}
                />
            </Box>
        </Box>
    );
}
