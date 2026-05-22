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
│       │                             # CSV/MQTT toggle hidden on /station and /vueGlobe3d
│       ├── navigation.jsx            # Sidebar definition (5 routes)
│       ├── page-actions-context.jsx  # Context for per-page action buttons
│       ├── error-page.jsx            # Error page
│       └── pages/
│           ├── station/
│           │   └── station-dashboard.jsx      # /station — MQTT-only operator view
│           │                                  # Cesium map + configurable chart/terminal panels
│           │                                  # Blackout simulation button
│           ├── vueGlobe3d/
│           │   └── telemetry-dashboard.jsx    # /vueGlobe3d — MQTT-only Cesium globe
│           ├── analyse/
│           │   └── analyse-dashboard.jsx      # /analyse — configurable chart grid (CSV or MQTT)
│           ├── cubesat/
│           │   ├── cubesat-dashboard.jsx      # /cubesat — annotated CubeSat view
│           │   ├── cubesat-annotated-visual.jsx
│           │   ├── cubesat-subsystem-panel.jsx
│           │   ├── cubesat-config.js
│           │   └── cubesat-utils.js
│           ├── rapport/
│           │   └── rapport-dashboard.jsx      # /rapport — mission report generation
│           └── shared/                        # Shared components and utilities
│               ├── cesiumViewport.jsx         # Cesium globe + RightControlPanel (zoom, GS position)
│               ├── telemetryChart.jsx         # Recharts chart (decimated to 800 pts for rendering)
│               ├── telemetryStatsBar.jsx      # Stats bar
│               ├── telemetryTerminal.jsx      # Raw stream terminal (variants: telemetry/verbose/errors)
│               ├── chartTitle.jsx             # Dynamic chart title
│               ├── telemetry-components.jsx   # StatisticCard, ChartCard, TelemetrySummary
│               ├── telemetry-slice.jsx        # Redux slice — telemetry data (default sourceMode: mqtt)
│               ├── use-telemetry-stream.jsx   # Hook — load, playback, seek, pause, MQTT incremental poll
│               ├── telemetry-data-source.js   # CSV/Protobuf parsing, MQTT display limit 5000
│               ├── telemetry-protobuf.js      # Protobuf decoding
│               ├── telemetry-utils.js         # distanceKm, getMqttSourceStat, helpers
│               ├── cesium-utils.js            # getTelemetryRecordGeo, imagery providers
│               │                             # loadGroundStationPosition / saveGroundStationPosition
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
| `/station` | `StationDashboard` | Operator view: Cesium map + configurable left column (charts + terminals) + blackout simulation |
| `/vueGlobe3d` | `TelemetryDashboard` | 3D Cesium globe, trajectory, stats bar |
| `/analyse` | `AnalyseDashboard` | Fully configurable Recharts grid |
| `/cubesat` | `CubeSatDashboard` | Annotated CubeSat image, subsystems, telemetry |
| `/rapport` | `RapportDashboard` | Mission report generation |

### MQTT-only routes
`/station` and `/vueGlobe3d` are MQTT-only. The CSV/MQTT source toggle in the topbar is hidden on these routes. The Redux `sourceMode` defaults to `'mqtt'`.

---

## Data Flow

### Telemetry (MQTT live — default for /station and /vueGlobe3d)

```
Pico (USB /dev/ttyACM0) → Raspberry Pi 4B
  └─► uart_mqtt_bridge.py
        └─► MQTT Broker :1883
              └─► mqtt_telemetry_receiver.py (daemon)
                    └─► telemetry_store (deque maxlen 5000)
                         └─► GET /api/telemetry/mqtt/frames ──►
                                                              │
                                                              ▼
                                         use-telemetry-stream.jsx (hook)
                                           polls every 1 s
                                           content-fingerprint change detection
                                           (detects sliding window when deque is full)
                                           stamps _epoch_ms on every frame at session
                                           start so the X-axis epoch never drifts as the
                                           5000-frame window slides
                                           initial load → setTelemetryData (all frames)
                                           incremental → appendTelemetryPoints (batched,
                                           one Redux update per poll instead of per frame)
                                           pauseMqtt / resumeMqtt (for blackout simulation)
                                           resumeMqtt marks skipMqttBacklogRef so the
                                           next poll discards frames received during the
                                           pause (simulated lost packets)
                                                              │
                                                              ▼
                                         buildTelemetryChartData()
                                           _elapsed_s / _elapsed_min ← m-time (protobuf field)
                                           GPS, altitude, speed, temp fields
                                                              │
                                                              ▼
                                         enrich() (chart-logic.js)
                                           _fspl     ← Free Space Path Loss
                                           _bilan    ← Link budget (dBm)
                                           _distance ← vertical distance (m)
                                                              │
                                                              ▼
                                         TelemetryChart (≤800 pts decimated)
                                         CesiumViewport (incremental trajectory)
                                         TelemetryStatsBar
```

### Telemetry (CSV / other routes)

```
GET /api/telemetry.pb  →  parseTelemetryProtobuf()  →  loadRows()  →  startStream()
  (fallback: GET /api/telemetry.csv  →  parseTelemetryCsv())
```

---

## /station — Left Column Panel System

The left column (25% width) is fully configurable by the operator via the **Modifier** menu:

- **Chart panels** — any X/Y field combination from `AVAILABLE_FIELDS`; draggable, deletable, starred (synced with `/analyse` favorites)
- **Terminal panels** — three variants, at most one of each:
  - `telemetry` — key telemetry fields, green
  - `verbose` — all non-internal fields, yellow
  - `errors` — anomaly detection only (GPS lost, low sat count, missing altitude/pressure), red

Configuration persisted in `localStorage` (`station_left_column_config`). Favorite charts synced with `/analyse` via `analyse_charts_config`.

---

## /station — Blackout Simulation

The **"Simuler coupure"** button in the topbar:

1. Calls `pauseMqtt()` — the MQTT poll skips fetches while paused.
2. Every 1 s, injects a phantom data point via `appendTelemetryPoint`:
   - Copies the last real data point's field values (frozen Y values, plus `_epoch_ms`)
   - Sets `_blackout: true`
   - `streamIndex` advances from `lastDataPoint.streamIndex + 1`
3. `buildTelemetryChartData` recognizes blackout frames and advances their
   `_elapsed_s` by exactly +1 s per frame from the last real frame's elapsed
   time — bypassing `parseRowTimestamp` entirely. This avoids the 40 000-min
   X-axis jump that would otherwise result from `_received_at` (May 2026 wall
   clock) minus the mission epoch (Aug 2025).
4. Charts visualize the blackout period:
   - **Normal series** stops at the last real point (solid line, normal color)
   - **Ghost series** continues as a solid red line (`#ff3030`) at the frozen Y value
   - No background fill — the blackout segment is just a red continuation of the line
5. Deactivating the button:
   - `resumeMqtt()` sets `skipMqttBacklogRef = true`. The next MQTT poll updates
     `live.shownCount` to the current backend count without dispatching the
     piled-up frames (simulated lost packets) and syncs `live.globalStreamIdx`
     past the blackout frames' stream indexes.
   - Phantom injection stops.
   - `buildTelemetryChartData` tracks `blackoutOffsetSec`: the first real
     frame after the blackout is pinned to `lastBlackoutElapsed + 1` and the
     resulting offset is subtracted from every subsequent frame, so the X
     axis continues smoothly from where the dashed line ended.

---

## Ground Station Position

Configurable via the **"Position GS ▼"** button in the Cesium right-panel (both `/station` and `/vueGlobe3d`):

- Persisted in `localStorage` under key `station_ground_station_position`
- Shared between both routes via `loadGroundStationPosition()` / `saveGroundStationPosition()` from `cesium-utils.js`
- Default: `{ lat: 48.55, lon: -81.35 }` (ICARUS2 launch site)
- Cesium entity: green dot + "GS" label, always visible regardless of telemetry state
- Link beam (green line) drawn from GS position to current CubeSat position

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
| `_elapsed_s` | `(timestamp − epoch) / 1000` — `epoch = data[0]._epoch_ms` (stable) or `parseRowTimestamp(data[0])`. Blackout frames use `lastRealElapsed + N` instead | s · step 10 |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 10 (ticks at 1, 2, 3… min) |

---

## Performance Notes

| Component | Technique |
|---|---|
| MQTT poll | Content-fingerprint change detection — detects new frames even when backend deque is full (sliding window); only dispatches new frames via `appendTelemetryPoints` (batched, one Redux update per poll) instead of replacing all 5000 |
| Stable epoch | First MQTT frame's mission time is stored in `live.epochMs` and stamped on every subsequent frame as `_epoch_ms`. `buildTelemetryChartData` uses `data[0]._epoch_ms` so the X-axis origin doesn't drift as old frames are evicted from the 5000-frame display window |
| Cesium trajectory | Incremental: only converts newly arrived GPS points to `Cartesian3`; O(1) per poll instead of O(n). Cached in `trajectoryPositionsRef`. Resets on data clear. |
| TelemetryChart | Decimates data to ≤800 points for SVG path rendering; full dataset still used for domain/axis/scroll computation |
| Chart enrichment | `enrichedData = useDeferredValue(chartData).map(enrich)` yields to Cesium/UI under load. Safe from starvation here because the upstream is stable: `_epoch_ms` keeps the X axis growing and `appendTelemetryPoints` batches all new frames into one Redux update per poll (≤1 Hz), giving the deferred render time to flush between urgent renders. `enrich` mutates the row in place rather than spreading 50 fields to add 3 |

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
