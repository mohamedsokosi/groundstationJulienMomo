import PublicIcon from '@mui/icons-material/Public';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import InsightsIcon from '@mui/icons-material/Insights';
import SummarizeIcon from '@mui/icons-material/Summarize';
import SatelliteAltOutlinedIcon from '@mui/icons-material/SatelliteAltOutlined';
import i18n from '../i18n/config.js';

export const getNavigation = () => [
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
    {
        segment: 'station',
        title: 'Station',
        icon: <SatelliteAltOutlinedIcon />,
    },
];
