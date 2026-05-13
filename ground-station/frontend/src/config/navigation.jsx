import PublicIcon from '@mui/icons-material/Public';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import InsightsIcon from '@mui/icons-material/Insights';
import SummarizeIcon from '@mui/icons-material/Summarize';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import i18n from '../i18n/config.js';

export const getNavigation = () => [
    {
        segment: 'station',
        title: 'Station',
        icon: <SettingsInputAntennaIcon />,
    },
    {
        kind: 'header',
        title: i18n.t('settings', { ns: 'navigation' }),
    },
    {
        segment: 'vueGlobe3d',
        title: 'Vue Globe 3D',
        icon: <PublicIcon />,
    },
    {
        segment: 'cubesat',
        title: 'CubeSat',
        icon: <SatelliteAltIcon />,
    },
    {
        segment: 'analyse',
        title: 'Analyse',
        icon: <InsightsIcon />,
    },
    {
        segment: 'rapport',
        title: 'Rapport',
        icon: <SummarizeIcon />,
    },
];
