import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { appendTerminalLines, resetTerminalVariant } from './telemetry-slice.jsx';
import { parseMissionTimestamp } from './telemetry-data-source.js';

const TERMINAL_FIELDS = ['U_Alt', 'Speed', 'Vert_speed', 'Pressure', '#_Sat', 'U_Lat', 'U_Long'];

const VARIANT_CONFIG = {
    telemetry: { label: 'LIVE TELEMETRY', headerColor: '#26a9a0', lineColor: '#4caf50', border: '#23272f' },
    verbose:   { label: 'VERBOSE',         headerColor: '#f5a623', lineColor: '#f5a623', border: '#2a2416' },
    errors:    { label: 'ERRORS',          headerColor: '#ef6d6a', lineColor: '#ef6d6a', border: '#2a1616' },
};

function fmtTime(d) {
    const p = (v) => String(v).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const STATUS_COLORS = { green: '#4caf50', red: '#ef6d6a', amber: '#f5a623', grey: '#9aa1ab' };

// Turns the /api/status payload into labelled, coloured rows so the operator can
// see at a glance WHY there's no telemetry (broker down? RFD unplugged? just idle?).
function buildStatusRows(s) {
    const { green, red, amber, grey } = STATUS_COLORS;
    const frames = s.stored_frames ?? 0;
    const rows = [];

    const bc = s.broker_connected;
    rows.push({
        label: 'Broker',
        mark: bc ? '✓' : '✗',
        color: bc ? green : red,
        value: `${bc ? 'connected' : 'NOT connected'} to ${s.broker_host}:${s.broker_port}`,
    });

    const ta = s.telemetry_active;
    let telVal;
    if (ta) telVal = `active · ${frames} frames · last ${s.last_frame_age_sec}s ago`;
    else if (frames > 0) telVal = `stopped · last ${s.last_frame_age_sec}s ago (${frames} frames)`;
    else telVal = 'no frames received';
    rows.push({
        label: 'Telemetry',
        mark: ta ? '✓' : '✗',
        color: ta ? green : (frames > 0 ? amber : red),
        value: telVal,
    });

    let rfdMark = '?'; let rfdColor = grey; let rfdVal = 'unknown (no info from Pi)';
    if (s.rfd_status === 'connected') { rfdMark = '✓'; rfdColor = green; rfdVal = 'connected (telemetry received)'; }
    else if (s.rfd_status === 'disconnected') { rfdMark = '✗'; rfdColor = red; rfdVal = 'not plugged into the Pi'; }
    rows.push({ label: 'RFD', mark: rfdMark, color: rfdColor, value: rfdVal });

    // Backup sinks — only shown when enabled, so the operator sees a failing
    // archive (Sheet quota, disk full…) here too, not just in the ERRORS terminal.
    const sheets = s.sheets_sync;
    if (sheets?.enabled) {
        rows.push({
            label: 'Sheet',
            mark: sheets.ok ? '✓' : '✗',
            color: sheets.ok ? green : red,
            value: sheets.ok
                ? `syncing (${sheets.flushed_total ?? 0} rows sent)`
                : `FAILING - ${sheets.last_error ?? 'error'} (${sheets.buffered_rows ?? 0} buffered)`,
        });
    }
    const csvLog = s.csv_log;
    if (csvLog?.enabled) {
        rows.push({
            label: 'CSV',
            mark: csvLog.ok ? '✓' : '✗',
            color: csvLog.ok ? green : red,
            value: csvLog.ok
                ? 'archiving'
                : `FAILING - ${csvLog.last_error ?? 'error'} (${csvLog.pending_rows ?? 0} buffered)`,
        });
    }

    return rows;
}

function statusHint(s) {
    if (!s.broker_connected) return '→ Pi off or wrong IP? Restart: gss start <pi-ip>';
    if (s.rfd_status === 'disconnected') return '→ Plug the RFD into the Pi (/dev/ttyUSB0)';
    if (!s.telemetry_active) return '→ Broker OK, waiting for telemetry frames…';
    if (s.sheets_sync?.enabled && !s.sheets_sync.ok) return '→ Sheet sync failing — details in the ERRORS terminal';
    if (s.csv_log?.enabled && !s.csv_log.ok) return '→ CSV archive failing — details in the ERRORS terminal';
    return '→ All nominal, telemetry streaming.';
}

// Live "what's happening" block shown in a terminal's empty state, instead of a
// bare "no telemetry". Fed by the /api/status poll.
function StationStatus({ status }) {
    const mono = { fontFamily: 'Consolas, "Courier New", monospace', fontSize: 10, lineHeight: 1.5 };
    if (!status) {
        return <Typography sx={{ ...mono, color: '#9aa1ab', fontStyle: 'italic' }}>Loading status…</Typography>;
    }
    // The /api/status poll itself is failing → the BACKEND is down/restarting.
    // Say exactly that instead of showing stale rows that look healthy.
    if (status._backendUnreachable) {
        return (
            <Box>
                <Typography sx={{ ...mono, color: '#26a9a0', fontWeight: 700 }}>── STATION STATUS ──</Typography>
                <Typography sx={{ ...mono, color: STATUS_COLORS.red }}>
                    ✗ Backend unreachable — the station backend is down or restarting
                </Typography>
                <Typography sx={{ ...mono, color: '#9aa1ab', mt: 0.25 }}>
                    → Check with: gss debug · restart with: gss start
                </Typography>
            </Box>
        );
    }
    return (
        <Box>
            <Typography sx={{ ...mono, color: '#26a9a0', fontWeight: 700 }}>── STATION STATUS ──</Typography>
            {buildStatusRows(status).map((r) => (
                <Box key={r.label} sx={{ display: 'flex', gap: 0.75 }}>
                    <Typography component="span" sx={{ ...mono, color: r.color, width: 8, flexShrink: 0 }}>{r.mark}</Typography>
                    <Typography component="span" sx={{ ...mono, color: '#9aa1ab', width: 68, flexShrink: 0 }}>{r.label}</Typography>
                    <Typography component="span" sx={{ ...mono, color: r.color, wordBreak: 'break-word' }}>{r.value}</Typography>
                </Box>
            ))}
            <Typography sx={{ ...mono, color: '#9aa1ab', mt: 0.25 }}>{statusHint(status)}</Typography>
        </Box>
    );
}

function formatLine(variant, pt) {
    if (variant === 'verbose') {
        return Object.entries(pt)
            .filter(([k, v]) => !k.startsWith('_') && v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(3) : v}`)
            .join('  ') || '[vide]';
    }
    return TERMINAL_FIELDS
        .filter((k) => pt[k] !== undefined && pt[k] !== null && pt[k] !== '')
        .map((k) => {
            const v = typeof pt[k] === 'number' ? pt[k].toFixed(2) : pt[k];
            return `${k}=${v}`;
        })
        .join('  ') || '[vide]';
}

function detectErrors(pt) {
    const issues = [];
    // Missing/corrupted mission time: the charts drop these frames entirely
    // (buildTelemetryChartData), so tell the operator why they're not plotted.
    if (parseMissionTimestamp(pt) === null) issues.push('BAD_TIME(wrong mission time — ignored on charts)');
    const lat = Number(pt['U_Lat']);
    const lon = Number(pt['U_Long']);
    if (!lat || !lon) issues.push('GPS_LOST');
    const sat = Number(pt['#_Sat']);
    if (!Number.isNaN(sat) && sat < 4) issues.push(`LOW_SAT(${sat})`);
    if (pt['U_Alt'] === undefined || pt['U_Alt'] === null || pt['U_Alt'] === '') issues.push('ALT_MISSING');
    if (pt['Pressure'] === undefined || pt['Pressure'] === null || pt['Pressure'] === '') issues.push('PRESSURE_MISSING');
    // A unit quaternion has norm 1 — anything far off means corrupted IMU data
    // (the 3D view drops the camera projection for such frames).
    if (pt['Quat_w'] !== undefined) {
        const norm = Math.hypot(
            Number(pt['Quat_w']) || 0, Number(pt['Quat_x']) || 0,
            Number(pt['Quat_y']) || 0, Number(pt['Quat_z']) || 0,
        );
        if (norm < 0.8 || norm > 1.2) issues.push(`BAD_QUAT(norm ${norm.toFixed(2)})`);
    }
    return issues;
}

export function TelemetryTerminal({ variant = 'telemetry' }) {
    const cfg = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.telemetry;
    const dispatch = useDispatch();
    const data = useSelector((state) => state.telemetry?.telemetryData ?? []);
    // Always defined: initialState seeds all three variants.
    const variantState = useSelector((state) => state.telemetry.terminalState[variant]);
    const lines = variantState.lines;
    const containerRef = useRef(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const suppressScrollRef = useRef(false);
    const [stationStatus, setStationStatus] = useState(null);

    // Poll the aggregate station status (broker/telemetry/RFD) so the empty state
    // of the telemetry/verbose terminals can explain what's happening instead of
    // just "no data". The errors terminal doesn't use it — when it has no lines it
    // simply shows "Aucune erreur" — so skip the poll there.
    useEffect(() => {
        if (variant === 'errors') return undefined;
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch('/api/status');
                if (!res.ok) return;
                const json = await res.json();
                if (!cancelled) setStationStatus(json);
            } catch {
                // The backend itself is unreachable — flag it so the status block
                // says so instead of silently showing the last (stale) state.
                if (!cancelled) setStationStatus((prev) => ({ ...(prev ?? {}), _backendUnreachable: true }));
            }
        };
        poll();
        const timer = setInterval(poll, 2000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [variant]);

    useEffect(() => {
        if (!data?.length) {
            // Reset only if telemetry was actually being processed (cursor > 0).
            // Do NOT key off lines.length: the errors variant can hold bridge-log
            // lines (forwarded from the Pi) while there is zero telemetry, and a
            // reset here would wipe them on every poll.
            if (variantState.cursor > 0) {
                dispatch(resetTerminalVariant(variant));
            }
            return;
        }
        if (data.length < variantState.cursor) {
            dispatch(resetTerminalVariant(variant));
            return;
        }
        if (data.length <= variantState.cursor) return;

        const newPoints = data.slice(variantState.cursor);

        const now = new Date();
        const ts = fmtTime(now);

        const newLines = [];
        let inBlackout = variantState.inBlackout;
        const pushLine = (text, color) => newLines.push({
            id: `${Date.now()}-${Math.random()}-${newLines.length}`,
            ts,
            text,
            color,
        });
        for (const pt of newPoints) {
            const isBlackout = Boolean(pt._blackout);
            if (variant === 'errors') {
                // Received-but-unusable frame (wrong time / impossible value):
                // it IS a red ghost on the charts, but the telemetry arrived —
                // flag it with its reason, do NOT call it an outage.
                if (isBlackout && pt._badData) {
                    pushLine(`[BAD_TELEMETRY]  ${pt._badReason ?? 'corrupt'} — frame ignored on charts`);
                    continue;
                }
                if (isBlackout && !inBlackout) {
                    inBlackout = true;
                    pushLine(pt._realOutage
                        ? '[RPI_DISCONNECTED]  telemetry not received'
                        : '[BLACKOUT_SIM]  outage simulated by operator');
                    continue;
                }
                if (isBlackout) continue;
                if (inBlackout) {
                    inBlackout = false;
                    pushLine('[TELEMETRY_RESUMED]  MQTT reception restored', '#4caf50');
                }
                const issues = detectErrors(pt);
                if (issues.length === 0) continue;
                pushLine(`[${issues.join(', ')}]  ${formatLine('telemetry', pt)}`);
            } else {
                pushLine(formatLine(variant, pt));
            }
        }

        dispatch(appendTerminalLines({
            variant,
            lines: newLines,
            // The reducer drops the batch if another terminal instance (or a
            // StrictMode re-run) already advanced the cursor past fromCursor —
            // otherwise every line would be appended once per mounted terminal.
            fromCursor: variantState.cursor,
            cursor: data.length,
            inBlackout,
        }));
    }, [data, variant, variantState, dispatch]);

    // Pi bridge errors forwarded over MQTT (icarus2/bridge/log) → red lines in
    // the errors terminal. Polls /api/bridge/logs with the last seen id so only
    // new lines are appended; the id persists in Redux so route changes don't
    // duplicate. Independent of telemetry — surfaces even when no frames flow.
    const bridgeLogIdRef = useRef(variantState.bridgeLogId ?? 0);
    useEffect(() => {
        bridgeLogIdRef.current = variantState.bridgeLogId ?? 0;
    }, [variantState.bridgeLogId]);

    // Consecutive /api/bridge/logs failures — after 3 (~6 s) the BACKEND itself is
    // considered down and one red line says so (plus a green line on recovery), so
    // even a dead backend is never silent in the errors terminal.
    const backendFailsRef = useRef(0);

    useEffect(() => {
        if (variant !== 'errors') return undefined;
        let cancelled = false;
        const lineColor = (level) => {
            const l = String(level);
            if (l.startsWith('WARN')) return '#f5a623';
            if (l === 'INFO') return '#59d98b'; // recovery lines ("restored", "reconnected")
            return '#ef6d6a';
        };
        // backendDown rides along so the reducer can make the down/up lines
        // idempotent — with two mounted errors terminals both would otherwise
        // announce the same outage.
        const appendLocal = (text, color, backendDown) => dispatch(appendTerminalLines({
            variant: 'errors',
            backendDown,
            lines: [{ id: `station-${Date.now()}`, ts: fmtTime(new Date()), text, color }],
        }));
        const poll = async () => {
            try {
                const res = await fetch(`/api/bridge/logs?after=${bridgeLogIdRef.current}`);
                if (!res.ok) return;
                if (cancelled) return;
                if (backendFailsRef.current >= 3) {
                    appendLocal('[station] backend reachable again', '#59d98b', false);
                }
                backendFailsRef.current = 0;
                const json = await res.json();
                const logs = json?.logs ?? [];
                if (cancelled || logs.length === 0) return;
                const newLines = logs.map((e) => ({
                    id: `bridge-${e.id}`,
                    ts: fmtTime(new Date((e.ts ?? Date.now() / 1000) * 1000)),
                    text: `[${e.source}] ${e.message}`,
                    color: lineColor(e.level),
                }));
                dispatch(appendTerminalLines({
                    variant: 'errors',
                    lines: newLines,
                    bridgeLogId: logs[logs.length - 1].id,
                }));
            } catch {
                if (cancelled) return;
                backendFailsRef.current += 1;
                if (backendFailsRef.current === 3) {
                    appendLocal(
                        '[station] backend unreachable — no telemetry/error feed (gss debug, gss start)',
                        '#ef6d6a',
                        true,
                    );
                }
            }
        };
        poll();
        const timer = setInterval(poll, 2000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [variant, dispatch]);

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

    return (
        <Paper sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: '#15181d',
            border: `1px solid ${cfg.border}`,
        }}>
            <Box sx={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                px: 1,
                py: 0.25,
                borderBottom: `1px solid ${cfg.border}`,
                gap: 0.75,
            }}>
                <Typography sx={{
                    fontFamily: 'Consolas, "Courier New", monospace',
                    fontSize: 10,
                    fontWeight: 700,
                    color: cfg.headerColor,
                    letterSpacing: 0,
                    lineHeight: 1,
                }}>
                    {cfg.label}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Box sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: autoScroll ? '#4caf50' : '#f5a623',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                }} />
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
                    '&::-webkit-scrollbar-track': { bgcolor: '#15181d' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: '#33383f', borderRadius: 0 },
                }}
            >
                {lines.length === 0 ? (
                    variant === 'errors' ? (
                        <Typography sx={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 10,
                            color: '#4caf50',
                        }}>
                            No errors
                        </Typography>
                    ) : (
                        <StationStatus status={stationStatus} />
                    )
                ) : (
                    lines.map((line) => (
                        <Box key={line.id} sx={{ display: 'flex', gap: 1, lineHeight: 1.5 }}>
                            <Typography component="span" sx={{
                                fontFamily: 'Consolas, "Courier New", monospace',
                                fontSize: 10,
                                color: '#9aa1ab',
                                flexShrink: 0,
                                lineHeight: 'inherit',
                            }}>
                                {line.ts}
                            </Typography>
                            <Typography component="span" sx={{
                                fontFamily: 'Consolas, "Courier New", monospace',
                                fontSize: 10,
                                color: line.color ?? cfg.lineColor,
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
