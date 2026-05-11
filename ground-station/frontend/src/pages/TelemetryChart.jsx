import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { fieldLabel, fieldUnit, fieldStep } from './chart-fields.js';
import { pagedDomain } from './chart-logic.js';
import { useAnimatedDomain } from '../hooks/useAnimatedDomain.js';

export function TelemetryChart({ data, xKey, lines, tracking, onTrackingChange }) {
    const theme = useTheme();
    const scrollRef = useRef(null);
    const isAutoScrollLockRef = useRef(false);
    const autoScrollRafRef = useRef(null);
    const hasData = !!data?.length && !!lines?.length;

    const labelFs = theme.typography.caption.fontSize;

    const { maxX, minY, maxY } = useMemo(() => {
        if (!data?.length) return { maxX: 0, minY: 0, maxY: 0 };
        let mx = 0, mn = 0, my = 0;
        for (const d of data) {
            const x = Number(d[xKey]) || 0;
            if (x > mx) mx = x;
            for (const { key } of lines) {
                const v = Number(d[key]) || 0;
                if (v > my) my = v;
                if (v < mn) mn = v;
            }
        }
        return { maxX: mx, minY: mn, maxY: my };
    }, [data, xKey, lines]);

    const stepX = fieldStep(xKey);
    const stepY = lines.reduce((m, { key }) => Math.max(m, fieldStep(key)), 0) || 100;

    const [, xDomainMax] = pagedDomain(maxX, 0, stepX);
    const [yDomainMin, yDomainMax] = pagedDomain(maxY, minY, stepY);

    const animXMax = useAnimatedDomain(xDomainMax);
    const animYMin = useAnimatedDomain(yDomainMin);
    const animYMax = useAnimatedDomain(yDomainMax);

    const xTicks = useMemo(() => {
        if (!animXMax) return [0];
        const raw = stepX / 10;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / mag;
        const nice = n < 1.5 ? mag : n < 3.5 ? 2 * mag : n < 7.5 ? 5 * mag : 10 * mag;
        const count = Math.round(animXMax / nice);
        return Array.from({ length: Math.min(count, 500) + 1 }, (_, i) =>
            Math.round(i * nice * 1e9) / 1e9
        );
    }, [animXMax, stepX]);

    const pagesX = animXMax / stepX;

    const yTicks = useMemo(() => {
        const range = animYMax - animYMin;
        if (range <= 0) return [Math.round(animYMin)];
        const raw = range / 8;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / mag;
        const nice = n < 1.5 ? mag : n < 3.5 ? 2 * mag : n < 7.5 ? 5 * mag : 10 * mag;
        const lo = Math.ceil(animYMin / nice) * nice;
        const result = [];
        for (let v = lo; v <= animYMax + nice * 0.0001; v += nice) {
            result.push(Math.round(v * 1e9) / 1e9);
        }
        return result;
    }, [animYMin, animYMax]);

    useEffect(() => {
        if (!tracking || !hasData) return;
        const el = scrollRef.current;
        if (!el) return;
        const targetLeft = Math.max(0, (maxX / stepX) * el.clientWidth - el.clientWidth * 0.5);
        const start = el.scrollLeft;
        const distance = targetLeft - start;
        if (Math.abs(distance) < 1) return;
        const duration = 300;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min((now - t0) / duration, 1);
            const e = 1 - (1 - p) ** 3;
            isAutoScrollLockRef.current = true;
            el.scrollLeft = start + distance * e;
            if (p < 1) autoScrollRafRef.current = requestAnimationFrame(tick);
        };
        autoScrollRafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(autoScrollRafRef.current);
    }, [tracking, maxX, stepX, hasData]);

    const handleScroll = useCallback(() => {
        if (isAutoScrollLockRef.current) {
            isAutoScrollLockRef.current = false;
            return;
        }
        onTrackingChange(false);
    }, [onTrackingChange]);

    if (!hasData) return null;

    const latestPoint = data[data.length - 1];

    return (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
            <Box sx={{ width: 50, flexShrink: 0, height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 4, right: 0, left: 8, bottom: 34 }}>
                        <YAxis
                            domain={[animYMin, animYMax]}
                            ticks={yTicks}
                            tick={{ fontSize: labelFs, fill: theme.palette.text.secondary }}
                            stroke={theme.palette.divider}
                            width={38}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Box>
            <Box
                ref={scrollRef}
                onScroll={handleScroll}
                sx={{ flex: 1, minWidth: 0, height: '100%', overflowX: 'auto', overflowY: 'hidden' }}
            >
                <Box sx={{ width: `${pagesX * 100}%`, height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.4)} />
                            <XAxis
                                dataKey={xKey}
                                type="number"
                                domain={[0, animXMax]}
                                ticks={xTicks}
                                height={30}
                                tick={{ fontSize: labelFs, fill: theme.palette.text.secondary }}
                                stroke={theme.palette.divider}
                                label={{ value: fieldLabel(xKey), position: 'insideBottom', offset: 2, fontSize: labelFs, fill: theme.palette.text.secondary }}
                            />
                            <YAxis domain={[animYMin, animYMax]} hide width={0} />
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
            </Box>
            {latestPoint && (
                <Box sx={{
                    position: 'absolute',
                    top: 6,
                    left: 58,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    pointerEvents: 'none',
                    zIndex: 10,
                }}>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        {lines.map(({ key, color }) => {
                            const unit = fieldUnit(key);
                            const val = typeof latestPoint[key] === 'number' ? latestPoint[key].toFixed(2) : (latestPoint[key] ?? '—');
                            return (
                                <Typography key={key} variant="caption" sx={{ fontWeight: 700, color, fontSize: 13, lineHeight: 1.2 }}>
                                    {val}{unit && <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.85 }}> {unit}</span>}
                                </Typography>
                            );
                        })}
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11, lineHeight: 1.3 }}>
                        {typeof latestPoint[xKey] === 'number' ? latestPoint[xKey].toFixed(1) : (latestPoint[xKey] ?? '—')}
                        {fieldUnit(xKey) && <span style={{ fontSize: 10, opacity: 0.75 }}> {fieldUnit(xKey)}</span>}
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
