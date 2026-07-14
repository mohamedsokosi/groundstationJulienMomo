import React, { useCallback, useRef, useState } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import {
    Box,
    Button,
    ButtonBase,
    Chip,
    Paper,
    Tooltip,
    Typography,
} from '@mui/material';
const cubesatBaseImage = '/cubesat.png';
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
    editMode = false,
}) {
    const theme = useTheme();
    const svgRef = useRef(null);
    const activeSubsystemId = hoveredSubsystemId || selectedSubsystemId;
    const activeSubsystem = CUBESAT_SUBSYSTEMS.find((s) => s.id === activeSubsystemId) || null;

    const [editPolygons, setEditPolygons] = useState(() =>
        CUBESAT_SUBSYSTEMS.map((s) => s.hotspot.polygon.map(([x, y]) => [x, y]))
    );
    const [editAnchors, setEditAnchors] = useState(() =>
        CUBESAT_SUBSYSTEMS.map((s) => ({ x: s.hotspot.anchor.x, y: s.hotspot.anchor.y }))
    );
    const [dragging, setDragging] = useState(null); // { type: 'vertex'|'anchor', sysIdx, vtxIdx? }
    const [copied, setCopied] = useState(false);

    const getSvgCoords = useCallback((e) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * CUBESAT_VIEWBOX.width;
        const y = ((e.clientY - rect.top) / rect.height) * CUBESAT_VIEWBOX.height;
        return {
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
        };
    }, []);

    const handleVertexMouseDown = useCallback((sysIdx, vtxIdx) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging({ type: 'vertex', sysIdx, vtxIdx });
    }, []);

    const handleAnchorMouseDown = useCallback((sysIdx) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging({ type: 'anchor', sysIdx });
    }, []);

    const handleSvgMouseMove = useCallback((e) => {
        if (!dragging) return;
        const { x, y } = getSvgCoords(e);

        if (dragging.type === 'vertex') {
            setEditPolygons((prev) =>
                prev.map((poly, i) => {
                    if (i !== dragging.sysIdx) return poly;
                    return poly.map((pt, j) => (j === dragging.vtxIdx ? [x, y] : pt));
                })
            );
        } else if (dragging.type === 'anchor') {
            // anchor.x/y are % of container → anchor.x == svg_x, anchor.y = svg_y * 100 / vh
            setEditAnchors((prev) =>
                prev.map((anchor, i) =>
                    i !== dragging.sysIdx ? anchor : {
                        x: Math.round(x * 10) / 10,
                        y: Math.round((y * 100 / CUBESAT_VIEWBOX.height) * 10) / 10,
                    }
                )
            );
        }
    }, [dragging, getSvgCoords]);

    const handleSvgMouseUp = useCallback(() => setDragging(null), []);

    const handleCopy = useCallback(() => {
        // Emit config-shaped hotspot blocks (anchor = middle circle, polygon =
        // pointer lines) so they can be pasted straight back into cubesat-config.js.
        // labelOffset is kept from the current config (not draggable here).
        const text = CUBESAT_SUBSYSTEMS.map((s, i) => {
            const a = editAnchors[i];
            const off = s.hotspot.labelOffset;
            const pts = editPolygons[i].map(([x, y]) => `        [${x}, ${y}],`).join('\n');
            return `// ${s.id}\nhotspot: {\n`
                + `    anchor: { x: ${a.x}, y: ${a.y} },\n`
                + `    labelOffset: { x: ${off.x}, y: ${off.y} },\n`
                + `    polygon: [\n${pts}\n    ],\n},`;
        }).join('\n\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [editPolygons, editAnchors]);

    const getPolygon = (sysIdx) =>
        editMode ? editPolygons[sysIdx] : CUBESAT_SUBSYSTEMS[sysIdx].hotspot.polygon;

    const getAnchor = (sysIdx) =>
        editMode ? editAnchors[sysIdx] : CUBESAT_SUBSYSTEMS[sysIdx].hotspot.anchor;

    return (
        <Box
            onClick={editMode ? undefined : () => onSelectSubsystem(null)}
            sx={{
                position: 'relative',
                width: '100%',
                aspectRatio: `${CUBESAT_VIEWBOX.width} / ${CUBESAT_VIEWBOX.height}`,
                borderRadius: 2,
                overflow: 'hidden',
                background: theme.palette.mode === 'dark'
                    ? 'radial-gradient(circle at 44% 12%, rgba(38, 169, 160, 0.18), transparent 24%), radial-gradient(circle at 73% 52%, rgba(90, 160, 62, 0.1), transparent 32%), linear-gradient(160deg, rgba(21, 24, 29, 0.99), rgba(28, 31, 38, 0.97) 48%, rgba(15, 17, 20, 0.99))'
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
                        ? 'drop-shadow(0 26px 32px rgba(0, 0, 0, 0.48)) drop-shadow(0 0 18px rgba(38, 169, 160, 0.08))'
                        : 'drop-shadow(0 18px 24px rgba(22, 34, 56, 0.16))',
                }}
            />

            <Box
                component="svg"
                ref={svgRef}
                viewBox={`0 0 ${CUBESAT_VIEWBOX.width} ${CUBESAT_VIEWBOX.height}`}
                onMouseMove={editMode ? handleSvgMouseMove : undefined}
                onMouseUp={editMode ? handleSvgMouseUp : undefined}
                onMouseLeave={editMode ? handleSvgMouseUp : undefined}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 2,
                    cursor: dragging ? 'grabbing' : 'default',
                    userSelect: 'none',
                }}
            >
                {CUBESAT_SUBSYSTEMS.map((subsystem, sysIdx) => {
                    const poly = getPolygon(sysIdx);
                    const anchor = getAnchor(sysIdx);
                    const anchorSvgY = anchor.y * CUBESAT_VIEWBOX.height / 100;
                    const isActive = subsystem.id === selectedSubsystemId || subsystem.id === hoveredSubsystemId;
                    const fillColor = alpha(subsystem.color, subsystem.id === selectedSubsystemId ? 0.36 : 0.22);

                    return (
                        <g key={subsystem.id}>
                            <polygon
                                points={getPolygonPath(poly)}
                                fill={editMode ? alpha(subsystem.color, 0.12) : (isActive ? fillColor : 'transparent')}
                                stroke={editMode ? subsystem.color : (isActive ? subsystem.color : alpha(subsystem.color, 0.28))}
                                strokeWidth={editMode ? 0.6 : (isActive ? 0.85 : 0.4)}
                                strokeDasharray="none"
                                style={{
                                    cursor: editMode ? 'default' : 'pointer',
                                    transition: editMode ? 'none' : 'all 160ms ease',
                                }}
                                onMouseEnter={editMode ? undefined : () => onHoverSubsystem(subsystem.id)}
                                onMouseLeave={editMode ? undefined : onLeaveSubsystem}
                                onClick={editMode ? undefined : (e) => {
                                    e.stopPropagation();
                                    onSelectSubsystem(subsystem.id);
                                }}
                            />
                            {editMode && poly.map(([px, py], vtxIdx) => (
                                <circle
                                    key={vtxIdx}
                                    cx={px}
                                    cy={py}
                                    r={1.65}
                                    fill={subsystem.color}
                                    stroke="white"
                                    strokeWidth={0.375}
                                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                                    onMouseDown={handleVertexMouseDown(sysIdx, vtxIdx)}
                                />
                            ))}
                            {editMode && (
                                <circle
                                    cx={anchor.x}
                                    cy={anchorSvgY}
                                    r={2.625}
                                    fill={subsystem.color}
                                    stroke="white"
                                    strokeWidth={0.75}
                                    strokeDasharray="2 1.5"
                                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                                    onMouseDown={handleAnchorMouseDown(sysIdx)}
                                />
                            )}
                        </g>
                    );
                })}
            </Box>

            {!editMode && CUBESAT_SUBSYSTEMS.map((subsystem, sysIdx) => {
                const isSelected = subsystem.id === selectedSubsystemId;
                const isHovered = subsystem.id === hoveredSubsystemId;
                const anchor = getAnchor(sysIdx);

                return (
                    <Tooltip key={subsystem.id} title={subsystem.name} placement="top">
                        <ButtonBase
                            onMouseEnter={() => onHoverSubsystem(subsystem.id)}
                            onMouseLeave={onLeaveSubsystem}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectSubsystem(subsystem.id);
                            }}
                            sx={{
                                position: 'absolute',
                                left: `${anchor.x}%`,
                                top: `${anchor.y}%`,
                                transform: 'translate(-50%, -50%)',
                                width: isSelected ? 16.5 : 13.5,
                                height: isSelected ? 16.5 : 13.5,
                                borderRadius: '50%',
                                border: `2px solid ${theme.palette.background.paper}`,
                                backgroundColor: subsystem.color,
                                zIndex: 3,
                                boxShadow: isHovered || isSelected
                                    ? `0 0 0 6px ${alpha(subsystem.color, 0.18)}`
                                    : `0 0 0 3px ${alpha(subsystem.color, 0.12)}`,
                                transition: 'all 160ms ease',
                                '&::after': {
                                    content: '""',
                                    position: 'absolute',
                                    inset: -4.5,
                                    borderRadius: '50%',
                                    border: `1px solid ${alpha(subsystem.color, 0.45)}`,
                                },
                            }}
                            aria-label={subsystem.name}
                        />
                    </Tooltip>
                );
            })}

            {!editMode && activeSubsystem && (
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

            {editMode && (
                <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={handleCopy}
                        sx={{
                            backgroundColor: copied ? theme.palette.success.main : theme.palette.primary.main,
                            '&:hover': {
                                backgroundColor: copied ? theme.palette.success.dark : theme.palette.primary.dark,
                            },
                        }}
                    >
                        {copied ? '✓ Copied!' : '> Copy <'}
                    </Button>
                </Box>
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
