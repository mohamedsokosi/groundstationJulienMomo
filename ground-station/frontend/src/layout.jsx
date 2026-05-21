import * as React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import {
    AppBar,
    Box,
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Tooltip,
    Typography,
    styled,
    useTheme,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { setSourceMode } from './pages/shared/telemetry-slice.jsx';
import { getNavigation } from './navigation.jsx';
import { PageActionsProvider, usePageActions } from './page-actions-context.jsx';

const SAFARI_HEADER_LOGO = '/SAFARI.png';
const EASTER_IMG   = '/urgetopee.png';
const EASTER_VIDEO = '/John%20Cena%20Speaking%20Mandarin%20and%20Eating%20Ice%20Cream%20Full%20Original.mp4';

const HEADER_PARTNER_LOGOS = [
    { src: '/ETS.jpg',    alt: 'ETS',                   variant: 'square' },
    { src: '/Lassena.png',alt: 'LASSENA',               variant: 'wide'   },
    { src: '/CSA.png',    alt: 'Canadian Space Agency', variant: 'square' },
    { src: '/seds.png',   alt: 'SEDS Canada',           variant: 'square' },
];

const drawerWidthExpanded  = 240;
const drawerWidthCollapsed = 56;

const openedMixin = (theme) => ({
    width: drawerWidthExpanded,
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: 'hidden',
});

const closedMixin = (theme) => ({
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    overflowX: 'hidden',
    width: drawerWidthCollapsed,
});

const CustomDrawer = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'open' })(
    ({ theme, open }) => ({
        width: open ? drawerWidthExpanded : drawerWidthCollapsed,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...(open  && { ...openedMixin(theme), '& .MuiDrawer-paper': openedMixin(theme) }),
        ...(!open && { ...closedMixin(theme), '& .MuiDrawer-paper': closedMixin(theme) }),
    }),
);

function EasterEgg({ onDone }) {
    const [opacity, setOpacity] = React.useState(0);
    const onDoneRef = React.useRef(onDone);
    onDoneRef.current = onDone;
    const imgRef   = React.useRef(null);
    const videoRef = React.useRef(null);

    React.useEffect(() => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const size = Math.round(W * 0.10);
        const items = [
            { x: Math.random() * (W - size), y: Math.random() * (H - size), vx: (Math.random() > 0.5 ? 1 : -1) * 260, vy: (Math.random() > 0.5 ? 1 : -1) * 190 },
            { x: Math.random() * (W - size), y: Math.random() * (H - size), vx: (Math.random() > 0.5 ? -1 : 1) * 260, vy: (Math.random() > 0.5 ? -1 : 1) * 190 },
        ];
        const els = [imgRef, videoRef];
        let raf;
        let last = performance.now();

        const tick = (now) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;

            for (const s of items) {
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                if (s.x < 0)        { s.x = 0;        s.vx =  Math.abs(s.vx); }
                if (s.x > W - size) { s.x = W - size; s.vx = -Math.abs(s.vx); }
                if (s.y < 0)        { s.y = 0;        s.vy =  Math.abs(s.vy); }
                if (s.y > H - size) { s.y = H - size; s.vy = -Math.abs(s.vy); }
            }

            // Collision: elastic bounce when circles overlap
            const [a, b] = items;
            const dx = (a.x + size / 2) - (b.x + size / 2);
            const dy = (a.y + size / 2) - (b.y + size / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < size && dist > 0) {
                const nx = dx / dist, ny = dy / dist;
                const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
                const dot = dvx * nx + dvy * ny;
                if (dot < 0) {
                    a.vx -= dot * nx; a.vy -= dot * ny;
                    b.vx += dot * nx; b.vy += dot * ny;
                }
                const overlap = (size - dist) / 2;
                a.x += nx * overlap; a.y += ny * overlap;
                b.x -= nx * overlap; b.y -= ny * overlap;
            }

            for (let i = 0; i < 2; i++) {
                const el = els[i].current;
                if (el) {
                    el.style.left   = `${items[i].x}px`;
                    el.style.top    = `${items[i].y}px`;
                    el.style.width  = `${size}px`;
                    el.style.height = `${size}px`;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    React.useEffect(() => {
        const raf = requestAnimationFrame(() => setOpacity(1));
        const t1 = setTimeout(() => setOpacity(0), 4200);
        const t2 = setTimeout(() => onDoneRef.current(), 5000);
        return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
    }, []);

    return (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', opacity, transition: 'opacity 0.6s ease' }}>
            <Box ref={imgRef} sx={{ position: 'fixed', pointerEvents: 'none' }}>
                <img src={EASTER_IMG} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </Box>
            <Box ref={videoRef} sx={{ position: 'fixed', pointerEvents: 'none' }}>
                <video
                    src={EASTER_VIDEO}
                    autoPlay
                    loop
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onCanPlay={(e) => {
                        const el = e.target;
                        el.playbackRate = 2;
                        if (!el._boosted) {
                            el._boosted = true;
                            try {
                                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                                const src = ctx.createMediaElementSource(el);
                                const gain = ctx.createGain();
                                gain.gain.value = 1.5;
                                src.connect(gain);
                                gain.connect(ctx.destination);
                                ctx.resume();
                            } catch (_) {}
                        }
                    }}
                />
            </Box>
        </Box>
    );
}

function HeaderPartnerLogos() {
    return (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mx: 1 }}>
            {HEADER_PARTNER_LOGOS.map((logo) => (
                <Box
                    key={logo.alt}
                    sx={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        height: 32,
                        width: logo.variant === 'wide' ? 120 : 32,
                        borderRadius: 0.75,
                        backgroundColor: 'rgba(255,255,255,0.08)',
                    }}
                >
                    <Box
                        component="img"
                        src={logo.src}
                        alt={logo.alt}
                        sx={{ display: 'block', maxHeight: 30, maxWidth: logo.variant === 'wide' ? 116 : 30, objectFit: 'contain' }}
                    />
                </Box>
            ))}
        </Stack>
    );
}

function AppTitle({ onLogoClick }) {
    return (
        <Box display="flex" alignItems="center" gap={1} onClick={onLogoClick} sx={{ userSelect: 'none' }}>
            <img src={SAFARI_HEADER_LOGO} alt="SAFARI" style={{ height: 30, width: 54, objectFit: 'cover', borderRadius: 4 }} />
            <Typography variant="h6">Ground Station</Typography>
        </Box>
    );
}

const MQTT_ONLY_ROUTES = ['/station', '/vueGlobe3d'];

function TelemetrySourceToggle() {
    const dispatch = useDispatch();
    const sourceMode = useSelector((state) => state.telemetry?.sourceMode ?? 'csv');
    const location = useLocation();

    if (MQTT_ONLY_ROUTES.some((r) => location.pathname.startsWith(r))) return null;

    return (
        <ToggleButtonGroup
            value={sourceMode}
            exclusive
            onChange={(_, value) => { if (value) dispatch(setSourceMode(value)); }}
            size="small"
            sx={{ mr: 1.5 }}
        >
            <ToggleButton value="csv" sx={{ px: 1.5, fontSize: '0.75rem' }}>
                CSV
            </ToggleButton>
            <ToggleButton value="mqtt" sx={{ px: 1.5, fontSize: '0.75rem', gap: 0.75 }}>
                <Box
                    sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: sourceMode === 'mqtt' ? 'success.main' : 'grey.600',
                        flexShrink: 0,
                        ...(sourceMode === 'mqtt' && {
                            boxShadow: '0 0 0 2px rgba(102,187,106,0.35)',
                            animation: 'mqtt-pulse 1.8s ease-in-out infinite',
                            '@keyframes mqtt-pulse': {
                                '0%, 100%': { boxShadow: '0 0 0 2px rgba(102,187,106,0.35)' },
                                '50%':       { boxShadow: '0 0 0 5px rgba(102,187,106,0)' },
                            },
                        }),
                    }}
                />
                MQTT Live
            </ToggleButton>
        </ToggleButtonGroup>
    );
}

function ToolbarActions() {
    const { node } = usePageActions();
    return (
        <Stack direction="row" alignItems="center">
            {node}
            <TelemetrySourceToggle />
            <HeaderPartnerLogos />
        </Stack>
    );
}

function DrawerContent({ isExpanded, navigation, onNavigate, isActive }) {
    return (
        <>
            <Toolbar />
            <Box component="nav" sx={{ overflow: 'auto', mt: 1 }}>
                <List>
                    {navigation.map((item, index) => {
                        if (item.kind === 'header') {
                            return isExpanded ? (
                                <ListItem key={index} sx={{ pt: 2, pb: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', pl: 2 }}>
                                        {item.title}
                                    </Typography>
                                </ListItem>
                            ) : null;
                        }
                        if (item.kind === 'divider') return <Divider key={index} sx={{ my: 1 }} />;

                        const active = isActive(item.segment);
                        return (
                            <ListItem key={index} disablePadding sx={{ display: 'block' }}>
                                <Tooltip title={!isExpanded ? item.title : ''} placement="right" disableFocusListener disableTouchListener>
                                    <ListItemButton
                                        onClick={() => onNavigate(item.segment)}
                                        selected={active}
                                        sx={{
                                            minHeight: 40,
                                            justifyContent: isExpanded ? 'flex-start' : 'center',
                                            px: isExpanded ? 2 : 0,
                                            py: 0.75,
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 0, mr: isExpanded ? 2 : 0, display: 'flex', justifyContent: 'center' }}>
                                            {item.icon}
                                        </ListItemIcon>
                                        {isExpanded && (
                                            <ListItemText primary={item.title} sx={{ '& .MuiTypography-root': { fontSize: '0.875rem' } }} />
                                        )}
                                    </ListItemButton>
                                </Tooltip>
                            </ListItem>
                        );
                    })}
                </List>
            </Box>
        </>
    );
}

export default function Layout() {
    const navigate  = useNavigate();
    const location  = useLocation();
    const navigation = getNavigation();
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [showEasterEgg, setShowEasterEgg] = React.useState(false);
    const logoClicks = React.useRef(0);
    const handleLogoClick = React.useCallback(() => {
        logoClicks.current += 1;
        if (logoClicks.current >= 10) {
            logoClicks.current = 0;
            setShowEasterEgg(true);
        }
    }, []);

    const handleNavigation = (segment) => {
        navigate(`/${segment}`);
        setMobileOpen(false);
    };

    const isActive = (segment) => {
        const current = location.pathname.slice(1);
        return segment ? current.startsWith(segment) : current === '';
    };

    const drawerProps = { navigation, onNavigate: handleNavigation, isActive };

    return (
        <PageActionsProvider>
            <Box sx={{ display: 'flex', minHeight: '100vh', overflow: 'hidden' }}>
                <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
                    <Toolbar>
                        <Box sx={{ flexGrow: 1 }}>
                            <AppTitle onLogoClick={handleLogoClick} />
                        </Box>
                        <ToolbarActions />
                    </Toolbar>
                </AppBar>

                {/* Mobile drawer */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { width: drawerWidthExpanded } }}
                >
                    <DrawerContent isExpanded {...drawerProps} />
                </Drawer>

                {/* Desktop drawer */}
                <CustomDrawer
                    variant="permanent"
                    open={false}
                    sx={{ display: { xs: 'none', sm: 'block' } }}
                >
                    <DrawerContent isExpanded={false} {...drawerProps} />
                </CustomDrawer>

                <Box component="main" sx={{ flexGrow: 1, mt: '52px', minWidth: 0 }}>
                    <Outlet />
                </Box>
            </Box>
            {showEasterEgg && <EasterEgg onDone={() => setShowEasterEgg(false)} />}
        </PageActionsProvider>
    );
}
