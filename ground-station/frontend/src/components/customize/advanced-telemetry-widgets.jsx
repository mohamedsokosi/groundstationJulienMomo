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
 * Advanced Example Component
 * Shows how to reuse existing components from the Ground Station
 * This demonstrates best practices for integrating new features
 */

import React, { useState, useMemo } from 'react';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    ToggleButton,
    ToggleButtonGroup,
} from '@mui/material';
import { Gauge, GaugeContainer, GaugeValueArc, GaugeReferenceArc } from '@mui/x-charts/Gauge';
import { useTheme } from '@mui/material/styles';
import ScaleIcon from '@mui/icons-material/Scale';
import AirIcon from '@mui/icons-material/Air';
import SpeedIcon from '@mui/icons-material/Speed';
import {
    formatTelemetryNumber,
    getTelemetryNumber,
    getTelemetryValue,
} from './telemetry-utils.js';

/**
 * Component that reuses MUI X-Charts Gauge from existing project
 * Shows real-time telemetry data like altitude, pressure, speed
 */
export function TelemetryGauges({ data = [] }) {
    const theme = useTheme();
    const [gaugeType, setGaugeType] = useState('altitude');

    const stats = useMemo(() => {
        if (data.length === 0) {
            return {
                currentAltitude: 0,
                currentSpeed: 0,
                currentPressure: 1013.25,
                maxAltitude: 0,
            };
        }

        const lastPoint = data[data.length - 1];
        const altitudes = data.map(item => getTelemetryNumber(item, ['U_Alt', 'U Alt']));

        return {
            currentAltitude: getTelemetryNumber(lastPoint, ['U_Alt', 'U Alt']),
            currentSpeed: getTelemetryNumber(lastPoint, 'Speed'),
            currentPressure: getTelemetryNumber(lastPoint, 'Pressure', 1013.25),
            maxAltitude: Math.max(...altitudes),
        };
    }, [data]);

    const altitudePercent = (stats.currentAltitude / stats.maxAltitude) * 100 || 0;
    const pressurePercent = (stats.currentPressure / 1013.25) * 100;
    const speedPercent = (stats.currentSpeed / 150) * 100; // Assuming max 150 m/s

    return (
        <Card sx={{ mb: 2 }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                        Jauges de Télémétrie
                    </Typography>
                    <ToggleButtonGroup
                        value={gaugeType}
                        exclusive
                        onChange={(e, newType) => newType && setGaugeType(newType)}
                        size="small"
                    >
                        <ToggleButton value="altitude">
                            <ScaleIcon sx={{ mr: 1 }} /> Alt
                        </ToggleButton>
                        <ToggleButton value="pressure">
                            <AirIcon sx={{ mr: 1 }} /> Press
                        </ToggleButton>
                        <ToggleButton value="speed">
                            <SpeedIcon sx={{ mr: 1 }} /> Vit
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    {gaugeType === 'altitude' && (
                        <Box sx={{ position: 'relative', width: 250, height: 250 }}>
                            <GaugeContainer width={250} height={250} startAngle={-110} endAngle={110} value={altitudePercent}>
                                <GaugeReferenceArc valueMin={0} valueMax={100} />
                                <GaugeValueArc valueMin={0} valueMax={100} />
                            </GaugeContainer>
                            <Box sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                textAlign: 'center',
                                zIndex: 1,
                            }}>
                                <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
                                    {stats.currentAltitude.toFixed(0)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    mètres
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {gaugeType === 'pressure' && (
                        <Box sx={{ position: 'relative', width: 250, height: 250 }}>
                            <GaugeContainer width={250} height={250} startAngle={-110} endAngle={110} value={pressurePercent}>
                                <GaugeReferenceArc valueMin={0} valueMax={100} />
                                <GaugeValueArc valueMin={0} valueMax={100} color={theme.palette.info.main} />
                            </GaugeContainer>
                            <Box sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                textAlign: 'center',
                                zIndex: 1,
                            }}>
                                <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
                                    {stats.currentPressure.toFixed(1)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    hPa
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {gaugeType === 'speed' && (
                        <Box sx={{ position: 'relative', width: 250, height: 250 }}>
                            <GaugeContainer width={250} height={250} startAngle={-110} endAngle={110} value={speedPercent}>
                                <GaugeReferenceArc valueMin={0} valueMax={100} />
                                <GaugeValueArc valueMin={0} valueMax={100} color={theme.palette.success.main} />
                            </GaugeContainer>
                            <Box sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                textAlign: 'center',
                                zIndex: 1,
                            }}>
                                <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
                                    {stats.currentSpeed.toFixed(2)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    m/s
                                </Typography>
                            </Box>
                        </Box>
                    )}
                </Box>

                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                        <Box sx={{ p: 1.5, backgroundColor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                Altitude maximale
                            </Typography>
                            <Typography variant="h6">
                                {stats.maxAltitude.toFixed(0)} m
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={6}>
                        <Box sx={{ p: 1.5, backgroundColor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                Vitesse actuelle
                            </Typography>
                            <Typography variant="h6">
                                {stats.currentSpeed.toFixed(2)} m/s
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
}

/**
 * Component that shows data table with sortable columns
 * Reuses DataGrid from existing project (@mui/x-data-grid)
 */
export function TelemetryDataTable({ data = [], maxRows = 20 }) {
    const displayData = data.slice(-maxRows);

    return (
        <Card>
            <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Derniers Points de Données
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.875rem',
                    }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.12)' }}>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Temps</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Altitude (m)</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Vitesse (m/s)</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Latitude</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Longitude</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Pression (hPa)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayData.map((item, idx) => (
                                <tr 
                                    key={idx} 
                                    style={{
                                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                                        backgroundColor: idx % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
                                    }}
                                >
                                    <td style={{ padding: '8px 12px' }}>{getTelemetryValue(item, 'm-time', '--')}</td>
                                    <td style={{ padding: '8px 12px' }}>{formatTelemetryNumber(getTelemetryNumber(item, ['U_Alt', 'U Alt'], null), 1)}</td>
                                    <td style={{ padding: '8px 12px' }}>{formatTelemetryNumber(getTelemetryNumber(item, 'Speed', null), 2)}</td>
                                    <td style={{ padding: '8px 12px' }}>{formatTelemetryNumber(getTelemetryNumber(item, ['U_Lat', 'U Lat'], null), 5)}</td>
                                    <td style={{ padding: '8px 12px' }}>{formatTelemetryNumber(getTelemetryNumber(item, ['U_Long', 'U Long'], null), 5)}</td>
                                    <td style={{ padding: '8px 12px' }}>{formatTelemetryNumber(getTelemetryNumber(item, 'Pressure', null), 2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Box>
            </CardContent>
        </Card>
    );
}
