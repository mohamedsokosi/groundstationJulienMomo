# Architecture — Ground Station

## Overview

Real-time web application for stratospheric balloon tracking (ICARUS2 project).  
Stack: **FastAPI + Python** (backend) · **React + Redux + Cesium** (frontend) · **MQTT** (live telemetry).

---

## Full Hardware Pipeline

```
┌─────────────────────────┐
│   Raspberry Pi Pico     │  Replays ICARUS2 flight data (96 records)
│   (Telemetry Sender)    │  from embedded CSV via CFDP-wrapped UART
└────────────┬────────────┘
             │  UART Serial1 — GPIO0/TX → GPIO15/RX
             │  115200 baud
             ▼
┌─────────────────────────┐
│   Raspberry Pi 4B       │  Receives UART frames, decodes CFDP,
│   (gs-modem)            │  publishes protobuf frames to MQTT broker
└────────────┬────────────┘
             │  MQTT — topic: icarus2/telemetry/frame.pb
             │  port 1883
             ▼
┌─────────────────────────┐
│   Ground Station        │  FastAPI backend + React frontend
│   (this application)    │  displays telemetry live
└─────────────────────────┘
```

---

## Folder Structure

```
ground-station/
├── backend/                  # Python server (FastAPI)
│   ├── app.py                # Entry point — starts Uvicorn
│   ├── logconfig.yaml        # Logging configuration (colorlog)
│   ├── server/
│   │   ├── startup.py        # FastAPI app, HTTP routes, CORS, static files
│   │   └── telemetry_protobuf.py  # Protocol Buffers encode/decode
│   ├── pipeline/
│   │   ├── mqtt_telemetry_receiver.py  # paho MQTT client, topic icarus2/telemetry/frame.pb
│   │   └── telemetry_store.py          # In-memory deque for telemetry frames
│   └── common/
│       ├── arguments.py      # CLI argument parsing (host, port, log-level) + defaults
│       └── logger.py         # stdlib logging basicConfig
│
├── frontend/                 # React client (Vite)
│   ├── index.html            # HTML entry — favicon SAFARI.png
│   ├── vite.config.js        # Vite build + Cesium plugin + backend proxy
│   ├── package.json          # Dependencies: React, MUI, Redux, Cesium, Recharts
│   ├── public/               # Static assets
│   │   ├── SAFARI.png        # SAFARI logo (favicon)
│   │   ├── CSA.png / ETS.jpg / Lassena.png / seds.png  # Partner logos (topbar)
│   │   └── cubesat.png       # CubeSat image
│   └── src/
│       ├── main.jsx                  # React root — router + Redux Provider
│       ├── App.jsx                   # ThemeProvider + CssBaseline
│       ├── theme.js                  # MUI dark theme
│       ├── theme-configs.js          # Color palette (dark theme)
│       ├── store.jsx                 # Redux store (telemetry slice only)
│       ├── layout.jsx                # Topbar + hover-expand sidebar + <Outlet>
│       ├── navigation.jsx            # Sidebar definition (5 routes)
│       ├── page-actions-context.jsx  # Context for per-page action buttons
│       ├── error-page.jsx            # Error page
│       └── pages/
│           ├── station/
│           │   └── station-dashboard.jsx      # /station — map + charts + terminal
│           ├── vueGlobe3d/
│           │   └── telemetry-dashboard.jsx    # /vueGlobe3d — Cesium globe + timeline
│           ├── analyse/
│           │   └── analyse-dashboard.jsx      # /analyse — configurable chart grid
│           ├── cubesat/
│           │   ├── cubesat-dashboard.jsx      # /cubesat — annotated CubeSat view
│           │   ├── cubesat-annotated-visual.jsx
│           │   ├── cubesat-subsystem-panel.jsx
│           │   ├── cubesat-config.js
│           │   └── cubesat-utils.js
│           ├── rapport/
│           │   └── rapport-dashboard.jsx      # /rapport — mission report generation
│           └── shared/                        # Shared components and utilities
│               ├── cesiumViewport.jsx         # Cesium globe
│               ├── telemetryChart.jsx         # Recharts chart
│               ├── telemetryStatsBar.jsx      # Stats bar
│               ├── telemetryTerminal.jsx      # Raw stream terminal
│               ├── chartTitle.jsx             # Dynamic chart title
│               ├── telemetry-components.jsx   # StatisticCard, ChartCard, TelemetrySummary
│               ├── telemetry-slice.jsx        # Redux slice — telemetry data
│               ├── use-telemetry-stream.jsx   # Hook — load, playback, seek, pause
│               ├── telemetry-data-source.js   # CSV/Protobuf parsing
│               ├── telemetry-protobuf.js      # Protobuf decoding
│               ├── telemetry-utils.js         # distanceKm, getMqttSourceStat, helpers
│               ├── cesium-utils.js            # getTelemetryRecordGeo, imagery providers
│               ├── chart-fields.js            # AVAILABLE_FIELDS — axes and steps
│               ├── chart-logic.js             # FSPL, link budget, enrich()
│               ├── useAnimatedDomain.js       # Smooth axis animation
│               └── ground-station-view.css    # Global styles (stats bar, globe)
│
├── tools/
│   ├── dev/
│   │   └── start-local.sh   # Local startup (MQTT, Simulator, Restart)
│   └── simulators/
│       └── mqtt_cubesat_simulator.py  # MQTT simulator — publishes protobuf frames
│
├── Dockerfile               # Multi-stage build: Node → Python 3.12
├── LICENSE
├── README.md
└── telemetry.csv            # Real flight data (ICARUS2, 2025-08-14)
```

---

## Application Routes

| Route | Component | Description |
|---|---|---|
| `/` | redirect | Redirects to `/station` |
| `/station` | `StationDashboard` | Operator view: Cesium map + configurable charts + terminal |
| `/vueGlobe3d` | `TelemetryDashboard` | 3D Cesium globe, trajectory, stats bar, timeline |
| `/analyse` | `AnalyseDashboard` | Fully configurable Recharts grid |
| `/cubesat` | `CubeSatDashboard` | Annotated CubeSat image, subsystems, telemetry |
| `/rapport` | `RapportDashboard` | Mission report generation |

---

## Data Flow

### Telemetry (CSV / MQTT)

```
Option A — CSV fallback:
  GET /api/telemetry.pb  ──────────────────────────────────►
                                                             │
Option B — MQTT live (hardware pipeline):                    │
  Pico (UART) → Raspberry Pi 4B                             │
    └─► MQTT Broker :1883                                    │
          └─► mqtt_telemetry_receiver.py (daemon thread)    │
                └─► telemetry_store (deque maxlen=5000)      │
                     └─► GET /api/telemetry.pb ────────────►│
                                                             ▼
                                          use-telemetry-stream.jsx (hook)
                                            fetchInterval 2s
                                            parseTelemetryProtobuf()
                                            → Redux store (telemetryData)
                                            startStream() → setInterval
                                                             │
                                                             ▼
                                          buildTelemetryChartData()
                                            _elapsed_s / _elapsed_min ← m-time CSV
                                            GPS, altitude, speed, temp fields
                                                             │
                                                             ▼
                                          enrich() (chart-logic.js)
                                            _fspl     ← Free Space Path Loss
                                            _bilan    ← Link budget (dBm)
                                                             │
                                                             ▼
                                          TelemetryChart / CesiumViewport / TelemetryStatsBar
```

---

## Redux State

| Slice | Contents |
|---|---|
| `telemetry` | `telemetryData`, `sourceData`, `playbackIndex`, `streamIndex`, `mode`, `loading`, `error` |

---

## HTTP API (FastAPI backend)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/telemetry.csv` | Current telemetry CSV file |
| `GET` | `/api/telemetry.pb` | Telemetry frames as Protocol Buffers (MQTT or CSV) |
| `GET` | `/api/telemetry/mqtt/status` | MQTT broker status |
| `POST` | `/api/telemetry/mqtt/clear` | Clear the MQTT store |
| `GET` | `/*` | SPA fallback → `dist/index.html` |

---

## Physics Calculations (chart-logic.js)

| Field | Formula | Unit / Step |
|---|---|---|
| `_fspl` | `20·log₁₀(4π·d·f / c)` with f=437 MHz | dB |
| `_bilan` | `TX(30 dBm) + TX_gain(8) − FSPL + RX_gain(10)` | dBm |
| `_elapsed_s` | `(timestamp_CSV − t₀) / 1000` | s · step 10 000 |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 60 |

---

## Local Startup

```bash
./tools/dev/start-local.sh -Restart -Mqtt -Simulator
```

| Option | Effect |
|---|---|
| `-Restart` | Kills processes on ports 5000 and 5173 before restarting |
| `-Mqtt` | Starts local Mosquitto broker (port 1883) |
| `-Simulator` | Runs `mqtt_cubesat_simulator.py` (publishes CSV frames over MQTT) |

### Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_CESIUM_ION_TOKEN` | (`.env.local`) | Cesium Ion token for the base map |
| `MQTT_TELEMETRY_ENABLED` | `0` | Set to `1` to enable MQTT reception |
| `MQTT_BROKER_HOST` | `localhost` | MQTT broker host |
| `MQTT_BROKER_PORT` | `1883` | MQTT port |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Telemetry topic |

---

## Tech Stack

| Category | Technology |
|---|---|
| Backend | FastAPI + Uvicorn + paho-mqtt |
| Serialization | Protocol Buffers |
| Frontend | React 19 + Vite + React Router v7 |
| State | Redux Toolkit |
| UI | Material-UI v7 |
| 3D Globe | Cesium |
| Charts | Recharts |
| Containerization | Docker |
