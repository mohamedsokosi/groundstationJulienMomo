/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

/**
 * EXEMPLE D'UTILISATION ALTERNATIVE
 * 
 * Ce fichier montre comment créer une vue alternative du dashboard
 * en réutilisant les composants existants
 * 
 * Pour l'utiliser, remplacez l'import dans main.jsx:
 * import TelemetryDashboard from './components/customize/telemetry-dashboard-compact.jsx';
 */

import React, { useState, useEffect } from 'react';
import {
    Container,
    Grid,
    Box,
    Typography,
    Button,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import { useTheme } from '@mui/material/styles';
import { 
    TelemetryGauges, 
    TelemetryDataTable 
} from './advanced-telemetry-widgets.jsx';
import { 
    StatisticCard, 
    ChartCard, 
    TelemetrySummary 
} from './telemetry-components.jsx';

// Import Recharts
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';

const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        
        headers.forEach((header, index) => {
            const value = values[index];
            if (header.includes('Lat') || header.includes('Long') || header.includes('Alt') || 
                header.includes('Speed') || header.includes('Pressure') || header.includes('Sat')) {
                obj[header] = parseFloat(value) || 0;
            } else {
                obj[header] = value;
            }
        });
        
        return obj;
    });
};

/**
 * Vue Compacte du Dashboard
 * Plus simple et focalisée sur les graphiques clés
 */
export default function CompactTelemetryDashboard() {
    const theme = useTheme();
    const [data, setData] = useState([]);
    const isDark = theme.palette.mode === 'dark';

    useEffect(() => {
        const loadSampleData = async () => {
            try {
                const response = await fetch('/telemetry.csv');
                if (response.ok) {
                    const text = await response.text();
                    const parsedData = parseCSV(text);
                    setData(parsedData);
                }
            } catch (error) {
                console.log('Erreur de chargement:', error);
            }
        };

        loadSampleData();
    }, []);

    const handleFileUpload = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text === 'string') {
                    const parsedData = parseCSV(text);
                    setData(parsedData);
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        };
        reader.readAsText(file);
    };

    const chartData = data.map((item, idx) => ({
        ...item,
        index: idx,
        'Time Index': idx,
    }));

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ mb: 2 }}>
                    Dashboard Compacte - Télémétrie CubeSat
                </Typography>
                <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadIcon />}
                >
                    Charger CSV
                    <input
                        type="file"
                        accept=".csv"
                        hidden
                        onChange={handleFileUpload}
                    />
                </Button>
            </Box>

            {chartData.length > 0 && (
                <>
                    {/* Section Jauges */}
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12}>
                            <TelemetryGauges data={chartData} />
                        </Grid>
                    </Grid>

                    {/* Section Résumé Statistiques */}
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12}>
                            <TelemetrySummary data={chartData} />
                        </Grid>
                    </Grid>

                    {/* Section Graphiques Clés */}
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12} md={6}>
                            <ChartCard title="📈 Altitude">
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorAlt" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#81c784" stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor="#81c784" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#444' : '#ccc'} />
                                        <XAxis dataKey="Time Index" stroke={isDark ? '#aaa' : '#666'} />
                                        <YAxis stroke={isDark ? '#aaa' : '#666'} />
                                        <Tooltip contentStyle={{backgroundColor: isDark ? '#333' : '#fff'}} />
                                        <Area type="monotone" dataKey="U Alt" stroke="#81c784" fillOpacity={1} fill="url(#colorAlt)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <ChartCard title="⚡ Vitesse">
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#444' : '#ccc'} />
                                        <XAxis dataKey="Time Index" stroke={isDark ? '#aaa' : '#666'} />
                                        <YAxis stroke={isDark ? '#aaa' : '#666'} />
                                        <Tooltip contentStyle={{backgroundColor: isDark ? '#333' : '#fff'}} />
                                        <Legend />
                                        <Line type="monotone" dataKey="Speed" stroke="#ffb74d" dot={false} />
                                        <Line type="monotone" dataKey="Vert speed" stroke="#e57373" dot={false} strokeDasharray="5 5" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </Grid>
                    </Grid>

                    {/* Section Tableau Données */}
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <TelemetryDataTable data={chartData} maxRows={15} />
                        </Grid>
                    </Grid>
                </>
            )}
        </Container>
    );
}

/**
 * NOTES:
 * 
 * Cette version compacte du dashboard:
 * 
 * ✅ Réutilise 100% des composants créés
 * ✅ Affiche les 3 éléments clés: Jauges, Statistiques, Graphiques  
 * ✅ Plus rapide à charger que la version complète
 * ✅ Plus facile à maintenir
 * ✅ Respecte le thème du projet
 * 
 * Pour l'utiliser:
 * 
 * 1. Dans main.jsx, remplacez:
 *    import TelemetryDashboard from './components/customize/telemetry-dashboard.jsx';
 *    
 *    Par:
 *    import CompactTelemetryDashboard from './components/customize/telemetry-dashboard-compact.jsx';
 * 
 * 2. Puis remplacez:
 *    Component: TelemetryDashboard,
 *    
 *    Par:
 *    Component: CompactTelemetryDashboard,
 * 
 * 3. Redémarrez le serveur dev
 */
