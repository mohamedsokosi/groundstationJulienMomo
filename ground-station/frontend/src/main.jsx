import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from './store.jsx';
import App from './App.jsx';
import Layout from './layout.jsx';
import ErrorPage from './error-page.jsx';
import TelemetryDashboard from './pages/telemetry-dashboard.jsx';
import CubeSatDashboard from './pages/cubesat-dashboard.jsx';
import AnalyseDashboard from './pages/analyse-dashboard.jsx';
import RapportDashboard from './pages/rapport-dashboard.jsx';
import StationDashboard from './pages/station-dashboard.jsx';

const router = createBrowserRouter([
    {
        Component: App,
        children: [
            {
                path: '/',
                Component: Layout,
                children: [
                    { index: true, element: <Navigate to="/station" replace /> },
                    { path: 'vueGlobe3d', errorElement: <ErrorPage />, Component: TelemetryDashboard },
                    { path: 'cubesat',    Component: CubeSatDashboard },
                    { path: 'analyse',   Component: AnalyseDashboard },
                    { path: 'rapport',   Component: RapportDashboard },
                    { path: 'station',   Component: StationDashboard },
                ],
            },
        ],
    },
]);

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ReduxProvider store={store}>
            <RouterProvider router={router} />
        </ReduxProvider>
    </StrictMode>
);
