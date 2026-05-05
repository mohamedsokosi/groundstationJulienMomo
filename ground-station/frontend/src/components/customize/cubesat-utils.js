import { CUBESAT_SUBSYSTEMS, TELEMETRY_FIELD_CONFIG } from './cubesat-config.js';
import {
    formatTelemetryNumber,
    getTelemetryNumber,
    getTelemetryValue,
} from './telemetry-utils.js';

export function getSubsystemById(subsystemId) {
    return CUBESAT_SUBSYSTEMS.find((subsystem) => subsystem.id === subsystemId) || CUBESAT_SUBSYSTEMS[0];
}

export function getTelemetryField(fieldId) {
    return TELEMETRY_FIELD_CONFIG[fieldId];
}

export function getFieldCurrentValue(fieldConfig, record = {}) {
    if (!fieldConfig) {
        return '--';
    }

    if (fieldConfig.kind === 'number') {
        return getTelemetryNumber(record, fieldConfig.keys, null);
    }

    return getTelemetryValue(record, fieldConfig.keys, null);
}

export function formatFieldCurrentValue(fieldConfig, record = {}) {
    const value = getFieldCurrentValue(fieldConfig, record);

    if (!fieldConfig) {
        return '--';
    }

    if (fieldConfig.kind === 'number') {
        return formatTelemetryNumber(value, fieldConfig.decimals ?? 0, fieldConfig.unit);
    }

    return fieldConfig.formatter ? fieldConfig.formatter(value) : (value || '--');
}

export function getSubsystemMetrics(subsystem, record = {}) {
    return subsystem.telemetryFieldIds.map((fieldId) => {
        const field = getTelemetryField(fieldId);
        const value = getFieldCurrentValue(field, record);

        return {
            ...field,
            value,
            displayValue: formatFieldCurrentValue(field, record),
            available: value !== null && value !== undefined && value !== '',
        };
    });
}

export function getSubsystemSummaryMetrics(subsystem, record = {}) {
    return subsystem.summaryFieldIds.map((fieldId) => {
        const field = getTelemetryField(fieldId);

        return {
            ...field,
            displayValue: formatFieldCurrentValue(field, record),
        };
    });
}

export function getSubsystemTrendSeries(subsystem, chartData = [], limit = 40) {
    const recentData = chartData.slice(-limit);

    return subsystem.chartFieldIds
        .map((fieldId) => {
            const field = getTelemetryField(fieldId);

            if (!field?.chartKey) {
                return null;
            }

            const series = recentData
                .map((point) => ({
                    time: point['Time Index'],
                    value: getTelemetryNumber(point, field.chartKey, null),
                }))
                .filter((entry) => entry.value !== null);

            if (!series.length) {
                return null;
            }

            return {
                fieldId,
                label: field.label,
                unit: field.unit,
                decimals: field.decimals,
                data: series,
            };
        })
        .filter(Boolean);
}

export function getSubsystemStatus(subsystem, latestRecord = {}) {
    switch (subsystem.statusMode) {
        case 'navigation': {
            const satCount = getTelemetryNumber(latestRecord, ['#_Sat', '#Sat'], null);

            if (satCount === null) {
                return { label: 'Awaiting telemetry', tone: 'warning' };
            }

            if (satCount >= 6) {
                return { label: 'GNSS lock nominal', tone: 'success' };
            }

            if (satCount > 0) {
                return { label: 'Acquiring satellites', tone: 'warning' };
            }

            return { label: 'No lock', tone: 'error' };
        }
        case 'sensor': {
            const pressure = getTelemetryNumber(latestRecord, 'Pressure', null);
            return pressure === null
                ? { label: 'Awaiting telemetry', tone: 'warning' }
                : { label: 'Sensor online', tone: 'info' };
        }
        case 'operational': {
            const hasMissionTime = Boolean(getTelemetryValue(latestRecord, 'm-time', ''));
            const hasFlightId = Boolean(getTelemetryValue(latestRecord, 'Flight ID', ''));

            if (hasMissionTime || hasFlightId) {
                return { label: 'Operational', tone: 'success' };
            }

            return { label: 'Awaiting telemetry', tone: 'warning' };
        }
        case 'noTelemetry':
            return { label: 'No telemetry available', tone: 'default' };
        case 'descriptive':
            return { label: 'Descriptive module', tone: 'default' };
        case 'configurable':
            return { label: 'Configurable module', tone: 'default' };
        default:
            return { label: 'Unknown', tone: 'default' };
    }
}
