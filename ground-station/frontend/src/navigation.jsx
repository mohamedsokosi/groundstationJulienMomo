import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import PublicIcon from '@mui/icons-material/Public';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import InsightsIcon from '@mui/icons-material/Insights';
import SummarizeIcon from '@mui/icons-material/Summarize';

export const getNavigation = () => [
    { segment: 'station',    title: 'Station',       icon: <SettingsInputAntennaIcon /> },
    { kind: 'header',        title: 'Modules' },
    { segment: 'vueGlobe3d', title: 'Globe 3D',       icon: <PublicIcon /> },
    { segment: 'cubesat',    title: 'CubeSat',        icon: <SatelliteAltIcon /> },
    { segment: 'analyse',    title: 'Analysis',       icon: <InsightsIcon /> },
    { segment: 'rapport',    title: 'Report',         icon: <SummarizeIcon /> },
];
