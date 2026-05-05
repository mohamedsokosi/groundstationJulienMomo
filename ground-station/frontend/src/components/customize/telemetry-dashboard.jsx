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

import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Container,
    Grid,
    Card,
    CardContent,
    Typography,
    Paper,
    Button,
    CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import UploadIcon from '@mui/icons-material/Upload';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    ComposedChart,
    Bar,
} from 'recharts';
import {
    MapContainer,
    TileLayer,
    Polyline,
    CircleMarker,
} from 'react-leaflet';
import L from 'leaflet';
import { useTheme } from '@mui/material/styles';
import { TelemetrySummary } from './telemetry-components.jsx';
import {
    formatTelemetryNumber,
    getTelemetryNumber,
    isTelemetryNumericHeader,
    normalizeTelemetryHeader,
    toTelemetryNumber,
} from './telemetry-utils.js';

// Fix leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});

const parseCSV = (text) => {
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const headers = lines[0].split(',').map(header => header.trim());

    return lines.slice(1).map((line) => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};

        headers.forEach((header, index) => {
            const value = values[index];
            const parsedValue = isTelemetryNumericHeader(header)
                ? toTelemetryNumber(value)
                : value ?? '';
            const normalizedHeader = normalizeTelemetryHeader(header);

            obj[header] = parsedValue;
            obj[normalizedHeader] = parsedValue;
        });

        return obj;
    });
};

export default function TelemetryDashboard() {
    const { t } = useTranslation('customize');
    const theme = useTheme();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasData, setHasData] = useState(false);

    // Load sample data from public folder and stream it in real-time
    useEffect(() => {
        let isMounted = true;
        let streamInterval = null;

        const loadAndStreamData = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/telemetry.csv');
                if (response.ok) {
                    const text = await response.text();
                    const parsedData = parseCSV(text);

                    if (parsedData.length === 0) {
                        if (isMounted) {
                            setHasData(false);
                            setLoading(false);
                        }
                        return;
                    }

                    if (isMounted) {
                        setHasData(true);
                        setLoading(false);
                    }

                    // Stream data in real-time using state
                    let currentIndex = 0;
                    let streamIndex = 0;
                    const maxStreamPoints = Math.max(parsedData.length * 3, 500);

                    streamInterval = setInterval(() => {
                        if (!isMounted) return;

                        const nextPoint = {
                            ...parsedData[currentIndex],
                            streamIndex,
                        };

                        setData((previousData) => {
                            const nextData = [...previousData, nextPoint];
                            return nextData.length > maxStreamPoints
                                ? nextData.slice(nextData.length - maxStreamPoints)
                                : nextData;
                        });

                        currentIndex++;
                        streamIndex++;

                        // Loop over the CSV without clearing the already displayed stream.
                        if (currentIndex >= parsedData.length) {
                            currentIndex = 0;
                        }
                    }, 500); // 500ms interval between each row
                } else {
                    console.log('Fichier de données non trouvé.');
                    if (isMounted) setLoading(false);
                }
            } catch (error) {
                console.log('Erreur de chargement:', error);
                if (isMounted) setLoading(false);
            }
        };

        loadAndStreamData();

        // Cleanup
        return () => {
            isMounted = false;
            if (streamInterval) {
                clearInterval(streamInterval);
            }
        };
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
                    setHasData(true);
                }
            } catch (error) {
                console.error('Erreur lors de la lecture du fichier:', error);
            }
        };
        reader.readAsText(file);
    };

    // Prepare chart data with index for better display
    const chartData = useMemo(() => {
        return data.map((item, index) => ({
            ...item,
            index,
            'Time Index': item.streamIndex ?? index,
            'U_Alt': getTelemetryNumber(item, ['U_Alt', 'U Alt']),
            'Speed': getTelemetryNumber(item, 'Speed'),
            'Vert_speed': getTelemetryNumber(item, ['Vert_speed', 'Vert speed']),
            'Pressure': getTelemetryNumber(item, 'Pressure'),
            'U_Lat': getTelemetryNumber(item, ['U_Lat', 'U Lat']),
            'U_Long': getTelemetryNumber(item, ['U_Long', 'U Long']),
            '#_Sat': getTelemetryNumber(item, ['#_Sat', '#Sat']),
        }));
    }, [data]);

    // Calculate map bounds
    const mapBounds = useMemo(() => {
        if (chartData.length === 0) return [[48.5, -81.4], [48.6, -81.3]];

        const lats = chartData
            .map(point => toTelemetryNumber(point['U_Lat'], null))
            .filter(value => value !== null);
        const lons = chartData
            .map(point => toTelemetryNumber(point['U_Long'], null))
            .filter(value => value !== null);

        if (lats.length === 0 || lons.length === 0) {
            return [[48.5, -81.4], [48.6, -81.3]];
        }

        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        // Add padding
        const latPadding = (maxLat - minLat) * 0.1 || 0.01;
        const lonPadding = (maxLon - minLon) * 0.1 || 0.01;

        return [
            [minLat - latPadding, minLon - lonPadding],
            [maxLat + latPadding, maxLon + lonPadding],
        ];
    }, [chartData]);

    const centerPoint = useMemo(() => {
        if (chartData.length === 0) return [48.55, -81.35];
        const lats = chartData
            .map(point => toTelemetryNumber(point['U_Lat'], null))
            .filter(value => value !== null);
        const lons = chartData
            .map(point => toTelemetryNumber(point['U_Long'], null))
            .filter(value => value !== null);

        if (lats.length === 0 || lons.length === 0) {
            return [48.55, -81.35];
        }

        return [
            lats.reduce((a, b) => a + b, 0) / lats.length,
            lons.reduce((a, b) => a + b, 0) / lons.length,
        ];
    }, [chartData]);

    const trajectoryPoints = useMemo(() => {
        return chartData
            .map(point => [
                toTelemetryNumber(point['U_Lat'], null),
                toTelemetryNumber(point['U_Long'], null),
            ])
            .filter(([lat, lon]) => lat !== null && lon !== null);
    }, [chartData]);

    const isDark = theme.palette.mode === 'dark';
    const chartColor = isDark ? '#90caf9' : '#1976d2';
    const altitudeColor = isDark ? '#81c784' : '#388e3c';
    const speedColor = isDark ? '#ffb74d' : '#f57c00';
    const vertSpeedColor = isDark ? '#e57373' : '#d32f2f';

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <CircularProgress />
            </Container>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ mb: 2 }}>
                    Tableau de bord de télémétrie CubeSat
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Visualisez les données de trajectoire et de performance du satellite ICARUS2
                </Typography>

                {!hasData && (
                    <Button
                        variant="contained"
                        component="label"
                        startIcon={<UploadIcon />}
                        sx={{ mb: 2 }}
                    >
                        Charger un fichier CSV
                        <input
                            type="file"
                            accept=".csv"
                            hidden
                            onChange={handleFileUpload}
                        />
                    </Button>
                )}
            </Box>

            {chartData.length > 0 && (
                <Grid container spacing={4} sx={{ mt: 2 }}>
                    {/* Carte de la trajectoire */}
                    <Grid item xs={12}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2 }}>
                                    🗺️ Trajectoire du satellite
                                </Typography>
                                <Box sx={{ height: 350, borderRadius: 1, overflow: 'hidden' }}>
                                    <MapContainer
                                        bounds={mapBounds}
                                        style={{ height: '100%', width: '100%' }}
                                    >
                                        <TileLayer
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            attribution='&copy; OpenStreetMap contributors'
                                        />
                                        {trajectoryPoints.length > 0 && (
                                            <Polyline
                                                positions={trajectoryPoints}
                                                color={chartColor}
                                                weight={3}
                                                opacity={0.8}
                                            />
                                        )}
                                        {chartData.length > 0 && (
                                            <>
                                                <CircleMarker
                                                    center={[chartData[0]['U_Lat'], chartData[0]['U_Long']]}
                                                    radius={8}
                                                    color="green"
                                                    fill
                                                    fillColor="green"
                                                    fillOpacity={0.7}
                                                >
                                                </CircleMarker>
                                                <CircleMarker
                                                    center={[chartData[chartData.length - 1]['U_Lat'], chartData[chartData.length - 1]['U_Long']]}
                                                    radius={8}
                                                    color="red"
                                                    fill
                                                    fillColor="red"
                                                    fillOpacity={0.7}
                                                >
                                                </CircleMarker>
                                            </>
                                        )}
                                    </MapContainer>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Graphique Altitude vs Temps */}
                    <Grid item xs={12} md={6} lg={5}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2 }}>
                                    📈 Altitude vs Temps
                                </Typography>
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorAlt" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={altitudeColor} stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor={altitudeColor} stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#444' : '#ccc'} />
                                        <XAxis 
                                            dataKey="Time Index" 
                                            stroke={isDark ? '#aaa' : '#666'}
                                            label={{ value: 'Points de données', position: 'insideBottomRight', offset: -5 }}
                                        />
                                        <YAxis 
                                            stroke={isDark ? '#aaa' : '#666'}
                                            label={{ value: 'Altitude (m)', angle: -90, position: 'insideLeft' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: isDark ? '#333' : '#fff',
                                                border: `1px solid ${isDark ? '#555' : '#ccc'}`,
                                                color: isDark ? '#fff' : '#000'
                                            }}
                                            formatter={(value) => formatTelemetryNumber(value, 1, 'm')}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="U_Alt" 
                                            stroke={altitudeColor} 
                                            fillOpacity={1} 
                                            fill="url(#colorAlt)"
                                            name="Altitude"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Graphique Vitesse vs Temps */}
                    <Grid item xs={12} md={6} lg={5}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2 }}>
                                    ⚡ Vitesse vs Temps
                                </Typography>
                                <ResponsiveContainer width="100%" height={300}>
                                    <ComposedChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#444' : '#ccc'} />
                                        <XAxis 
                                            dataKey="Time Index" 
                                            stroke={isDark ? '#aaa' : '#666'}
                                        />
                                        <YAxis 
                                            stroke={isDark ? '#aaa' : '#666'}
                                            label={{ value: 'Vitesse (m/s)', angle: -90, position: 'insideLeft' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: isDark ? '#333' : '#fff',
                                                border: `1px solid ${isDark ? '#555' : '#ccc'}`,
                                                color: isDark ? '#fff' : '#000'
                                            }}
                                            formatter={(value) => formatTelemetryNumber(value, 2, 'm/s')}
                                        />
                                        <Legend />
                                        <Line 
                                            type="monotone" 
                                            dataKey="Speed" 
                                            stroke={speedColor} 
                                            dot={false}
                                            name="Vitesse horizontale"
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="Vert_speed" 
                                            stroke={vertSpeedColor} 
                                            dot={false}
                                            strokeDasharray="5 5"
                                            name="Vitesse verticale"
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Graphique Pression vs Altitude */}
                    <Grid item xs={12} md={6} lg={5}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2 }}>
                                    💨 Pression vs Altitude
                                </Typography>
                                <ResponsiveContainer width="100%" height={300}>
                                    <ScatterChart
                                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#444' : '#ccc'} />
                                        <XAxis 
                                            dataKey="U_Alt" 
                                            type="number"
                                            stroke={isDark ? '#aaa' : '#666'}
                                            label={{ value: 'Altitude (m)', position: 'insideBottomRight', offset: -5 }}
                                        />
                                        <YAxis 
                                            dataKey="Pressure"
                                            stroke={isDark ? '#aaa' : '#666'}
                                            label={{ value: 'Pression (hPa)', angle: -90, position: 'insideLeft' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: isDark ? '#333' : '#fff',
                                                border: `1px solid ${isDark ? '#555' : '#ccc'}`,
                                                color: isDark ? '#fff' : '#000'
                                            }}
                                            cursor={{ strokeDasharray: '3 3' }}
                                        />
                                        <Scatter 
                                            name="Données" 
                                            data={chartData} 
                                            fill={chartColor}
                                            opacity={0.6}
                                        />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Graphique Satellites visibles vs Temps */}
                    <Grid item xs={12} md={6} lg={5}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2 }}>
                                    🛰️ Satellites visibles vs Temps
                                </Typography>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#444' : '#ccc'} />
                                        <XAxis 
                                            dataKey="Time Index" 
                                            stroke={isDark ? '#aaa' : '#666'}
                                        />
                                        <YAxis 
                                            stroke={isDark ? '#aaa' : '#666'}
                                            label={{ value: 'Nombre de satellites', angle: -90, position: 'insideLeft' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: isDark ? '#333' : '#fff',
                                                border: `1px solid ${isDark ? '#555' : '#ccc'}`,
                                                color: isDark ? '#fff' : '#000'
                                            }}
                                            formatter={(value) => formatTelemetryNumber(value, 0, 'satellites')}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="#_Sat" 
                                            stroke={chartColor}
                                            dot={false}
                                            strokeWidth={2}
                                            name="Nombre de satellites GPS"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Statistiques */}
                    <Grid item xs={12}>
                        <TelemetrySummary data={chartData} />
                    </Grid>
                </Grid>
            )}

            {!hasData && !loading && (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        Aucune donnée. Chargez un fichier CSV pour commencer.
                    </Typography>
                </Paper>
            )}
        </Container>
    );
}
