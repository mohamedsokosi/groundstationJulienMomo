import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { appendTerminalLines, resetTerminalVariant } from './telemetry-slice.jsx';

const TERMINAL_FIELDS = ['U_Alt', 'Speed', 'Vert_speed', 'Pressure', '#_Sat', 'U_Lat', 'U_Long'];

const VARIANT_CONFIG = {
    telemetry: { label: 'TÉLÉMÉTRIE LIVE', headerColor: '#5cc8ff', lineColor: '#59d98b', border: '#1d2430' },
    verbose:   { label: 'VERBOSE',         headerColor: '#fbbf24', lineColor: '#fbbf24', border: '#2a2010' },
    errors:    { label: 'ERREURS',         headerColor: '#f87171', lineColor: '#f87171', border: '#2a1010' },
};

function fmtTime(d) {
    const p = (v) => String(v).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const STATUS_COLORS = { green: '#59d98b', red: '#f87171', amber: '#fbbf24', grey: '#8a97a8' };

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
        value: `${bc ? 'connecté' : 'NON connecté'} à ${s.broker_host}:${s.broker_port}`,
    });

    const ta = s.telemetry_active;
    let telVal;
    if (ta) telVal = `active · ${frames} trames · dernière il y a ${s.last_frame_age_sec}s`;
    else if (frames > 0) telVal = `arrêtée · dernière il y a ${s.last_frame_age_sec}s (${frames} trames)`;
    else telVal = 'aucune trame reçue';
    rows.push({
        label: 'Télémétrie',
        mark: ta ? '✓' : '✗',
        color: ta ? green : (frames > 0 ? amber : red),
        value: telVal,
    });

    let rfdMark = '?'; let rfdColor = grey; let rfdVal = 'inconnu (pas d\'info du Pi)';
    if (s.rfd_status === 'connected') { rfdMark = '✓'; rfdColor = green; rfdVal = 'branché (télémétrie reçue)'; }
    else if (s.rfd_status === 'disconnected') { rfdMark = '✗'; rfdColor = red; rfdVal = 'non branché sur le Pi'; }
    rows.push({ label: 'RFD', mark: rfdMark, color: rfdColor, value: rfdVal });

    return rows;
}

function statusHint(s) {
    if (!s.broker_connected) return '→ Pi éteint ou mauvaise IP ? Relancer : gss start <ip-du-pi>';
    if (s.rfd_status === 'disconnected') return '→ Brancher le RFD sur le Pi (/dev/ttyUSB0)';
    if (!s.telemetry_active) return '→ Broker OK — en attente de trames de télémétrie…';
    return '→ Tout est nominal, télémétrie en cours.';
}

// Live "what's happening" block shown in a terminal's empty state, instead of a
// bare "aucune télémétrie". Fed by the /api/status poll.
function StationStatus({ status }) {
    const mono = { fontFamily: 'Consolas, "Courier New", monospace', fontSize: 10, lineHeight: 1.5 };
    if (!status) {
        return <Typography sx={{ ...mono, color: '#a8b3c4', fontStyle: 'italic' }}>Chargement de l&apos;état…</Typography>;
    }
    return (
        <Box>
            <Typography sx={{ ...mono, color: '#5cc8ff', fontWeight: 700 }}>── ÉTAT DE LA STATION ──</Typography>
            {buildStatusRows(status).map((r) => (
                <Box key={r.label} sx={{ display: 'flex', gap: 0.75 }}>
                    <Typography component="span" sx={{ ...mono, color: r.color, width: 8, flexShrink: 0 }}>{r.mark}</Typography>
                    <Typography component="span" sx={{ ...mono, color: '#8a97a8', width: 68, flexShrink: 0 }}>{r.label}</Typography>
                    <Typography component="span" sx={{ ...mono, color: r.color, wordBreak: 'break-word' }}>{r.value}</Typography>
                </Box>
            ))}
            <Typography sx={{ ...mono, color: '#8a97a8', mt: 0.25 }}>{statusHint(status)}</Typography>
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
    const lat = Number(pt['U_Lat']);
    const lon = Number(pt['U_Long']);
    if (!lat || !lon) issues.push('GPS_LOST');
    const sat = Number(pt['#_Sat']);
    if (!Number.isNaN(sat) && sat < 4) issues.push(`LOW_SAT(${sat})`);
    if (pt['U_Alt'] === undefined || pt['U_Alt'] === null || pt['U_Alt'] === '') issues.push('ALT_MISSING');
    if (pt['Pressure'] === undefined || pt['Pressure'] === null || pt['Pressure'] === '') issues.push('PRESSURE_MISSING');
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
            } catch { /* ignore — keep last known status */ }
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
                if (isBlackout && !inBlackout) {
                    inBlackout = true;
                    pushLine(pt._realOutage
                        ? '[RPI_DISCONNECTED]  télémétrie non reçue'
                        : '[BLACKOUT_SIM]  coupure simulée par l\'opérateur');
                    continue;
                }
                if (isBlackout) continue;
                if (inBlackout) {
                    inBlackout = false;
                    pushLine('[TELEMETRY_RESUMED]  réception MQTT rétablie', '#59d98b');
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

    useEffect(() => {
        if (variant !== 'errors') return undefined;
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch(`/api/bridge/logs?after=${bridgeLogIdRef.current}`);
                if (!res.ok) return;
                const json = await res.json();
                const logs = json?.logs ?? [];
                if (cancelled || logs.length === 0) return;
                const newLines = logs.map((e) => ({
                    id: `bridge-${e.id}`,
                    ts: fmtTime(new Date((e.ts ?? Date.now() / 1000) * 1000)),
                    text: `[${e.source}] ${e.message}`,
                    color: String(e.level).startsWith('WARN') ? '#fbbf24' : '#f87171',
                }));
                dispatch(appendTerminalLines({
                    variant: 'errors',
                    lines: newLines,
                    bridgeLogId: logs[logs.length - 1].id,
                }));
            } catch {
                /* network blip — retry next tick */
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
            bgcolor: '#050a0f',
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
                    bgcolor: autoScroll ? '#59d98b' : '#ffcc66',
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
                    '&::-webkit-scrollbar-track': { bgcolor: '#0d0f13' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: '#293241', borderRadius: 2 },
                }}
            >
                {lines.length === 0 ? (
                    variant === 'errors' ? (
                        <Typography sx={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 10,
                            color: '#59d98b',
                        }}>
                            Aucune erreur
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
                                color: '#a8b3c4',
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
