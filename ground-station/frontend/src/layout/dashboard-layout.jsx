import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PropTypes from "prop-types";
import * as React from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import {
    AppBar,
    Avatar,
    Box,
    Button,
    CssBaseline,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    MenuItem,
    MenuList,
    Toolbar,
    useTheme,
    styled,
} from "@mui/material";
import { Account, AccountPopoverFooter, AccountPreview, SignOutButton } from "@toolpad/core";
import { GroundStationLogoGreenBlue } from "../shared/dataurl-icons.jsx";
import { stringAvatar } from "../shared/common.jsx";
import Grid from "@mui/material/Grid";
import { useCallback, useEffect, useRef, useState } from "react";
import CheckIcon from '@mui/icons-material/Check';
import { useSocket } from "../shared/socket.jsx";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from 'react-i18next';
import ConnectionStatus from "./connection-popover.jsx";
import Tooltip from "@mui/material/Tooltip";
import ConnectionOverlay from "./reconnecting-overlay.jsx";
import VersionInfo from "./version-info.jsx";
import VersionUpdateOverlay from "./version-update-overlay.jsx";
import UpdateIndicator from "./update-indicator.jsx";
import { getNavigation } from "../config/navigation.jsx";
import { useUserTimeSettings } from '../hooks/useUserTimeSettings.jsx';
import { formatTime } from '../utils/date-time.js';
import { PageActionsProvider, usePageActions } from './page-actions-context.jsx';
import WakeLockStatus from "./wake-lock-icon.jsx";

const drawerWidthExpanded = 240;
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
        ...(open && { ...openedMixin(theme), '& .MuiDrawer-paper': openedMixin(theme) }),
        ...(!open && { ...closedMixin(theme), '& .MuiDrawer-paper': closedMixin(theme) }),
    }),
);

const CustomAppBar = styled(AppBar, {
    shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
    zIndex: theme.zIndex.drawer + 1,
}));

function ToolbarActions() {
    const { node } = usePageActions();
    return (
        <Stack direction="row" alignItems="center" sx={{ padding: "6px 0px 0px 0px" }}>
            {node}
            <ConnectionStatus />
            <WakeLockStatus />
            <TimeDisplay />
        </Stack>
    );
}

function CustomAppTitle() {
    return (
        <Grid container direction="row">
            <Grid row={1} column={1} sx={{ display: 'flex', alignItems: 'center' }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <Box display={{ xs: "none", sm: "block" }}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <img src={GroundStationLogoGreenBlue} alt="Ground Station" width="30" height="30" />
                            <Typography variant="h6">Ground Station</Typography>
                            <Box sx={{ display: 'none', '@media (min-width:768px)': { display: 'block' } }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <VersionInfo minimal={true} />
                                    <UpdateIndicator />
                                </Stack>
                            </Box>
                        </Box>
                    </Box>
                </Stack>
            </Grid>
        </Grid>
    );
}

function AccountSidebarPreview(props) {
    const { handleClick, open, mini } = props;
    return (
        <Stack direction="column" p={0}>
            <Divider />
            <AccountPreview variant={mini ? 'condensed' : 'expanded'} handleClick={handleClick} open={open} />
        </Stack>
    );
}

AccountSidebarPreview.propTypes = {
    handleClick: PropTypes.func,
    mini: PropTypes.bool.isRequired,
    open: PropTypes.bool,
};

const accounts = [
    { id: 1, name: 'Efstratios Goudelis', email: 'sgoudelis@nerv.home', image: null },
];

function TimeDisplay() {
    const [isUTC, setIsUTC] = React.useState(false);
    const [currentTime, setCurrentTime] = React.useState(new Date());
    const { timezone, locale } = useUserTimeSettings();

    React.useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const formattedTime = isUTC
        ? formatTime(currentTime, { timezone: 'UTC', locale, options: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } })
        : formatTime(currentTime, { timezone, locale, options: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } });

    const timeZoneAbbr = isUTC
        ? 'UTC'
        : new Intl.DateTimeFormat(locale, { timeZone: timezone, timeZoneName: 'short' })
            .formatToParts(currentTime)
            .find((part) => part.type === 'timeZoneName')?.value || timezone;

    return (
        <Box
            onClick={() => setIsUTC(!isUTC)}
            sx={{ cursor: "pointer", p: 0, paddingTop: 0.75, paddingBottom: 0, borderRadius: "4px", textAlign: "center", maxWidth: "100px", display: "flex", flexDirection: "column", alignItems: "center" }}
        >
            <Typography variant="body2" sx={{ fontSize: "0.65rem", fontWeight: "bold", fontFamily: "monospace" }}>
                {formattedTime}
            </Typography>
            <Typography variant="caption" sx={{ fontSize: "0.65rem", fontFamily: "monospace", color: "#aaa" }}>
                {isUTC ? "UTC" : timeZoneAbbr}
            </Typography>
        </Box>
    );
}

function SidebarFooterAccountPopover() {
    return (
        <Stack direction="column" sx={{ pl: '0px', pr: '0px' }}>
            <Typography variant="body2" mx={2} mt={1}>Accounts</Typography>
            <MenuList>
                {accounts.map((account) => (
                    <MenuItem key={account.id} component="button" sx={{ justifyContent: 'flex-start', width: '100%', columnGap: 2 }}>
                        <ListItemIcon>
                            <Avatar {...stringAvatar('My Name')} />
                        </ListItemIcon>
                        <ListItemText
                            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}
                            primary={account.name}
                            secondary={account.email}
                        />
                    </MenuItem>
                ))}
            </MenuList>
            <Divider />
            <AccountPopoverFooter>
                <SignOutButton />
            </AccountPopoverFooter>
        </Stack>
    );
}

function SidebarFooterAccount({ mini }) {
    const PreviewComponent = React.useMemo(() => createPreviewComponent(mini), [mini]);
    return (
        <Account
            slots={{ preview: PreviewComponent, popoverContent: SidebarFooterAccountPopover }}
            slotProps={{
                popover: {
                    transformOrigin: { horizontal: 'left', vertical: 'bottom' },
                    anchorOrigin: { horizontal: 'right', vertical: 'bottom' },
                    disableAutoFocus: true,
                    slotProps: {
                        paper: {
                            elevation: 0,
                            sx: {
                                overflow: 'visible',
                                mt: 1,
                                '&::before': {
                                    content: '""', display: 'block', position: 'absolute',
                                    bottom: 10, left: 0, width: 10, height: 10,
                                    bgcolor: 'background.paper',
                                    transform: 'translate(-50%, -50%) rotate(45deg)', zIndex: 0,
                                },
                            },
                        },
                    },
                },
            }}
        />
    );
}

SidebarFooterAccount.propTypes = { mini: PropTypes.bool.isRequired };

const createPreviewComponent = (mini) => {
    function PreviewComponent(props) {
        return <AccountSidebarPreview {...props} mini={mini} />;
    }
    return PreviewComponent;
};

export default function Layout() {
    const theme = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [navigation, setNavigation] = React.useState(getNavigation());
    const { t } = useTranslation();
    const { connected, initialDataLoading, hasVersionChanged } = useSelector((state) => ({
        connected: state.dashboard.connected,
        initialDataLoading: state.dashboard.initialDataLoading,
        hasVersionChanged: state.version.hasVersionChanged,
    }));

    React.useEffect(() => {
        setNavigation(getNavigation());
    }, [t]);

    const handleDrawerToggle = () => {
        if (window.innerWidth < 600) setMobileOpen(!mobileOpen);
        else setOpen(!open);
    };

    const handleMobileDrawerClose = () => setMobileOpen(false);

    const handleNavigation = (segment) => {
        navigate(`/${segment}`);
        if (window.innerWidth < 600) setMobileOpen(false);
    };

    const isActiveRoute = (segment) => {
        const currentPath = location.pathname.slice(1);
        if (segment === '' && currentPath === '') return true;
        if (segment && currentPath.startsWith(segment)) return true;
        return false;
    };

    const drawerContent = (isExpanded) => (
        <>
            <Toolbar />
            <Box component="nav" role="navigation" aria-label="Main navigation" sx={{ overflow: 'auto', mt: 1 }}>
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

                        const isActive = isActiveRoute(item.segment);
                        return (
                            <ListItem key={index} disablePadding sx={{ display: 'block' }}>
                                <Tooltip title={!isExpanded ? item.title : ''} placement="right" disableFocusListener disableTouchListener>
                                    <ListItemButton
                                        onClick={() => handleNavigation(item.segment)}
                                        selected={isActive}
                                        sx={{ minHeight: 40, justifyContent: isExpanded ? 'flex-start' : 'center', px: isExpanded ? 2 : 0, py: 0.75, display: 'flex', alignItems: 'center' }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 0, mr: isExpanded ? 2 : 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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

    return (
        <PageActionsProvider>
            <Box sx={{ display: 'flex', minHeight: '100vh', overflow: 'hidden' }}>
                <CssBaseline />
                <CustomAppBar position="fixed" open={open}>
                    <Toolbar>
                        <Box sx={{ flexGrow: 1 }}>
                            <CustomAppTitle />
                        </Box>
                        <ToolbarActions />
                    </Toolbar>
                </CustomAppBar>

                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleMobileDrawerClose}
                    ModalProps={{ keepMounted: true }}
                    PaperProps={{ role: 'navigation', 'aria-label': 'Mobile navigation' }}
                    sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { width: drawerWidthExpanded, boxSizing: 'border-box' } }}
                >
                    {drawerContent(true)}
                </Drawer>

                <CustomDrawer
                    variant="permanent"
                    open={open}
                    PaperProps={{ role: 'navigation', 'aria-label': 'Desktop navigation' }}
                    ModalProps={{ disableEnforceFocus: true, disableAutoFocus: true }}
                    sx={{ display: { xs: 'none', sm: 'block' }, flexShrink: 0 }}
                >
                    {drawerContent(open)}
                </CustomDrawer>

                <Box component="main" sx={{ flexGrow: 1, mt: '52px', minWidth: 0 }}>
                    {connected && !initialDataLoading ? <Outlet /> : <ConnectionOverlay />}
                    {hasVersionChanged && <VersionUpdateOverlay />}
                </Box>
            </Box>
        </PageActionsProvider>
    );
}
