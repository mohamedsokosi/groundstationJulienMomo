import React from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import {
    Box,
    Chip,
    Grid,
    List,
    ListItem,
    ListItemText,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { ChartCard, StatisticCard } from '../shared/telemetry-components.jsx';
import {
    getSubsystemMetrics,
    getSubsystemStatus,
    getSubsystemSummaryMetrics,
    getSubsystemTrendSeries,
} from './cubesat-utils.js';
import { formatTelemetryNumber } from '../shared/telemetry-utils.js';

const statusToneStyles = {
    success: { color: '#2e7d32', background: 'rgba(46, 125, 50, 0.12)' },
    warning: { color: '#ed6c02', background: 'rgba(237, 108, 2, 0.12)' },
    error: { color: '#d32f2f', background: 'rgba(211, 47, 47, 0.12)' },
    info: { color: '#0288d1', background: 'rgba(2, 136, 209, 0.12)' },
    default: { color: '#6b7280', background: 'rgba(107, 114, 128, 0.12)' },
};

export default function CubeSatSubsystemPanel({
    subsystem,
    latestPoint,
    chartData,
}) {
    const theme = useTheme();

    if (!subsystem) {
        return (
            <Paper sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
                <Typography color="text.secondary">
                    Cliquez sur un sous-système pour inspecter sa télémétrie.
                </Typography>
            </Paper>
        );
    }

    const status = getSubsystemStatus(subsystem, latestPoint);
    const metrics = getSubsystemMetrics(subsystem, latestPoint);
    const summaryMetrics = getSubsystemSummaryMetrics(subsystem, latestPoint);
    const trendCharts = getSubsystemTrendSeries(subsystem, chartData);
    const toneStyle = statusToneStyles[status.tone] || statusToneStyles.default;
    const Icon = subsystem.icon;

    return (
        <Stack spacing={2.5}>
            <Paper
                sx={{
                    p: 2.5,
                    borderRadius: 2,
                    border: `1px solid ${alpha(subsystem.color, 0.26)}`,
                    backgroundColor: alpha(subsystem.color, theme.palette.mode === 'dark' ? 0.12 : 0.08),
                }}
            >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                    <Box
                        sx={{
                            width: 42,
                            height: 42,
                            borderRadius: '50%',
                            display: 'grid',
                            placeItems: 'center',
                            backgroundColor: alpha(subsystem.color, 0.18),
                            color: subsystem.color,
                        }}
                    >
                        <Icon fontSize="small" />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {subsystem.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {subsystem.description}
                        </Typography>
                    </Box>
                </Stack>

                <Chip
                    size="small"
                    label={status.label}
                    sx={{
                        color: toneStyle.color,
                        backgroundColor: toneStyle.background,
                        fontWeight: 600,
                    }}
                />

                <Typography variant="body2" sx={{ mt: 1.5 }}>
                    {subsystem.details}
                </Typography>
            </Paper>

            {summaryMetrics.length > 0 && (
                <Grid container spacing={1.5}>
                    {summaryMetrics.map((metric) => (
                        <Grid item xs={12} sm={6} key={metric.id}>
                            <StatisticCard
                                label={metric.label}
                                value={metric.displayValue}
                                color={subsystem.color}
                            />
                        </Grid>
                    ))}
                </Grid>
            )}

            {metrics.length > 0 ? (
                <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                        Live mapped fields
                    </Typography>
                    <List dense disablePadding>
                        {metrics.map((metric) => (
                            <ListItem
                                key={metric.id}
                                disableGutters
                                sx={{
                                    py: 0.7,
                                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
                                    '&:last-of-type': {
                                        borderBottom: 'none',
                                    },
                                }}
                            >
                                <ListItemText
                                    primary={metric.label}
                                    secondary={`CSV field: ${metric.sourceLabel}`}
                                    primaryTypographyProps={{ fontWeight: 600 }}
                                    secondaryTypographyProps={{ variant: 'caption' }}
                                />
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontWeight: 700,
                                        color: metric.available ? 'text.primary' : 'text.secondary',
                                    }}
                                >
                                    {metric.displayValue}
                                </Typography>
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            ) : (
                <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                        Telemetry status
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {subsystem.emptyMessage}
                    </Typography>
                </Paper>
            )}

            {trendCharts.length > 0 && (
                <Stack spacing={2}>
                    {trendCharts.map((chart) => (
                        <ChartCard
                            key={chart.fieldId}
                            title={`${chart.label} trend`}
                            subtitle={`Recent samples for ${subsystem.shortName}`}
                        >
                            <Box sx={{ height: 180 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chart.data}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.45)} />
                                        <XAxis dataKey="time" stroke={theme.palette.text.secondary} />
                                        <YAxis stroke={theme.palette.text.secondary} />
                                        <Tooltip
                                            formatter={(value) => formatTelemetryNumber(value, chart.decimals, chart.unit)}
                                            labelFormatter={(value) => `Sample ${value}`}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke={subsystem.color}
                                            strokeWidth={2.5}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Box>
                        </ChartCard>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
