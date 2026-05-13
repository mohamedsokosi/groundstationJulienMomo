import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEN from './locales/en/common.json';
import navigationEN from './locales/en/navigation.json';
import dashboardEN from './locales/en/dashboard.json';

import commonEL from './locales/el/common.json';
import navigationEL from './locales/el/navigation.json';
import dashboardEL from './locales/el/dashboard.json';

import commonFR from './locales/fr/common.json';
import navigationFR from './locales/fr/navigation.json';
import dashboardFR from './locales/fr/dashboard.json';

import commonES from './locales/es/common.json';
import navigationES from './locales/es/navigation.json';
import dashboardES from './locales/es/dashboard.json';

import commonDE from './locales/de/common.json';
import navigationDE from './locales/de/navigation.json';
import dashboardDE from './locales/de/dashboard.json';

import commonNL from './locales/nl/common.json';
import navigationNL from './locales/nl/navigation.json';
import dashboardNL from './locales/nl/dashboard.json';

import commonIT from './locales/it/common.json';
import navigationIT from './locales/it/navigation.json';
import dashboardIT from './locales/it/dashboard.json';

const resources = {
    en: { common: commonEN, navigation: navigationEN, dashboard: dashboardEN },
    el: { common: commonEL, navigation: navigationEL, dashboard: dashboardEL },
    fr: { common: commonFR, navigation: navigationFR, dashboard: dashboardFR },
    es: { common: commonES, navigation: navigationES, dashboard: dashboardES },
    de: { common: commonDE, navigation: navigationDE, dashboard: dashboardDE },
    nl: { common: commonNL, navigation: navigationNL, dashboard: dashboardNL },
    it: { common: commonIT, navigation: navigationIT, dashboard: dashboardIT },
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: 'en',
        fallbackLng: 'en',
        defaultNS: 'common',
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: true,
        },
    });

export default i18n;
