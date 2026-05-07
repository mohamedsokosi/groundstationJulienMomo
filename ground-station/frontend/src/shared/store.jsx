/* global process */

import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import preferencesReducer from './preferences-slice.jsx';
import dashboardReducer from '../layout/dashboard-slice.jsx';
import versionReducer from '../layout/version-slice.jsx';
import updateCheckReducer from '../layout/update-slice.jsx';
import telemetryReducer from '../pages/telemetry-slice.jsx';

const preferencesStateReconciler = (inboundState, originalState) => {
    if (!inboundState || !inboundState.preferences) return originalState;
    const persistedTheme = inboundState.preferences.find(pref => pref.name === 'theme');
    if (!persistedTheme) return originalState;
    return {
        ...originalState,
        preferences: originalState.preferences.map(pref =>
            pref.name === 'theme' ? { ...pref, value: persistedTheme.value } : pref
        ),
    };
};

const preferencesPersistConfig = {
    key: 'preferences',
    storage,
    stateReconciler: preferencesStateReconciler,
    whitelist: ['preferences'],
};

const dashboardPersistConfig = { key: 'dashboard', storage, whitelist: [] };
const versionPersistConfig   = { key: 'version',    storage, whitelist: [] };
const updateCheckConfig      = { key: 'updateCheck', storage, whitelist: [] };

export const store = configureStore({
    reducer: {
        preferences:  persistReducer(preferencesPersistConfig, preferencesReducer),
        dashboard:    persistReducer(dashboardPersistConfig,   dashboardReducer),
        version:      persistReducer(versionPersistConfig,     versionReducer),
        updateCheck:  persistReducer(updateCheckConfig,        updateCheckReducer),
        telemetry:    telemetryReducer,
    },
    devTools: process.env.NODE_ENV !== 'production',
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            immutableCheck:    { warnAfter: 256 },
            serializableCheck: {
                warnAfter: 256,
                ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
            },
        }),
});

export const persistor = persistStore(store);
