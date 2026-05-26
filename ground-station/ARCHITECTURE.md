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
│       │                             # (CSV/MQTT toggle removed — MQTT is now the only source)
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
│               ├── telemetry-worker.js        # Web Worker — runs buildTelemetryChartData + enrich off-thread
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

### MQTT-only data source
All routes now consume MQTT live telemetry — the CSV/MQTT source toggle was removed from the topbar. The Redux `sourceMode` stays at its default `'mqtt'`; the `setSourceMode` action and `parseTelemetryCsv` helpers remain available for future use but no UI surface switches modes anymore.

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

### Route-change resume (MQTT)

Navigating between MQTT-only routes (e.g. `/station` → `/analyse` → `/station`)
unmounts and remounts the page component, including its `useTelemetryStream`
hook. The MQTT effect:

- **Cleanup** clears only the poll interval, NOT the Redux telemetry data —
  Redux state is the source of truth and survives unmount.
- **Mount** reads `telemetry.telemetryData` from Redux. If MQTT-shaped data
  exists (frames with `_epoch_ms` stamped), it boots the `live` poll context
  with `shownCount = -1` (sentinel) and `lastRowKey` derived from the last
  REAL (non-blackout) frame. The first poll then searches that key inside the
  backend's deque to find the resume point, dispatches only the rows that
  arrived since, and preserves all existing phantom blackout frames in place.
  If the key isn't found (backend deque has rolled past it, or backend was
  reset), it falls back to a clean `clearTelemetryData()` + initial load.
- Foreign data (CSV residue from a prior `sourceMode` switch) is flushed on
  mount via an `_epoch_ms` shape check.
- **`keepMonotonicSuffix` is applied to the backend rows at initial load**.
  The Pico firmware loops its CSV from line 1 after each full pass — so the
  backend's 5000-frame deque can contain frames from two consecutive cycles
  with a backward mission_time jump (~2 h) at the boundary. Without slicing,
  the chart would zigzag wildly after a refresh because `_epoch_ms` is pinned
  to the FIRST (older) frame in the deque and the new cycle's frames end up
  with negative `_elapsed_s`. The helper walks backward through real frames
  only (phantoms skipped) and returns the longest tail where mission_time is
  monotonically non-decreasing; the epoch is then re-derived from the kept
  tail's first frame.
- An `isMounted` flag scoped to each effect closure guards against late
  dispatches: if the user navigates away while a `fetch` is in flight, the
  cleanup flips `isMounted = false`, the resolving promise checks the flag
  after each `await` and bails. Without it, the old hook's stale `live.globalStreamIdx`
  would dispatch after the new hook initialized, leaving Redux ahead of the
  new counter — the next legitimate dispatch would then trip the collision
  guard in `appendTelemetryPoints` (which wipes `telemetryData` on
  `streamIndex <= last.streamIndex`), and the operator would see all chart
  lines suddenly erased. The resume branch also re-syncs `globalStreamIdx`
  against `lastStreamIdxRef.current` defensively before assigning indexes.

---

## /station — Left Column Panel System

The left column (25% width) is fully configurable by the operator via the **Modifier** menu:

- **Chart panels** — any X/Y field combination from `AVAILABLE_FIELDS`; draggable, deletable, starred (synced with `/analyse` favorites)
- **Terminal panels** — three variants, at most one of each:
  - `telemetry` — key telemetry fields, green
  - `verbose` — all non-internal fields, yellow
  - `errors` — anomaly detection (GPS lost, low sat count, missing altitude/pressure)
    plus outage transitions: emits **one** `[RPI_DISCONNECTED]` line at the start
    of a real Pi/broker outage (`_realOutage: true` on the first phantom frame),
    **one** `[BLACKOUT_SIM]` line at the start of a manual simulation, and
    **one** `[TELEMETRY_RESUMED]` line in **green** (`#59d98b`) when real frames
    return — per-line color override via `line.color` so positive events stand
    out against the red default. Per-frame error detection is suppressed during
    blackout runs so the frozen phantom values don't spam the terminal.

All terminal state (`lines`, processing `cursor`, `inBlackout` flag) lives in
the Redux `telemetry.terminalState` slice keyed by variant. Lines and cursor
survive route unmount/remount — switching to `/analyse` and back no longer
empties the errors log. The processing cursor advances per dispatched batch so
remounted terminals replay only new frames, never re-emitting past lines.

Configuration persisted in `localStorage` (`station_left_column_config`). Favorite charts synced with `/analyse` via `analyse_charts_config`.

---

## Real Outage Detection (all routes)

A real outage (Raspberry Pi unplugged, broker unreachable) is detected from the
frontend in two complementary ways:

**Live detection** — centralized inside `useTelemetryStream` so every consumer
(`/station`, `/analyse`, `/vueGlobe3d`…) gets the red ghost line without
re-implementing the watchdog. The hook tracks `lastMqttFrameAt` (updated each
time a real MQTT frame is dispatched). A 1 s watchdog flips
`autoOutageActive = true` when `Date.now() - lastMqttFrameAt > 3 s`. While
active, a second effect injects phantom `appendTelemetryPoint` frames every
1 s (`_blackout: true`, `_realOutage: true`, frozen Y values, `streamIndex`
read fresh from `lastFrameRef.current` so it always increments past whatever's
in Redux). The injection skips while `mqttPausedRef.current === true` —
during a manual blackout the station-dashboard owns injection (with
`_realOutage: false`) and we mustn't double-inject. The MQTT poll itself keeps
running during a real outage (no `pauseMqtt`), so the moment real frames
return `lastMqttFrameAt` refreshes, `autoOutageActive` clears, injection
stops, and `buildTelemetryChartData`'s `blackoutOffsetSec` smooths the X axis
past the gap.

Why centralize? Previously the watchdog and injection lived in
`station-dashboard.jsx`. Visiting `/analyse` directly with the Pi unplugged
showed a frozen chart instead of the red ghost line, because no component
mounted on that route triggered the injection. Moving it into the hook means
the chart truth comes from Redux for every page that calls
`useTelemetryStream`, no matter which one the operator opens first.

**Replay reconstruction** — phantom frames live only in Redux, so a page
refresh wipes them and the red ghost line would otherwise vanish from past
outages. Two complementary mechanisms preserve them:

1. **`reconstructOutages`** runs as the first pass of `buildTelemetryChartData`.
   It scans consecutive real frames and, whenever their mission_time gap
   exceeds `OUTAGE_GAP_THRESHOLD_SEC` (2 s), splices `_blackout: true,
   _realOutage: true, _synthesized: true` phantoms into the chart data (one
   per missing second, carrying the previous real frame's Y values). This
   surfaces outages that happened before the page was opened, as long as the
   bracketing real frames are still in the backend's 5000-frame deque.

2. **`sessionStorage` persistence of `telemetryData`** — a **throttled**
   effect (2 s) in `useTelemetryStream` serializes the full `telemetryData`
   to `sessionStorage` under key `mqtt_telemetry_data_v1`. Throttle (not
   debounce!) is essential: under continuous 1 Hz MQTT updates a debounce
   would forever reset its timer and never fire. A `beforeunload` listener
   flushes the latest snapshot right before the browser tears down the
   page. On mount, if Redux is empty (fresh load after F5), the MQTT effect
   restores from storage before computing `existingData`, then the resume
   path (`shownCount = -1`) catches up with whatever the backend has
   accumulated since.

   Four subtle bugs sit between "naive implementation" and "actually
   preserves red lines on refresh"; all four had to be fixed:

   - **a)** Debounce vs throttle (above) — naive debounce never fires under
     continuous updates.
   - **b)** `live.globalStreamIdx` MUST come from
     `existingData[existingData.length - 1].streamIndex + 1`, NOT from
     `lastStreamIdxRef.current`. The ref is read during render against
     Redux state, but on F5 Redux is empty at render time and the
     restoring `dispatch(setTelemetryData(parsed))` happens INSIDE the
     effect — so reading the ref would give -1, the first incremental
     dispatch would assign `streamIndex = 0`, and `appendTelemetryPoints`'
     collision guard (`point.streamIndex <= last.streamIndex`) would wipe
     the restored phantoms on the very next poll.
   - **c)** Initial-empty wipe — the persist effect's first run on F5
     sees `dataRef.current = []` (Redux not yet updated by the restore
     dispatch on the same render) and would call
     `sessionStorage.removeItem`, destroying the saved data that the MQTT
     effect just read. Gated by a `hasHadDataRef` so wipes only happen
     after data was actually populated and then explicitly cleared.
   - **d)** No-anchor fallback wipe — when the user F5s after a long
     outage, the restored data may have no real-frame anchor that still
     exists in the backend's deque (the bracketing real frame was either
     pushed out by phantoms in Redux or evicted from the backend by post-
     reconnect frames). The resume's `findIndex` returns -1. Naively
     calling `dispatch(clearTelemetryData())` here destroys the phantoms.
     Instead the fallback walks back through restored real frames to find
     the most recent mission_time, then appends only backend rows whose
     mission_time is strictly greater — restored phantoms are preserved
     and forward-incremental updates resume cleanly.

   Storage is `sessionStorage` (not `localStorage`) so a new tab or browser
   restart starts fresh; QuotaExceeded errors are silently swallowed,
   falling back to `reconstructOutages`.

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
   - The `_ghost` connector (last real frame carrying a ghost value so the red line
     joins the normal line) is **only added while a blackout is currently active**
     (i.e. the latest frame has `_blackout: true`). Once real frames resume, the
     past ghost segment is self-contained between blackout frames, and the
     latest real point carries no `_ghost` value — so hovering it no longer
     shows a red active-dot or red tooltip entry.
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
| `telemetry` | `telemetryData`, `sourceData`, `playbackIndex`, `streamIndex`, `mode`, `sourceMode` (default `'mqtt'`), `loading`, `error`, `terminalState` (per-variant `{ lines, cursor, inBlackout }` so terminal logs survive route unmount/remount) |

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
| `_elapsed_s` | `(timestamp − epoch) / 1000` — `epoch = data[0]._epoch_ms` (stable) or `parseRowTimestamp(data[0])`. Blackout frames use `lastRealElapsed + N` instead | s · step 100 (ticks at 10, 20, 30… s — `raw = step/10`) |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 10 (ticks at 1, 2, 3… min) |

---

## Performance Notes

| Component | Technique |
|---|---|
| MQTT poll | Content-fingerprint change detection — detects new frames even when backend deque is full (sliding window); only dispatches new frames via `appendTelemetryPoints` (batched, one Redux update per poll) instead of replacing all 5000 |
| Stable epoch | First MQTT frame's mission time is stored in `live.epochMs` and stamped on every subsequent frame as `_epoch_ms`. `buildTelemetryChartData` uses `data[0]._epoch_ms` so the X-axis origin doesn't drift as old frames are evicted from the 5000-frame display window |
| Cesium trajectory | Incremental: only converts newly arrived GPS points to `Cartesian3`; O(1) per poll instead of O(n). Cached in `trajectoryPositionsRef`. Resets on data clear. |
| TelemetryChart | Decimates data to ≤800 points for SVG path rendering; full dataset still used for domain/axis/scroll computation |
| Chart pipeline off-thread | `buildTelemetryChartData` + `reconstructOutages` + per-row `enrich` (FSPL / link budget / distance) run inside a **Web Worker** (`telemetry-worker.js`, instantiated per `useTelemetryStream` mount via Vite's `?worker` ESM import). Each `telemetryData` change posts `{ data, requestId }` to the worker; the worker replies with fully-enriched `chartData` and the main thread only pays the structured-clone cost of postMessage. A monotonic `requestId` discards stale results when dispatches arrive faster than the worker can process. The first render (and any SSR/no-Worker environment) falls back to a synchronous main-thread compute so consumers never see an empty `chartData`. Dashboards (`/station`, `/analyse`) consume `chartData` directly — the previous `.map(enrich)` in each page is removed since the worker already enriched. Together with `useDeferredValue` on the chart data (kept for tearing under burst updates), this keeps Cesium animation and Recharts re-renders smooth even with 5000-frame rebuilds. |

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
