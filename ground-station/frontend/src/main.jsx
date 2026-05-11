import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/config.js'
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import App from "./App.jsx";
import Layout from "./layout/dashboard-layout.jsx";
import ErrorPage from './shared/error-page.jsx';
import TelemetryDashboard from "./pages/telemetry-dashboard.jsx";
import CubeSatDashboard from "./pages/cubesat-dashboard.jsx";
import AnalyseDashboard from "./pages/analyse-dashboard.jsx";
import RapportDashboard from "./pages/rapport-dashboard.jsx";
import StationDashboard from "./pages/station-dashboard.jsx";
import { SocketProvider } from './shared/socket.jsx';
import { Provider as ReduxProvider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './shared/store.jsx';
import { WakeLockProvider } from "./layout/wake-lock-provider.jsx";
const router = createBrowserRouter([
    {
        Component: App,
        children: [
            {
                path: "/",
                Component: Layout,
                children: [
                    {
                        index: true,
                        element: <Navigate to="/vueGlobe3d" replace />,
                    },
                    {
                        path: "vueGlobe3d",
                        errorElement: <ErrorPage />,
                        Component: TelemetryDashboard,
                    },
                    {
                        path: "cubesat",
                        Component: CubeSatDashboard,
                    },
                    {
                        path: "analyse",
                        Component: AnalyseDashboard,
                    },
                    {
                        path: "rapport",
                        Component: RapportDashboard,
                    },
                    {
                        path: "station",
                        Component: StationDashboard,
                    },
                ],
            },
        ],
    },
]);

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ReduxProvider store={store}>
            <PersistGate loading={null} persistor={persistor}>
                <SocketProvider>
                    <WakeLockProvider>
                        <RouterProvider router={router} />
                    </WakeLockProvider>
                </SocketProvider>
            </PersistGate>
        </ReduxProvider>
    </StrictMode>
);
