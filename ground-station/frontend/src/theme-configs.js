const darkTheme = {
    mode: 'dark',
    primary: { main: '#5cc8ff' },
    secondary: { main: '#ff8f5a' },
    success: { main: '#59d98b' },
    warning: { main: '#ffcc66' },
    error: { main: '#ff5d6c' },
    info: { main: '#7c90ff' },
    background: {
        default: '#0d0f13',
        paper: '#151a21',
        elevated: '#1d2430',
        titleBar: '#11161c',
    },
    border: {
        main: '#293241',
        light: '#344154',
        dark: '#1d2430',
    },
    overlay: {
        light: 'rgba(92, 200, 255, 0.08)',
        medium: 'rgba(92, 200, 255, 0.15)',
        dark: 'rgba(0, 0, 0, 0.6)',
    },
    status: {
        connected: '#59d98b',
        connecting: '#ffcc66',
        disconnected: '#ff5d6c',
        polling: '#ff8f5a',
    },
    action: {
        play: '#59d98b',
        stop: '#ff5d6c',
    },
};

export function getThemeConfig() {
    return darkTheme;
}
