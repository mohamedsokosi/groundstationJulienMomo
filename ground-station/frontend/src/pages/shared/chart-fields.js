export const AVAILABLE_FIELDS = [
    { key: '_elapsed_s',   label: 'Elapsed Time (s)',        step: 10    },
    { key: '_elapsed_min', label: 'Elapsed Time (min)',     step: 1     },
    { key: 'U_Alt',        label: 'Altitude (m)',           step: 10000 },
    { key: 'Speed',        label: 'Speed (m/s)',            step: 100   },
    { key: 'Vert_speed',   label: 'Vertical Speed (m/s)',   step: 10    },
    { key: 'Pressure',     label: 'Pressure (hPa)',         step: 100   },
    { key: '#_Sat',        label: 'Satellites',             step: 10    },
    { key: 'U_Lat',        label: 'Latitude (°)',           step: 1     },
    { key: 'U_Long',       label: 'Longitude (°)',          step: 1     },
    { key: '_fspl',        label: 'FSPL (dB)',              step: 100   },
    { key: '_bilan',       label: 'Link Budget (dBm)',       step: 100   },
    { key: '_distance',    label: 'Vertical Distance (m)',  step: 10000 },
    { key: 'MIU',          label: 'MIU (V)',                step: 1     },
    { key: 'T1',           label: 'Temp. 1 (°C)',           step: 10    },
    { key: 'T2',           label: 'Temp. 2 (°C)',           step: 10    },
    { key: 'T3',           label: 'Temp. 3 (°C)',           step: 10    },
    { key: 'T4',           label: 'Temp. 4 (°C)',           step: 10    },
    { key: 'T5',           label: 'Temp. 5 (°C)',           step: 10    },
    { key: 'T6',           label: 'Temp. 6 (°C)',           step: 10    },
    { key: 'T7',           label: 'Temp. 7 (°C)',           step: 10    },
    { key: 'T8',           label: 'Temp. 8 (°C)',           step: 10    },
];

export const CHART_COLORS = ['#4cbc74', '#ee8a22', '#4fb7d6', '#d2b04c', '#8797ab', '#2e9f69'];

export function fieldLabel(key) {
    return AVAILABLE_FIELDS.find((f) => f.key === key)?.label || key;
}

export function fieldUnit(key) {
    const m = fieldLabel(key).match(/\(([^)]+)\)$/);
    return m ? m[1] : '';
}

export function fieldStep(key) {
    return AVAILABLE_FIELDS.find((f) => f.key === key)?.step ?? 100;
}
