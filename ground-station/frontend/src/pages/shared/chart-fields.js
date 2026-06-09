export const AVAILABLE_FIELDS = [
    { key: '_elapsed_s',   label: 'Elapsed Time (s)',       step: 100   },  // X-axis: 10 s ticks
    { key: '_elapsed_min', label: 'Elapsed Time (min)',     step: 10    },  // X-axis: 1 min ticks
    { key: 'U_Alt',        label: 'Altitude (m)',           step: 1000  },  // 290–18839 m
    { key: 'Speed',        label: 'Speed (m/s)',            step: 1     },  // 2.5–12 m/s
    { key: 'Vert_speed',   label: 'Vertical Speed (m/s)',   step: 0.5   },  // 2.0–5.9 m/s
    { key: 'Pressure',     label: 'Pressure (hPa)',         step: 20    },  // 66–979 hPa
    { key: '#_Sat',        label: 'Satellites',             step: 1     },  // 10–13
    { key: 'U_Lat',        label: 'Latitude (°)',           step: 0.05  },  // 48.499–48.568
    { key: 'U_Long',       label: 'Longitude (°)',          step: 0.05  },  // −81.559–−81.366
    { key: '_fspl',        label: 'FSPL (dB)',              step: 10    },  // ~75–111 dB
    { key: '_bilan',       label: 'Link Budget (dBm)',      step: 10    },  // ~−63–−27 dBm
    { key: '_distance',    label: 'Vertical Distance (m)',  step: 1000  },  // same as altitude
    { key: 'MIU',          label: 'MIU (V)',                step: 0.02  },  // 3.2357–3.2888 V
    { key: 'T1',           label: 'Temp. 1 (°C)',           step: 5     },  // 14–34 °C
    { key: 'T2',           label: 'Temp. 2 (°C)',           step: 5     },  // −57–12 °C (exterior)
    { key: 'T3',           label: 'Temp. 3 (°C)',           step: 5     },  // 15–36 °C
    { key: 'T4',           label: 'Temp. 4 (°C)',           step: 5     },  // −55–14 °C (exterior)
    { key: 'T5',           label: 'Temp. 5 (°C)',           step: 5     },  // −21–23 °C
    { key: 'T6',           label: 'Temp. 6 (°C)',           step: 5     },  // −59–11 °C (exterior)
    { key: 'T7',           label: 'Temp. 7 (°C)',           step: 5     },  // 16–37 °C
    { key: 'T8',           label: 'Temp. 8 (°C)',           step: 5     },  // −22–22 °C
];

export const TEMP_FIELD_KEYS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

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
