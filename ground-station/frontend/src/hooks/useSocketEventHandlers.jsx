import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from '../utils/toast-with-timestamp.jsx';
import { useTranslation } from 'react-i18next';
import SyncIcon from '@mui/icons-material/Sync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
    setConnected,
    setConnecting,
    setInitialDataLoading,
    setInitialDataProgress,
    setReConnectAttempt,
} from '../layout/dashboard-slice.jsx';
import { initializeAppData } from '../services/data-sync.js';

const ToastMessage = ({ title, body }) => (
    <div>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{title}</div>
        {body && <div style={{ fontSize: '13px', opacity: 0.9 }}>{body}</div>}
    </div>
);

export const useSocketEventHandlers = (socket) => {
    const { t } = useTranslation('common');
    const dispatch = useDispatch();

    useEffect(() => {
        if (!socket) return;

        socket.on('connect', async () => {
            dispatch(setConnecting(false));
            dispatch(setConnected(true));
            dispatch(setInitialDataLoading(true));
            dispatch(setInitialDataProgress({ completed: 0, total: 0 }));
            await initializeAppData(socket);
        });

        socket.on('reconnect_attempt', (attempt) => {
            dispatch(setReConnectAttempt(attempt));
            toast.info(
                <ToastMessage
                    title={t('notifications.connection.reconnecting_to_backend')}
                    body={t('notifications.connection.attempt', { attempt })}
                />,
                { icon: () => <SyncIcon /> }
            );
        });

        socket.on('error', (error) => {
            toast.error(
                <ToastMessage
                    title={t('notifications.connection.connection_error')}
                    body={error}
                />,
                { icon: () => <ErrorOutlineIcon /> }
            );
        });

        socket.on('disconnect', () => {
            dispatch(setConnecting(true));
            dispatch(setConnected(false));
            dispatch(setInitialDataLoading(false));
        });

        return () => {
            socket.off('connect');
            socket.off('reconnect_attempt');
            socket.off('error');
            socket.off('disconnect');
        };
    }, [socket, dispatch, t]);
};
