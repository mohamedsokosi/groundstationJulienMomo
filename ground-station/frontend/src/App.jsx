import * as React from 'react';
import { Outlet } from 'react-router';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { setupTheme } from './theme.js';

const theme = setupTheme('dark');

export default function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Outlet />
        </ThemeProvider>
    );
}
