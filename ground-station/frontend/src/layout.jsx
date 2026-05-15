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
    Toolbar,
    Tooltip,
    Typography,
    styled,
    useTheme,
} from '@mui/material';
import { getNavigation } from './navigation.jsx';
import { PageActionsProvider, usePageActions } from './page-actions-context.jsx';

const SAFARI_HEADER_LOGO = '/SAFARI.png';
const HEADER_PARTNER_LOGOS = [
    { src: '/ETS.jpg',    alt: 'ETS',                   href: 'https://www.etsmtl.ca/',             variant: 'square' },
    { src: '/Lassena.png',alt: 'LASSENA',               href: 'https://lassena.etsmtl.ca/',         variant: 'wide'   },
    { src: '/CSA.png',    alt: 'Canadian Space Agency', href: 'https://www.asc-csa.gc.ca/eng/',     variant: 'square' },
    { src: '/seds.png',   alt: 'SEDS Canada',           href: 'https://www.seds.ca/',               variant: 'square' },
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

function HeaderPartnerLogos() {
    return (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mx: 1 }}>
            {HEADER_PARTNER_LOGOS.map((logo) => (
                <Tooltip title={logo.alt} key={logo.alt}>
                    <Box
                        component="a"
                        href={logo.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            height: 32,
                            width: logo.variant === 'wide' ? 120 : 32,
                            borderRadius: 0.75,
                            backgroundColor: 'rgba(255,255,255,0.08)',
                            textDecoration: 'none',
                            transition: 'background-color 160ms ease, transform 160ms ease',
                            '&:hover': { backgroundColor: 'rgba(255,255,255,0.16)', transform: 'translateY(-1px)' },
                        }}
                    >
                        <Box
                            component="img"
                            src={logo.src}
                            alt={logo.alt}
                            sx={{ display: 'block', maxHeight: 30, maxWidth: logo.variant === 'wide' ? 116 : 30, objectFit: 'contain' }}
                        />
                    </Box>
                </Tooltip>
            ))}
        </Stack>
    );
}

function AppTitle() {
    return (
        <Box display="flex" alignItems="center" gap={1}>
            <img src={SAFARI_HEADER_LOGO} alt="SAFARI" style={{ height: 30, width: 54, objectFit: 'cover', borderRadius: 4 }} />
            <Typography variant="h6">Ground Station</Typography>
        </Box>
    );
}

function ToolbarActions() {
    const { node } = usePageActions();
    return (
        <Stack direction="row" alignItems="center">
            {node}
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
    const [open, setOpen]             = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);

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
                            <AppTitle />
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
                    open={open}
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    sx={{ display: { xs: 'none', sm: 'block' } }}
                >
                    <DrawerContent isExpanded={open} {...drawerProps} />
                </CustomDrawer>

                <Box component="main" sx={{ flexGrow: 1, mt: '52px', minWidth: 0 }}>
                    <Outlet />
                </Box>
            </Box>
        </PageActionsProvider>
    );
}
