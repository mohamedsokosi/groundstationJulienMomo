import { store } from '../shared/store.jsx';
import { fetchVersionInfo } from '../layout/version-slice.jsx';
import { fetchPreferences } from '../shared/preferences-slice.jsx';
import {
    setInitialDataLoading,
    setInitialDataProgress,
} from '../layout/dashboard-slice.jsx';

export async function initializeAppData(socket) {
    store.dispatch(setInitialDataLoading(true));
    store.dispatch(setInitialDataProgress({ completed: 0, total: 2 }));

    try {
        await store.dispatch(fetchPreferences({ socket }));
    } catch (e) {
        console.error('Failed to fetch preferences:', e);
    }
    store.dispatch(setInitialDataProgress({ completed: 1, total: 2 }));

    try {
        await store.dispatch(fetchVersionInfo());
    } catch (e) {
        console.error('Failed to fetch version:', e);
    }
    store.dispatch(setInitialDataProgress({ completed: 2, total: 2 }));
    store.dispatch(setInitialDataLoading(false));
}
