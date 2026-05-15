import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { useSelector } from 'react-redux';

const TERMINAL_FIELDS = ['U_Alt', 'Speed', 'Vert_speed', 'Pressure', '#_Sat', 'U_Lat', 'U_Long'];

function fmtTime(d) {
    const p = (v) => String(v).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function TelemetryTerminal() {
    const data = useSelector((state) => state.telemetry?.telemetryData ?? []);
    const [lines, setLines] = useState([]);
    const prevLengthRef = useRef(0);
    const containerRef = useRef(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const suppressScrollRef = useRef(false);

    useEffect(() => {
        if (!data?.length) {
            if (prevLengthRef.current > 0) {
                setLines([]);
                prevLengthRef.current = 0;
            }
            return;
        }
        if (data.length < prevLengthRef.current) {
            setLines([]);
            prevLengthRef.current = 0;
        }
        if (data.length <= prevLengthRef.current) return;

        const newPoints = data.slice(prevLengthRef.current);
        prevLengthRef.current = data.length;

        const now = new Date();
        const ts = fmtTime(now);
        const newLines = newPoints.map((pt) => {
            const text = TERMINAL_FIELDS
                .filter((k) => pt[k] !== undefined && pt[k] !== null && pt[k] !== '')
                .map((k) => {
                    const v = typeof pt[k] === 'number' ? pt[k].toFixed(2) : pt[k];
                    return `${k}=${v}`;
                })
                .join('  ');
            return { id: `${Date.now()}-${Math.random()}`, ts, text: text || '[vide]' };
        });

        setLines((prev) => {
            const next = [...prev, ...newLines];
            return next.length > 500 ? next.slice(next.length - 500) : next;
        });
    }, [data]);

    useEffect(() => {
        if (!autoScroll) return;
        const el = containerRef.current;
        if (!el) return;
        suppressScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
    }, [lines, autoScroll]);

    const handleScroll = useCallback(() => {
        if (suppressScrollRef.current) {
            suppressScrollRef.current = false;
            return;
        }
        const el = containerRef.current;
        if (!el) return;
        setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - 12);
    }, []);

    const handleClear = useCallback(() => {
        setLines([]);
        prevLengthRef.current = 0;
    }, []);

    return (
        <Paper sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: '#050a0f',
            border: '1px solid #1d2430',
        }}>
            <Box sx={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                px: 1,
                py: 0.25,
                borderBottom: '1px solid #1d2430',
                gap: 0.75,
            }}>
                <Typography sx={{
                    fontFamily: 'Consolas, "Courier New", monospace',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#5cc8ff',
                    letterSpacing: 0,
                    lineHeight: 1,
                }}>
                    TÉLÉMÉTRIE LIVE
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Box sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: autoScroll ? '#59d98b' : '#ffcc66',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                }} />
                <Button
                    size="small"
                    onClick={handleClear}
                    sx={{
                        minWidth: 0,
                        px: 0.75,
                        py: 0,
                        fontSize: 9,
                        lineHeight: 1.6,
                        fontFamily: 'Consolas, monospace',
                        fontWeight: 700,
                        color: '#a8b3c4',
                        '&:hover': { color: '#5cc8ff', bgcolor: 'transparent' },
                    }}
                >
                    CLR
                </Button>
            </Box>

            <Box
                ref={containerRef}
                onScroll={handleScroll}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    p: 0.5,
                    '&::-webkit-scrollbar': { width: 4 },
                    '&::-webkit-scrollbar-track': { bgcolor: '#0d0f13' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: '#293241', borderRadius: 2 },
                }}
            >
                {lines.length === 0 ? (
                    <Typography sx={{
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: 10,
                        color: '#a8b3c4',
                        fontStyle: 'italic',
                        lineHeight: 1.6,
                    }}>
                        Waiting for data...
                    </Typography>
                ) : (
                    lines.map((line) => (
                        <Box key={line.id} sx={{ display: 'flex', gap: 1, lineHeight: 1.5 }}>
                            <Typography component="span" sx={{
                                fontFamily: 'Consolas, "Courier New", monospace',
                                fontSize: 10,
                                color: '#a8b3c4',
                                flexShrink: 0,
                                lineHeight: 'inherit',
                            }}>
                                {line.ts}
                            </Typography>
                            <Typography component="span" sx={{
                                fontFamily: 'Consolas, "Courier New", monospace',
                                fontSize: 10,
                                color: '#59d98b',
                                wordBreak: 'break-all',
                                lineHeight: 'inherit',
                            }}>
                                {line.text}
                            </Typography>
                        </Box>
                    ))
                )}
            </Box>
        </Paper>
    );
}
