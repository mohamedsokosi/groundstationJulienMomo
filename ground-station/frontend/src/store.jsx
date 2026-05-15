import { configureStore } from '@reduxjs/toolkit';
import telemetryReducer from './pages/shared/telemetry-slice.jsx';

export const store = configureStore({
    reducer: {
        telemetry: telemetryReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            immutableCheck:    { warnAfter: 256 },
            serializableCheck: { warnAfter: 256 },
        }),
});
