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

import React from 'react';
import { Grid, Card, CardContent, Typography, Box, Paper } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { getTelemetryNumber } from './telemetry-utils.js';

/**
 * Component to display telemetry statistics in a card format
 * Reusable for other components that need to display key metrics
 */
export function StatisticCard({ label, value, color, icon: Icon = null }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Paper
            sx={{
                p: 2.5,
                textAlign: 'center',
                backgroundColor: isDark ? 'rgba(33, 150, 243, 0.05)' : 'rgba(33, 150, 243, 0.1)',
                borderLeft: `5px solid ${color}`,
                borderRadius: 1,
                transition: 'all 0.3s ease',
                '&:hover': {
                    boxShadow: theme.shadows[4],
                    backgroundColor: isDark ? 'rgba(33, 150, 243, 0.1)' : 'rgba(33, 150, 243, 0.15)',
                },
            }}
        >
            {Icon && (
                <Box sx={{ mb: 1, display: 'flex', justifyContent: 'center' }}>
                    <Icon sx={{ fontSize: 32, color }} />
                </Box>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {label}
            </Typography>
            <Typography 
                variant="h6" 
                sx={{ 
                    color, 
                    fontWeight: 700,
                    fontSize: '1.25rem',
                }}
            >
                {value}
            </Typography>
        </Paper>
    );
}

/**
 * Component to display a chart card with title
 * Reusable for other components that display charts
 */
export function ChartCard({ title, children, subtitle = null }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Card
            sx={{
                height: '100%',
                backgroundColor: isDark ? 'rgb(33, 33, 33)' : 'rgb(245, 245, 245)',
                boxShadow: theme.shadows[2],
                '&:hover': {
                    boxShadow: theme.shadows[4],
                },
                transition: 'all 0.3s ease',
            }}
        >
            <CardContent>
                <Typography variant="h6" sx={{ mb: 0.5, fontWeight: 600 }}>
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                        {subtitle}
                    </Typography>
                )}
                <Box sx={{ mt: 2 }}>
                    {children}
                </Box>
            </CardContent>
        </Card>
    );
}

/**
 * Component to display telemetry data summary
 * Can be reused in different pages
 */
export function TelemetrySummary({ data = [] }) {
    const theme = useTheme();

    if (data.length === 0) {
        return (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">
                    No data available
                </Typography>
            </Paper>
        );
    }

    // Calculate statistics
    const altitudes = data.map(item => getTelemetryNumber(item, ['U_Alt', 'U Alt'])).filter(value => value > 0);
    const speeds = data.map(item => getTelemetryNumber(item, 'Speed'));
    const pressures = data.map(item => getTelemetryNumber(item, 'Pressure')).filter(value => value > 0);
    const satellites = data.map(item => getTelemetryNumber(item, ['#_Sat', '#Sat']));

    const stats = {
        maxAltitude: altitudes.length > 0 ? Math.max(...altitudes) : 0,
        maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
        minPressure: pressures.length > 0 ? Math.min(...pressures) : 0,
        avgSatellites: satellites.length > 0 ? satellites.reduce((a, b) => a + b, 0) / satellites.length : 0,
        dataPoints: data.length,
    };

    return (
        <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={2.4}>
                <StatisticCard 
                    label="Altitude Max"
                    value={`${stats.maxAltitude.toFixed(0)} m`}
                    color="#4CAF50"
                />
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
                <StatisticCard 
                    label="Max Speed"
                    value={`${stats.maxSpeed.toFixed(2)} m/s`}
                    color="#FF9800"
                />
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
                <StatisticCard 
                    label="Min Pressure"
                    value={`${stats.minPressure.toFixed(1)} hPa`}
                    color="#2196F3"
                />
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
                <StatisticCard 
                    label="Avg Satellites"
                    value={`${stats.avgSatellites.toFixed(1)}`}
                    color="#9C27B0"
                />
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
                <StatisticCard 
                    label="Data Points"
                    value={`${stats.dataPoints}`}
                    color="#F44336"
                />
            </Grid>
        </Grid>
    );
}
