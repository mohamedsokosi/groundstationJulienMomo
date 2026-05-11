import React from 'react';
import { getTelemetryNumber } from './telemetry-utils.js';
import { getMqttSourceStat } from './telemetry-utils.js';

export function TelemetryStatsBar({ currentRecord, distance, mqttStatus }) {
    const altitude = getTelemetryNumber(currentRecord, ['U_Alt', 'U Alt'], 0);
    const speed = getTelemetryNumber(currentRecord, 'Speed', 0);
    const satellites = getTelemetryNumber(currentRecord, ['#_Sat', '#Sat'], 0);
    const pressure = getTelemetryNumber(currentRecord, 'Pressure', 0);
    const stats = [
        { label: 'ALTITUDE', value: `${altitude.toFixed(0)} m`,   tone: 'altitude'   },
        { label: 'DISTANCE', value: `${distance.toFixed(4)} km`,   tone: 'distance'   },
        { label: 'VITESSE',  value: `${speed.toFixed(2)} m/s`,     tone: 'speed'      },
        { label: 'GPS SAT',  value: satellites.toFixed(0),          tone: 'satellites' },
        { label: 'PRESSION', value: `${pressure.toFixed(1)} hPa`,  tone: 'pressure'   },
        { label: 'STATUS',   value: 'NOMINAL', status: true,        tone: 'success'    },
        getMqttSourceStat(mqttStatus),
    ];
    return (
        <section className="gs-stats-bar" aria-label="Resume telemetrie">
            {stats.map((stat) => (
                <article
                    className={[
                        'gs-stat-card',
                        stat.tone        ? `gs-stat-tone-${stat.tone}`            : '',
                        stat.status      ? 'gs-stat-status'                       : '',
                        stat.sourceState ? `gs-stat-source is-${stat.sourceState}` : '',
                    ].filter(Boolean).join(' ')}
                    key={stat.label}
                >
                    <span className="gs-stat-label">{stat.label}</span>
                    <span className="gs-stat-value">{stat.value}</span>
                    {stat.detail && <span className="gs-stat-detail">{stat.detail}</span>}
                </article>
            ))}
        </section>
    );
}
