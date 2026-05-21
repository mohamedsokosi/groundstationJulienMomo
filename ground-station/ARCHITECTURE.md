# Architecture — Ground Station

## Overview

Real-time web application for stratospheric balloon tracking (ICARUS2 project).  
Stack: **FastAPI + Python** (backend) · **React + Redux + Cesium** (frontend) · **MQTT** (live telemetry).

---

## Full Hardware Pipeline

```
┌─────────────────────────┐
│   Raspberry Pi Pico     │  Replays ICARUS2 flight data (7,681 records @ 1 s)
│   (Telemetry Sender)    │  from embedded CSV via CFDP-wrapped USB serial
└────────────┬────────────┘
             │  USB CDC — /dev/ttyACM0
             │  115200 baud
             ▼
┌─────────────────────────┐
│   Raspberry Pi 4B       │  uart_mqtt_bridge.py:
│   (gs-modem)            │  strips CFDP header, encodes protobuf,
│                         │  publishes to local MQTT broker
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
│   │   └── telemetry_store.py          # In-memory deque for telemetry frames (maxlen 5000)
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
│               ├── telemetry-slice.jsx        # Redux slice — telemetry data (default: mqtt)
│               ├── use-telemetry-stream.jsx   # Hook — load, playback, seek, pause
│               ├── telemetry-data-source.js   # CSV/Protobuf parsing, MQTT display limit 5000
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
│   │   └── start-local.sh   # Local startup (MQTT, Simulator, Restart, BrokerHost)
│   └── simulators/
│       └── mqtt_cubesat_simulator.py  # MQTT simulator — publishes protobuf frames
│
├── Dockerfile               # Multi-stage build: Node → Python 3.12
├── LICENSE
├── README.md
└── telemetry.csv            # Real flight data (ICARUS2, 2025-08-14, 7,681 rows @ 1 s)
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
Option B — MQTT live (hardware pipeline, default):           │
  Pico (USB /dev/ttyACM0) → Raspberry Pi 4B                │
    └─► uart_mqtt_bridge.py                                  │
          └─► MQTT Broker :1883                              │
                └─► mqtt_telemetry_receiver.py (daemon)     │
                      └─► telemetry_store (deque 5000)      │
                           └─► GET /api/telemetry/mqtt/frames ──►
                                                             │
                                                             ▼
                                          use-telemetry-stream.jsx (hook)
                                            polls every 1 s
                                            parseTelemetryProtobuf()
                                            → Redux store (telemetryData, max 5000)
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
                                            _distance ← vertical distance (m)
                                                             │
                                                             ▼
                                          TelemetryChart / CesiumViewport / TelemetryStatsBar
```

---

## Redux State

| Slice | Contents |
|---|---|
| `telemetry` | `telemetryData`, `sourceData`, `playbackIndex`, `streamIndex`, `mode`, `sourceMode` (default `'mqtt'`), `loading`, `error` |

---

## HTTP API (FastAPI backend)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/telemetry.csv` | Current telemetry CSV file |
| `GET` | `/api/telemetry.pb` | Telemetry frames as Protocol Buffers (MQTT store or CSV fallback) |
| `GET` | `/api/telemetry/mqtt/frames` | MQTT store frames as Protocol Buffers (live only) |
| `GET` | `/api/telemetry/mqtt/status` | MQTT broker connection status |
| `POST` | `/api/telemetry/mqtt/clear` | Clear the MQTT store |
| `GET` | `/*` | SPA fallback → `dist/index.html` |

---

## Physics Calculations (chart-logic.js)

| Field | Formula | Unit / Step |
|---|---|---|
| `_fspl` | `20·log₁₀(4π·d·f / c)` with f=437 MHz | dB |
| `_bilan` | `TX(30 dBm) + TX_gain(8) − FSPL + RX_gain(10)` | dBm |
| `_elapsed_s` | `(timestamp_CSV − t₀) / 1000` | s · step 10 |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 1 |

---

## Local Startup

```bash
./tools/dev/start-local.sh -Restart -Mqtt -Simulator
```

| Option | Effect |
|---|---|
| `-Restart` | Kills processes on backend/frontend ports before restarting |
| `-Mqtt` | Starts local Mosquitto broker (port 1883) |
| `-Simulator` | Runs `mqtt_cubesat_simulator.py` (publishes CSV frames over MQTT) |
| `-BrokerHost <ip>` | Use an external MQTT broker (e.g. the Raspberry Pi 4B) |
| `-BackendPort <p>` | Override backend port (default 5000) |
| `-FrontendPort <p>` | Override frontend port (default 5173) |

### Connecting to the Raspberry Pi 4B broker

```bash
./tools/dev/start-local.sh -Restart -Mqtt -BrokerHost <RPi-IP>
```

The ground station backend will subscribe to `icarus2/telemetry/frame.pb` on the RPi's mosquitto broker. The RPi must have `listener 1883` + `allow_anonymous true` in its mosquitto config.

### Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_CESIUM_ION_TOKEN` | (`.env.local`) | Cesium Ion token for the base map |
| `MQTT_TELEMETRY_ENABLED` | `0` | Set to `1` to enable MQTT reception |
| `MQTT_BROKER_HOST` | `localhost` | MQTT broker host |
| `MQTT_BROKER_PORT` | `1883` | MQTT port |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Telemetry topic |
| `MQTT_TELEMETRY_STORE_MAXLEN` | `5000` | Max frames kept in backend store |

---

## Tech Stack

| Category | Technology |
|---|---|
| Backend | FastAPI + Uvicorn + paho-mqtt |
| Serialization | Protocol Buffers (hand-coded, no .proto file) |
| Frontend | React 19 + Vite + React Router v7 |
| State | Redux Toolkit |
| UI | Material-UI v7 |
| 3D Globe | Cesium |
| Charts | Recharts |
| Containerization | Docker |
