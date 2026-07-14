const darkTheme = {
    mode: 'dark',
    primary: { main: '#26a9a0' },   // teal — primary accent
    secondary: { main: '#c8763c' }, // orange
    success: { main: '#4caf50' },   // green
    warning: { main: '#f5a623' },   // amber
    error: { main: '#e5433b' },     // red
    info: { main: '#b08cf0' },      // violet
    text: {
        primary: '#e7eaed',
        secondary: '#9aa1ab',
        disabled: '#5d646e',
    },
    background: {
        default: '#15181d',
        paper: '#1c1f26',
        elevated: '#23272f',
        titleBar: '#1c1f26',
    },
    border: {
        main: '#33383f',
        light: '#3e444c',
        dark: '#23272f',
    },
    overlay: {
        light: 'rgba(38, 169, 160, 0.08)',
        medium: 'rgba(38, 169, 160, 0.15)',
        dark: 'rgba(0, 0, 0, 0.6)',
    },
    status: {
        connected: '#4caf50',
        connecting: '#f5a623',
        disconnected: '#e5433b',
        polling: '#c8763c',
    },
    action: {
        play: '#4caf50',
        stop: '#e5433b',
    },
};

export function getThemeConfig() {
    return darkTheme;
}
