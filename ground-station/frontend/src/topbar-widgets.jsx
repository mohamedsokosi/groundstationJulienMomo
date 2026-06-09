import * as React from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AirIcon from '@mui/icons-material/Air';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import CloudIcon from '@mui/icons-material/Cloud';
import FilterDramaIcon from '@mui/icons-material/FilterDrama';
import GrainIcon from '@mui/icons-material/Grain';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import ThunderstormIcon from '@mui/icons-material/Thunderstorm';
import FoggyIcon from '@mui/icons-material/Foggy';
import { loadGroundStationPosition } from './pages/shared/cesium-utils.js';

const LAUNCH_TIME_KEY = 'launch_datetime';
const WEATHER_REFRESH_MS = 10 * 60 * 1000; // 10 min

// --- Shared 1 Hz clock so every widget ticks off one interval ----------------
function useNow(intervalMs = 1000) {
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

// --- Weather + wind ----------------------------------------------------------
// Single source for both the Météo and Vent widgets. Swap THIS function to use a
// different provider — it must resolve to { tempC, windKmh, windDir, code }.
async function fetchWeather({ lat, lon }, signal) {
    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m` +
        `&wind_speed_unit=kmh&timezone=auto`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const json = await res.json();
    const c = json.current ?? {};
    return {
        tempC: c.temperature_2m,
        windKmh: c.wind_speed_10m,
        windDir: c.wind_direction_10m,
        code: c.weather_code,
    };
}

function useWeather() {
    const [weather, setWeather] = React.useState(null);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        let controller;
        let timer;
        const load = async () => {
            controller = new AbortController();
            try {
                const data = await fetchWeather(loadGroundStationPosition(), controller.signal);
                setWeather(data);
                setError(false);
            } catch (e) {
                if (e.name !== 'AbortError') setError(true);
            }
            timer = setTimeout(load, WEATHER_REFRESH_MS);
        };
        load();
        return () => {
            controller?.abort();
            clearTimeout(timer);
        };
    }, []);

    return { weather, error };
}

// WMO weather code → icon + French label
function weatherFor(code) {
    if (code == null) return { Icon: CloudIcon, text: '—' };
    if (code === 0) return { Icon: WbSunnyIcon, text: 'Dégagé' };
    if (code <= 2) return { Icon: FilterDramaIcon, text: 'Partiel' };
    if (code === 3) return { Icon: CloudIcon, text: 'Couvert' };
    if (code <= 48) return { Icon: FoggyIcon, text: 'Brouillard' };
    if (code <= 67) return { Icon: GrainIcon, text: 'Pluie' };
    if (code <= 77) return { Icon: AcUnitIcon, text: 'Neige' };
    if (code <= 82) return { Icon: GrainIcon, text: 'Averses' };
    if (code <= 86) return { Icon: AcUnitIcon, text: 'Neige' };
    return { Icon: ThunderstormIcon, text: 'Orage' };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function compass(deg) {
    if (deg == null) return '';
    return COMPASS[Math.round(deg / 45) % 8];
}

// --- Countdown helpers -------------------------------------------------------
function toLocalInputValue(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCountdown(deltaMs) {
    const sign = deltaMs >= 0 ? 'T-' : 'T+';
    let s = Math.floor(Math.abs(deltaMs) / 1000);
    const days = Math.floor(s / 86400); s -= days * 86400;
    const h = Math.floor(s / 3600);     s -= h * 3600;
    const m = Math.floor(s / 60);       s -= m * 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${sign} ${days > 0 ? days + 'j ' : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
}

// --- Presentational ----------------------------------------------------------
function WidgetBox({ icon, value, label, title, onClick }) {
    const content = (
        <Box
            onClick={onClick}
            sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1, height: 38, borderRadius: 1,
                border: '1px solid rgba(255,255,255,0.18)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                cursor: onClick ? 'pointer' : 'default',
                '&:hover': onClick ? { borderColor: 'rgba(255,255,255,0.45)' } : undefined,
            }}
        >
            <Box sx={{ display: 'flex', color: 'rgba(255,255,255,0.7)' }}>{icon}</Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'white', fontFamily: 'monospace', lineHeight: 1.15 }}>
                    {value}
                </Typography>
                {label && (
                    <Typography sx={{ fontSize: 8.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1, letterSpacing: 0.6 }}>
                        {label}
                    </Typography>
                )}
            </Box>
        </Box>
    );
    return title ? <Tooltip title={title}>{content}</Tooltip> : content;
}

function ClockWidget({ now }) {
    const time = new Date(now).toLocaleTimeString('fr-CA', { hour12: false });
    const date = new Date(now).toLocaleDateString('fr-CA', { day: '2-digit', month: 'short' });
    return <WidgetBox icon={<AccessTimeIcon sx={{ fontSize: 18 }} />} value={time} label={date.toUpperCase()} title="Heure locale" />;
}

function WeatherWidget({ weather, error }) {
    const { Icon, text } = weatherFor(weather?.code);
    const value = error ? '—' : weather ? `${Math.round(weather.tempC)}°C` : '…';
    return <WidgetBox icon={<Icon sx={{ fontSize: 18 }} />} value={value} label={error ? 'MÉTÉO N/A' : text.toUpperCase()} title="Météo (station sol)" />;
}

function WindWidget({ weather, error }) {
    const value = error || !weather ? (error ? '—' : '…') : `${Math.round(weather.windKmh)} km/h`;
    const label = weather && !error ? `VENT ${compass(weather.windDir)}` : 'VENT';
    return <WidgetBox icon={<AirIcon sx={{ fontSize: 18 }} />} value={value} label={label} title="Vitesse et direction du vent" />;
}

function CountdownWidget({ now }) {
    const [launchMs, setLaunchMs] = React.useState(() => {
        const saved = localStorage.getItem(LAUNCH_TIME_KEY);
        const n = saved ? Number(saved) : NaN;
        return Number.isFinite(n) ? n : null;
    });
    const [editing, setEditing] = React.useState(false);
    // Seed the draft with a concrete value so the picker is non-empty even before
    // the operator touches it — clicking "valider" then commits this default
    // instead of being swallowed by an empty-draft guard.
    const [draft, setDraft] = React.useState(() => toLocalInputValue(launchMs ?? Date.now()));

    const openEditor = () => {
        setDraft(toLocalInputValue(launchMs ?? now));
        setEditing(true);
    };

    const commit = () => {
        if (!draft) return;
        const ms = new Date(draft).getTime();
        if (!Number.isFinite(ms)) return;
        setLaunchMs(ms);
        localStorage.setItem(LAUNCH_TIME_KEY, String(ms));
        setEditing(false);
    };

    if (editing || launchMs == null) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <input
                    type="datetime-local"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.1)', color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4,
                        padding: '4px 6px', fontSize: 12, colorScheme: 'dark',
                    }}
                />
                <Tooltip title="Valider l'heure de lancement">
                    <IconButton size="small" onClick={commit} sx={{ color: '#7CFC00' }}>
                        <CheckIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                {launchMs != null && (
                    <IconButton size="small" onClick={() => setEditing(false)} sx={{ color: 'white' }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                )}
            </Box>
        );
    }

    return (
        <WidgetBox
            icon={<RocketLaunchIcon sx={{ fontSize: 18 }} />}
            value={formatCountdown(launchMs - now)}
            label="DÉCOMPTE T"
            title="Modifier l'heure de lancement"
            onClick={openEditor}
        />
    );
}

export function TopbarWidgets() {
    const now = useNow(1000);
    const { weather, error } = useWeather();
    return (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mx: 1 }}>
            <ClockWidget now={now} />
            <WeatherWidget weather={weather} error={error} />
            <WindWidget weather={weather} error={error} />
            <CountdownWidget now={now} />
        </Stack>
    );
}
