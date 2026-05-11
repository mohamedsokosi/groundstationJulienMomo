import React from 'react';
import { Typography } from '@mui/material';
import { fieldLabel } from './chart-fields.js';

export function ChartTitle({ chart, sx }) {
    const x = fieldLabel(chart.xKey);
    return (
        <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2, ...sx }}>
            {chart.lines.map((l, i) => (
                <React.Fragment key={l.key}>
                    {i > 0 && <span style={{ color: 'inherit' }}>, </span>}
                    <span style={{ color: l.color }}>{fieldLabel(l.key)}</span>
                </React.Fragment>
            ))}
            {' vs '}
            {x}
        </Typography>
    );
}
