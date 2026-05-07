import Stack from "@mui/material/Stack";
import {ThemeSwitcher} from "@toolpad/core/DashboardLayout";
import Typography from "@mui/material/Typography";
import PropTypes from "prop-types";
import Grid from "@mui/material/Grid";
import RadioIcon from '@mui/icons-material/Radio';
import LanIcon from '@mui/icons-material/Lan';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import {Avatar, Box, Button, Divider, IconButton, LinearProgress, ListItemIcon, ListItemText, MenuItem, MenuList, Popover} from "@mui/material";
import {GroundStationLogoGreenBlue} from "../shared/dataurl-icons.jsx";
import {Account, AccountPopoverFooter, AccountPreview, SignOutButton} from "@toolpad/core";
import * as React from "react";
import {stringAvatar} from "../shared/common.jsx";
import {useDispatch, useSelector} from "react-redux";
import {useSocket} from "../shared/socket.jsx";
import {useCallback, useEffect, useState} from "react";
import {setConnected, setConnecting, setConnectionError, setReConnectAttempt} from "./dashboard-slice.jsx";
import Tooltip from "@mui/material/Tooltip";
import { useTranslation } from 'react-i18next';

function ConnectionStatus() {
    const { t } = useTranslation('dashboard');
    const dispatch = useDispatch();
    const { socket, trafficStatsRef } = useSocket();
    const [anchorEl, setAnchorEl] = useState(null);
    const [, forceUpdate] = useState(0);

    const open = Boolean(anchorEl);

    useEffect(() => {
        if (!open) return; // Only update when popover is open

        const interval = setInterval(()=>{
            forceUpdate(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [open]);

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    // Memoize connection color based on transport name
    const connectionColor = React.useMemo(() => {
        const transport = trafficStatsRef.current.transport.name;
        if (transport === "websocket") return 'status.connected';
        if (transport === "polling") return 'status.polling';
        if (transport === "connecting..." || transport === "unknown") return 'status.connecting';
        if (transport === "disconnected") return 'status.disconnected';
        return 'status.disconnected';
    }, [trafficStatsRef.current.transport.name]);

    // Memoize connection tooltip
    const connectionTooltip = React.useMemo(() => {
        if (trafficStatsRef.current.transport.name === "websocket") return t('connection_popover.network_connected_ws');
        if (trafficStatsRef.current.transport.name === "polling") return t('connection_popover.network_connected_polling');
        if (trafficStatsRef.current.transport.name === 'connecting...' || trafficStatsRef.current.transport.name === "unknown") return t('connection_popover.network_connecting');
        if (trafficStatsRef.current.transport.name === "disconnected") return t('connection_popover.network_disconnected');
        return t('connection_popover.network_unknown');
    }, [trafficStatsRef.current.transport.name, t]);

    const formatBytes = useCallback((bytes) => {
        if (bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    const formatTotalBytes = useCallback((bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    const formatDuration = useCallback((milliseconds) => {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }, []);

    return (
        <>
            <Tooltip title={connectionTooltip}>
                <IconButton
                    size="small"
                    onClick={handleClick}
                    sx={{
                        width: 40,
                        color: connectionColor,
                        '&:hover': {
                            backgroundColor: 'overlay.light'
                        }
                    }}
                >
                    <LanIcon />
                </IconButton>
            </Tooltip>
            <Popover
                sx={{
                    '& .MuiPaper-root': {
                        borderRadius: 0,
                    }
                }}
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <Box sx={{
                    borderRadius: 0,
                    border: '1px solid',
                    borderColor: 'border.main',
                    p: 1,
                    minWidth: 250,
                    width: 250,
                    backgroundColor: 'background.paper',
                }}>
                    <Box sx={{ mb: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                                {t('connection_popover.transport')}
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: connectionColor }}>
                                {trafficStatsRef.current.transport.name.toUpperCase()}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">
                                {t('connection_popover.duration')}
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
                                {formatDuration(trafficStatsRef.current.session.duration)}
                            </Typography>
                        </Box>
                        {trafficStatsRef.current.manager.reconnecting && (
                            <Typography variant="caption" sx={{ color: 'status.connecting', fontFamily: 'monospace', mt: 0.5, display: 'block' }}>
                                {t('connection_popover.reconnecting', { count: trafficStatsRef.current.manager.reconnectAttempts })}
                            </Typography>
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ mb: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                                {t('connection_popover.upload')}
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#4caf50' }}>
                                {formatBytes(trafficStatsRef.current.rates.bytesPerSecond.sent)}
                                <span style={{ color: 'var(--mui-palette-text-secondary)', marginLeft: 8 }}>
                                    {trafficStatsRef.current.rates.packetsPerSecond.sent} msg/s
                                </span>
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">
                                {t('connection_popover.download')}
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#2196f3' }}>
                                {formatBytes(trafficStatsRef.current.rates.bytesPerSecond.received)}
                                <span style={{ color: 'var(--mui-palette-text-secondary)', marginLeft: 8 }}>
                                    {trafficStatsRef.current.rates.packetsPerSecond.received} msg/s
                                </span>
                            </Typography>
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ mb: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                                {t('connection_popover.sent')}
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#4caf50' }}>
                                {formatTotalBytes(trafficStatsRef.current.engine.bytesSent)}
                                <span style={{ color: 'var(--mui-palette-text-secondary)', marginLeft: 8 }}>
                                    {trafficStatsRef.current.engine.packetsSent} msgs
                                </span>
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">
                                {t('connection_popover.received')}
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#2196f3' }}>
                                {formatTotalBytes(trafficStatsRef.current.engine.bytesReceived)}
                                <span style={{ color: 'var(--mui-palette-text-secondary)', marginLeft: 8 }}>
                                    {trafficStatsRef.current.engine.packetsReceived} msgs
                                </span>
                            </Typography>
                        </Box>
                        {trafficStatsRef.current.engine.upgradeAttempts > 0 && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.transport_upgrades')}
                                </Typography>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
                                    {trafficStatsRef.current.engine.upgradeAttempts}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                </Box>
            </Popover>
        </>
    );
}

export default ConnectionStatus;