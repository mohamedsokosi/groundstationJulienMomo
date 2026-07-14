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



import {createTheme} from "@mui/material";
import { getThemeConfig } from './theme-configs.js';

export function setupTheme(themeName = 'dark') {
    // Get the theme configuration
    const config = getThemeConfig(themeName);

    // Determine if theme is dark mode for component overrides
    const isDark = config.mode === 'dark';

    const palette = {
        mode: config.mode,
        ...config,
    }

    return createTheme({
        // Emit --mui-palette-* CSS variables so the gs-* CSS classes
        // (which reference var(--mui-palette-...)) are driven by this one palette.
        cssVariables: true,
        palette,
        shape: {
            borderRadius: 0,
        },
        typography: {
            //htmlFontSize: 16,
            fontFamily: "Roboto, Arial, sans-serif",
            // h1: {
            //     fontSize: "3rem",
            // },
            // h2: {
            //     fontSize: "2.7rem",
            // },
            // h3: {
            //     fontSize: "2.5rem",
            // },
            // body1: {
            //     fontSize: "1.4rem",
            // },
            // body2: {
            //     fontSize: "1.2rem",
            // },
            // body3: {
            //     fontSize: "1.25rem",
            // },
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: (theme) => `
                    /* Custom application styles */
                    .window-title-bar {
                        background-color: ${theme.palette.background.paper};
                    }
                    .attribution {
                        color: ${theme.palette.text.secondary};
                        font-size: 12px;
                        line-height: 20px;
                    }
                    .truncate {
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        max-width: 1000px;
                        display: block;
                    }
                    .pointer-cursor {
                        cursor: pointer;
                    }

                    /* VSCode controller */
                    .vsc-controller {
                        display: none !important;
                    }

                    /* Tooltip satellite - interactive tooltips */
                    .tooltip-satellite {
                        pointer-events: auto !important;
                    }
                    .tooltip-satellite button {
                        pointer-events: auto !important;
                    }
                    .tooltip-satellite button.Mui-disabled {
                        pointer-events: none !important;
                    }
                `,
            },
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        backgroundColor: isDark ? "#1c1f26" : "#f5f5f5",
                        borderRight: isDark ? "1px solid #33383f" : "1px solid #e0e0e0",
                    },
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundColor: isDark
                            ? theme.palette.background.elevated
                            : theme.palette.primary.main,
                        borderBottom: `1px solid ${theme.palette.border.main}`,
                        boxShadow: isDark
                            ? '0 2px 4px rgba(0, 0, 0, 0.5)'
                            : '0 2px 8px rgba(0, 0, 0, 0.15)',
                        backdropFilter: 'blur(8px)',
                    }),
                },
            },
            MuiToolbar: {
                styleOverrides: {
                    root: {
                        minHeight: '52px',
                        '@media (min-width: 600px)': {
                            minHeight: '52px',
                        },
                    },
                },
            },
            MuiSelect: {
                styleOverrides: {
                    root: {
                        backgroundColor: isDark ? "#15181d" : "#ffffff",
                        //fontFamily: "Monospace, monospace",
                        //fontSize: "0.8rem",
                        //fontSpacing: "0.05rem",
                    }
                },
            },
            MuiMenuItem: {
                styleOverrides: {
                    root: {
                        //fontFamily: "Monospace, monospace",
                        //fontSize: "0.8rem",
                        //fontSpacing: "0.05rem",
                    }
                },
            },
            MuiAutocomplete: {
                styleOverrides: {
                    root: {
                        backgroundColor: isDark ? "#15181d" : "#ffffff",
                    }
                },
            },
            MuiListSubheader: {
                styleOverrides: {
                    root: {
                        backgroundColor: isDark ? "#1c1f26" : "#f5f5f5",
                    }
                },
            },
            MuiFilledInput: {
                styleOverrides: {
                    root: {
                        backgroundColor: isDark ? "#15181d" : "#f5f5f5",
                    }
                },
            },
            MuiTextField: {
                styleOverrides: {
                    root: {
                        backgroundColor: isDark ? "#15181d" : "#ffffff",
                    }
                },
            },
            MuiFormHelperText: {
                styleOverrides: {
                    root: {
                        backgroundColor: 'transparent',
                        '&.MuiFormHelperText-contained': {
                            backgroundColor: 'transparent',
                        },
                        '&.MuiFormHelperText-sizeSmall': {
                            backgroundColor: 'transparent',
                        },
                    }
                },
            },
            MuiChip: {
                styleOverrides: {
                    root: {
                        borderRadius: 0,
                    },
                },
            },
            // MuiAppBar: {
            //     styleOverrides: {
            //         backgroundColor: "#1c1f26",
            //     }
            // },
            // MuiButton: {
            //     styleOverrides: {
            //         borderRadius: 20,
            //         fontWeight: "bold",
            //     },
            //     defaultProps: {
            //         variant: "contained",
            //         disableElevation: true,
            //     },
            // },
            // MuiStack: {
            //     defaultProps: {
            //         gap: 2,
            //     },
            // },
        },
    });
}
