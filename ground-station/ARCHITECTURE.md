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
│   ├── poetry.toml           # Local Poetry config — virtualenvs.in-project = true (.venv inside backend/)
│   ├── server/
│   │   ├── startup.py        # FastAPI app, HTTP routes, CORS, static files
│   │   └── telemetry_protobuf.py  # Protocol Buffers encode/decode
│   ├── pipeline/
│   │   ├── mqtt_telemetry_receiver.py  # paho MQTT client, topic icarus2/telemetry/frame.pb
│   │   ├── telemetry_store.py          # In-memory deque for telemetry frames (maxlen 5000)
│   │   ├── telemetry_csv_logger.py     # Appends each MQTT frame to a per-day local CSV (<date>.csv)
│   │   └── telemetry_sheets_sync.py    # Batches frames → Google Sheet (Apps Script Web App)
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
│       ├── topbar-widgets.jsx        # Global topbar widgets: Heure (clock), Météo + Vent
│       │                             # (Open-Meteo, keyless, uses GS position), Décompte T
│       │                             # (datetime-local launch picker → live T-/T+ countdown)
│       ├── navigation.jsx            # Sidebar definition (5 routes)
│       ├── page-actions-context.jsx  # Context for per-page action buttons
│       ├── error-page.jsx            # Error page
│       └── pages/
│           ├── station/
│           │   └── station-dashboard.jsx      # /station — MQTT-only operator view
│           │                                  # Cesium map + configurable chart/terminal panels
│           ├── vueGlobe3d/
│           │   └── telemetry-dashboard.jsx    # /vueGlobe3d — MQTT-only Cesium globe
│           ├── analyse/
│           │   └── analyse-dashboard.jsx      # /analyse — configurable chart grid (MQTT live)
│           ├── cubesat/
│           │   ├── cubesat-dashboard.jsx      # /cubesat — annotated CubeSat view
│           │   ├── cubesat-annotated-visual.jsx
│           │   ├── cubesat-subsystem-panel.jsx
│           │   ├── cubesat-config.js
│           │   └── cubesat-utils.js
│           ├── rapport/
│           │   └── rapport-dashboard.jsx      # /rapport — PDF export of /station + /analyse charts
│           └── shared/                        # Shared components and utilities
│               ├── cesiumViewport.jsx         # Cesium globe + RightControlPanel (zoom, GS position)
│               ├── telemetryChart.jsx         # Recharts chart (decimated to 800 pts for rendering)
│               ├── telemetryStatsBar.jsx      # Stats bar (8 cards: Altitude, Distance, Vitesse,
│               │                             #   GPS SAT, Pression, Link Budget, Status, Source)
│               │                             # Cards have fixed widths (80 px default, 60 px narrow,
│               │                             #   75 px medium); value font shrinks on long strings
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
│               │                             # MAP_FOLLOW_CAMERA_HEIGHT = 27000 (follow mode zoom)
│               ├── chart-fields.js            # AVAILABLE_FIELDS — axes and steps
│               │                             # TEMP_FIELD_KEYS — shortcut for All Temp button
│               ├── chart-logic.js             # FSPL, link budget, enrich()
│               ├── telemetry-worker.js        # Web Worker — runs buildTelemetryChartData + enrich off-thread
│               ├── useAnimatedDomain.js       # Smooth axis animation
│               └── ground-station-view.css    # Global styles (stats bar, globe)
│
├── tools/
│   ├── dev/
│   │   └── start-local.sh   # Local startup (MQTT, Simulator, Restart, BrokerHost)
│   │                        # Detaches backend/frontend, logs to ~/Desktop/ground-station-logs/*.txt
│   └── simulators/
│       └── mqtt_cubesat_simulator.py  # MQTT simulator — publishes protobuf frames
│
├── Dockerfile               # Multi-stage build: Node → Python 3.12
├── LICENSE
├── README.md
├── system-architecture.drawio  # draw.io diagram: RFD900x → Jetson → Ground Station (B/W, English)
└── telemetry.csv            # Real flight data (ICARUS2, 2025-08-14, 7,681 rows @ 1 s)
```

---

## Application Routes

| Route | Component | Description |
|---|---|---|
| `/` | redirect | Redirects to `/station` |
| `/station` | `StationDashboard` | Operator view: Cesium map + configurable left column (charts + terminals) |
| `/vueGlobe3d` | `TelemetryDashboard` | 3D Cesium globe, trajectory, stats bar |
| `/analyse` | `AnalyseDashboard` | Fully configurable Recharts grid |
| `/cubesat` | `CubeSatDashboard` | Annotated CubeSat image, subsystems, telemetry |
| `/rapport` | `RapportDashboard` | PDF export only — renders the two hardcoded `/station` charts (Altitude, Speed) + all `/analyse` charts, single "Export PDF" button (`window.print()`) |

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

## /station — Stats Bar Row

The top row of the right column is a horizontal flex container with two children:

- **TelemetryStatsBar** (flex: 1) — 8 fixed-width cards:

  | Card | Key | Width | Colour |
  |---|---|---|---|
  | ALTITUDE | `U_Alt` | 80 px | green |
  | DISTANCE | computed | 80 px | blue |
  | VITESSE | `Speed` | 80 px | orange |
  | GPS SAT | `#_Sat` | 60 px | purple |
  | PRESSION | `Pressure` | 80 px | cyan |
  | LINK BDG | `_bilan` | 80 px | #22d3ee |
  | STATUS | — | 80 px | green |
  | SOURCE | MQTT state | 75 px | green/orange/grey |

  Cards have a fixed max-width and never grow. `valueFontSize()` shrinks the value
  text (12 → 10 → 9 → 8 px) when the string is longer than 8 characters so values
  always fit without overflow. Cards have `pointer-events: none` — no hover effect.

- **TelemetryTerminal variant="errors"** (width: 25vw) — hardcoded errors terminal
  always visible at the far right of the stats row, same width as the left column.
  Not part of the configurable left column — always present in `/station`.

---

## /station — Left Column Panel System

The left column (25% width) is fully configurable by the operator via the **Modifier** menu:

- **Chart panels** — any X/Y field combination from `AVAILABLE_FIELDS`; draggable, deletable, starred (synced with `/analyse` favorites). A newly created chart picks a **random** color from `CHART_COLORS` (no longer always green) — same behavior in `/analyse`'s `addChart`.
- **Terminal panels** — three variants, at most one of each. Each variant caps its
  retained lines to avoid DOM/render lag and to fit without a scrollbar:
  `telemetry` → 5 lines, `verbose` → 1 line, `errors` → 500 lines (kept long since
  errors are rare). The oldest lines are evicted (`slice(-maxLines)`).
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

### Empty-state status block (all three terminals)

Instead of a bare "aucune télémétrie", when a terminal has **no lines** it renders
a live **station status block** (`StationStatus` in `telemetryTerminal.jsx`), so the
operator can tell *why* nothing is arriving. Every terminal polls `GET /api/status`
every 2 s and shows three colour-coded rows + a hint:

- **Broker** — ✓ connecté / ✗ NON connecté à `<host:port>` (from the backend's
  `_broker_connected`, set in the MQTT `on_connect`/`on_disconnect` callbacks).
- **Télémétrie** — ✓ active / ✗ aucune trame, with frame count and age of the last
  frame (`last_frame_age_sec`).
- **RFD** — ✓ branché / ✗ non branché / ? inconnu. Derived server-side: `connected`
  if telemetry is flowing, `disconnected` if the most recent bridge-log line (< 15 s)
  is an RFD-not-found message, else `unknown`.
- A **hint** line tailored to the state (`gss start <ip>` if the broker is down,
  "brancher le RFD" if disconnected, "en attente de trames" if just idle).

All terminal state (`lines`, processing `cursor`, `inBlackout` flag) lives in
the Redux `telemetry.terminalState` slice keyed by variant. Lines and cursor
survive route unmount/remount — switching to `/analyse` and back no longer
empties the errors log. The processing cursor advances per dispatched batch so
remounted terminals replay only new frames, never re-emitting past lines.

Configuration persisted in `localStorage` (`station_left_column_config`). Favorite charts synced with `/analyse` via `analyse_charts_config`.

**Default when empty** — `loadLeftColumnItems()` falls back to `DEFAULT_LEFT_COL_ITEMS` (a **telemetry** terminal + a **verbose** terminal) whenever there is no saved config *and* no `/analyse` favorites. So a fresh operator (or one who cleared the column and reloaded) always gets the live stream + the status block instead of a blank column. A saved non-empty config or favorites take precedence.

### All Temp shortcut (/station and /analyse)

Both the `/station` Modifier panel and the `/analyse` edit toolbar have an **All Temp** button next to "+ Series". Clicking it adds T1–T8 (all 8 temperature fields) to `newLines` at once, each with a distinct color from `CHART_COLORS`. The button is disabled once all temperature fields are already in the form. `TEMP_FIELD_KEYS` is exported from `chart-fields.js`.

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
in Redux). The injection skips while `mqttPausedRef.current === true` (a
leftover guard from the removed manual-blackout simulation — nothing pauses
the poll anymore, so it is effectively always false). The MQTT poll itself keeps
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

**Backend watchdog** — the detection above is frontend-only, so it never reaches
the backend log. A server-side watchdog in `mqtt_telemetry_receiver.py` mirrors
it: `on_message` stamps `_last_frame_at`, and a 1 Hz thread logs a **WARNING**
`[RPI_DISCONNECTED] télémétrie non reçue` once no frame has arrived for
`MQTT_FRAME_TIMEOUT_SEC` (3 s), plus an INFO `[TELEMETRY_RESUMED]` when frames
return. Because it is a WARNING, the disconnect now also surfaces in
`gss debug` — not just the frontend errors terminal. It only fires after the
first frame (a never-yet-connected start is not an outage).

---

## Bridge Log Forwarding (Pi errors → errors terminal)

The Pi-side UART→MQTT bridge (`uart_mqtt_bridge_rfd.py` on `gs-modem`) forwards its
**error/warning terminal output** to the ground station so the operator sees Pi
problems (serial port lost, parse/skip errors, reconnects) without SSHing into the
Pi. It reuses the existing broker — no extra ports.

```
Pi bridge  ──publish──►  MQTT topic icarus2/bridge/log   (JSON {ts, level, source, msg})
                              │
mqtt_telemetry_receiver.py    │  on_message routes the log topic to _handle_bridge_log
  └─► bridge_log_store (deque maxlen 500, monotonic id)
        └─► logger.warning("[BRIDGE:gs-modem] …")   → also surfaces in `gss debug`
        └─► GET /api/bridge/logs?after=<id>  ──►
                                                 │
                                                 ▼
                          telemetryTerminal.jsx (variant="errors")
                            polls every 2 s with the last seen id (persisted in
                            Redux terminalState.errors.bridgeLogId so route
                            changes don't duplicate; F5 re-fetches the buffer once)
                            → red [gs-modem] lines (WARN = amber, ERROR = red)
```

- **Pi side** — a `print()` shadow in the bridge publishes any line containing an
  error/warning hint (`error`, `skipped`, `fail`, `exception`, `reconnect`, …) to
  `icarus2/bridge/log`. Errors-only by design — per-frame info lines are not sent.
  The publish is wrapped in `try/except` so it never affects the bridge.
- **Backend** — `_handle_bridge_log` parses the JSON (falls back to raw text),
  stores it in `bridge_log_store`, and logs a WARNING. The store is independent of
  the 5000-frame telemetry deque. Two refinements keep the feed readable:
  - **Humanize** — `_humanize_bridge_message` rewrites the bridge's raw serial-open
    failure (`Serial error: … could not open port /dev/ttyUSB0: No such file …`,
    printed every 3 s while the RFD's USB adapter is unplugged) into a clear
    **`[RFD_DISCONNECTED] RFD non branché sur le Pi (/dev/ttyUSB0 introuvable)`**.
  - **Dedup** — `bridge_log_store.add_log` suppresses consecutive identical lines
    within `_DEDUP_WINDOW_SEC` (60 s) and returns `None`, so the 3 s reconnect
    loop collapses to one line (re-shown at most once per minute while it
    persists). The WARNING mirror is gated on a non-`None` return, so `gss debug`
    isn't flooded either.
- **Frontend** — the errors terminal merges these into the same 500-line buffer as
  its telemetry-derived anomalies. (The per-terminal **CLR** button was removed —
  it didn't reliably clear, and lines self-cap at their per-variant limit anyway.)

---

## Topbar Widgets (global)

`topbar-widgets.jsx` renders a cluster of global, route-independent widgets in
the `AppBar` (between the title and the per-page action `node`). All four tick
off a single shared 1 Hz interval (`useNow`):

- **Heure** — live local clock (`fr-CA`, 24 h) with the date underneath.
- **Météo** — current temperature + a WMO-code-mapped icon/label (Dégagé,
  Couvert, Pluie, Neige, Orage…).
- **Vent** — wind speed (km/h) + 8-point compass direction (N, NE, E, SE, S,
  SO, O, NO).
- **Décompte T** — launch countdown. When no launch time is set (or when the
  operator clicks the widget) it shows a native `datetime-local` picker; once
  validated, the chosen instant is persisted to `localStorage`
  (`launch_datetime`) and the widget shows a live `T- HH:MM:SS` countdown that
  flips to `T+ …` after launch (with a `Nj` day prefix beyond 24 h). Clicking
  the countdown re-opens the picker.

**Weather/wind data source** — Météo and Vent share one fetch in `useWeather()`
against **Open-Meteo** (keyless), using the ground-station lat/lon from
`loadGroundStationPosition()`. Refreshed every 10 min. To use a different
provider, swap the single `fetchWeather()` function — it only has to resolve to
`{ tempC, windKmh, windDir, code }`.

> The manual **"Simuler coupure"** blackout button was removed from the topbar.
> Real-outage detection and its red ghost-line rendering are unchanged — see
> [Real Outage Detection](#real-outage-detection-all-routes). The hook still
> exports `pauseMqtt` / `resumeMqtt`, now unused.

---

## Ground Station Position

Configurable via the **"Position GS ▼"** button in the Cesium right-panel (both `/station` and `/vueGlobe3d`):

- Persisted in `localStorage` under key `station_ground_station_position`
- Shared between both routes via `loadGroundStationPosition()` / `saveGroundStationPosition()` from `cesium-utils.js`
- Default: `{ lat: 48.55, lon: -81.35 }` (ICARUS2 launch site)
- Cesium entity: green dot + "GS" label, always visible regardless of telemetry state
- Link beam (green line) drawn from GS position to current CubeSat position

## Cesium — Suivre CubeSat (Follow Mode)

The **"Suivre CubeSat"** toggle in the Cesium right-panel locks the camera on the current CubeSat position, updated every 1 s.

- **Follow height**: `MAP_FOLLOW_CAMERA_HEIGHT = 27000` m (27 km) — 70% more zoomed than the previous 90 km follow height (90 000 × 0.30), i.e. ~6.7× the default free-camera height (180 km).
- The camera uses `Math.min(cameraHeightRef.current, MAP_FOLLOW_CAMERA_HEIGHT)`: if the operator is already closer than 27 km the tighter zoom is preserved; if further away the camera snaps to 27 km on the next frame.
- Pitch and heading stay at the same angles as free-camera (`MAP_CAMERA_PITCH = −48°`, `MAP_CAMERA_HEADING = 32°`).

## /rapport — Legend Deduplication

When a chart contains blackout frames, each Y series is split into a `_normal` line and a `_ghost` (red) line. The Recharts `<Legend>` would otherwise list both under the same label. Ghost `<Line>` elements carry `legendType="none"` so only the normal (coloured) series appear in the legend.

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
| `GET` | `/api/bridge/logs?after=<id>` | Error/warning lines forwarded by the Pi bridge (incremental by id) |
| `GET` | `/api/status` | Aggregate operator status: broker connected?, telemetry active?, RFD connected? (drives the terminals' empty-state status block) |
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

### `gss` CLI (shortcut wrapper)

`tools/dev/gss` is a thin convenience wrapper around `start-local.sh` and the dev
logs. Install once by symlinking it onto the `PATH`
(`ln -sf "$PWD/tools/dev/gss" ~/.local/bin/gss`); thereafter:

| Command | Effect |
|---|---|
| `gss start [ip]` | `start-local.sh -Restart -BrokerHost <ip>` (cloud sync on). No ip / `defaut` → `10.180.97.23` |
| `gss startoffline [ip]` | Same, but `-Offline` (Google Sheet sync forced off; local CSV still written) |
| `gss kill` | Kill whatever listens on the backend/frontend ports |
| `gss verbose [all\|front]` | `tail -f` the **backend** log (`all` = + frontend, `front` = frontend only) |
| `gss debug` | Show recent error/warning lines from the backend log |
| `gss help` | List the commands |

The script resolves its own real path (via the symlink) to locate
`start-local.sh`, so it works from any directory. **Named `gss`, not `gs` —**
`gs` is Ghostscript, a standard system binary we must not shadow.

### Direct invocation

**Standard launch with Raspberry Pi 4B broker (live hardware):**

```bash
./tools/dev/start-local.sh -Restart -Mqtt -BrokerHost 10.180.97.70
```

The RPi (`gs-modem`, IP `10.180.97.70`) must have `uart_mqtt_bridge.py` running and its mosquitto broker accessible (`listener 1883`, `allow_anonymous true`). The backend connects directly to the RPi's broker — no local mosquitto needed.

**Simulator-only (no hardware):**

```bash
./tools/dev/start-local.sh -Restart -Mqtt -Simulator
```

| Option | Effect |
|---|---|
| `-Restart` | Kills processes on backend/frontend ports before restarting |
| `-Offline` | Forces the cloud Google Sheet sync off (overrides `local.env`); local CSV unaffected |
| `-Mqtt` | Starts local Mosquitto broker (port 1883) |
| `-Simulator` | Runs `mqtt_cubesat_simulator.py` (publishes CSV frames over MQTT) |
| `-BrokerHost <ip>` | Use an external MQTT broker (e.g. the Raspberry Pi 4B) |
| `-BackendPort <p>` | Override backend port (default 5000) |
| `-FrontendPort <p>` | Override frontend port (default 5173) |

#### Process detachment & logs

The backend (uvicorn) and frontend (vite) are launched with `nohup … &` + `disown`
and their stdout/stderr is redirected to per-service `.txt` log files in a folder
on the Desktop: `~/Desktop/ground-station-logs/` (`ground-station-backend.txt`,
`ground-station-frontend.txt`). Override the location with `GS_LOG_DIR`. This
keeps the interactive prompt usable — previously the processes wrote straight to
the terminal, burying keystrokes and making it look frozen. On startup the script
prints only the Vite "ready in … ms" line (grepped from the frontend log);
everything else stays in the log files. Because the processes are detached,
**Ctrl+C no longer stops them** — use `gss kill` / `-Restart` (which kills
whatever is listening on the backend/frontend ports) or `kill <PID>` with the
PIDs printed at launch. Follow logs anytime with `gss verbose` or
`tail -f ~/Desktop/ground-station-logs/*.txt`.

### Running the backend manually (without the script)

```bash
cd backend
MQTT_TELEMETRY_ENABLED=1 MQTT_BROKER_HOST=10.180.97.70 .venv/bin/python app.py
```

Poetry creates the virtualenv at `backend/.venv` (`virtualenvs.in-project = true` in `poetry.toml`). Run `poetry install` once inside `backend/` to create it.

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
| `MQTT_BRIDGE_LOG_TOPIC` | `icarus2/bridge/log` | Topic the Pi bridge publishes error/warning lines to |
| `MQTT_BRIDGE_LOG_MAXLEN` | `500` | Max bridge log lines kept in backend ring buffer |
| `MQTT_TELEMETRY_STORE_MAXLEN` | `5000` | Max frames kept in backend store |
| `MQTT_FRAME_TIMEOUT_SEC` | `3` | Backend watchdog: log `[RPI_DISCONNECTED]` after this many seconds without a frame |
| `TELEMETRY_CSV_LOG_ENABLED` | `1` | Append each received frame to a local CSV (`0` to disable) |
| `TELEMETRY_CSV_DIR` | `~/Desktop/telemetry` | Folder of per-day CSV logs (`<date>.csv`) |
| `SHEETS_SYNC_ENABLED` | `0` | Push frames to a Google Sheet (`1` + a URL to enable) |
| `SHEETS_WEBAPP_URL` | (empty) | Apps Script Web App `/exec` URL to POST batches to |
| `SHEETS_SYNC_INTERVAL_SEC` | `5` | Seconds between batched Sheet flushes |

---

## Local CSV capture + Google Drive sync

Every frame received over MQTT is appended to a local CSV by
`pipeline/telemetry_csv_logger.py` (called from the receiver's `on_message`,
right after `telemetry_store.add_frame`). This is **independent** of the
in-memory 5000-frame deque — the deque is the live display window, the CSV is a
durable per-day capture.

- **Per-day files** — one file per local calendar day, named by the date
  (`<YYYY-MM-DD>.csv`), so the local archive mirrors the Sheet's per-day tabs.
  The logger rotates to a new file at midnight; the header is written once per
  new file.
- **Format** — identical header/columns to the canonical ICARUS2 recording
  (`m-time, Flight ID, Ublox UTC, U Lat, U Long, U Alt, Speed, Vert speed,
  #Sat, Pressure, MIU, T1…T8`), so the captured log is interchangeable with the
  original flight data.
- **Location** — `TELEMETRY_CSV_DIR`, default `~/Desktop/telemetry/` (outside
  the repo so it is never committed). Disable with `TELEMETRY_CSV_LOG_ENABLED=0`.
- **Durability** — each row is `flush()`ed immediately so an external mirror
  tool always sees the latest data. A single open failure latches logging off
  (no per-second error spam); the rest of the pipeline is unaffected.

### Mirroring to Google Drive (rclone)

Google has no native Drive client for Linux, so the CSV is pushed with
[`rclone`](https://rclone.org). One-time setup:

```bash
sudo apt install rclone
rclone config            # new remote → "drive" → authorize in browser → name it "gdrive"
```

Then mirror the capture folder on a schedule (push-only, every 30 s shown here);
`rclone copy` of the directory uploads every per-day file, re-sending only those
that changed:

```bash
while true; do
  rclone copy ~/Desktop/telemetry gdrive:GroundStation/
  sleep 30
done
```

For an unattended setup, use a **systemd timer** or cron instead of the loop, or
`rclone bisync` for two-way sync. `rclone copy` re-uploads only when the file
changed, so a frequent interval is cheap.

---

## Live Google Sheet sync (Apps Script Web App)

As an alternative to the CSV-file mirror, `pipeline/telemetry_sheets_sync.py`
pushes frames **directly into a Google Sheet**. It is wired into `on_message`
next to the CSV logger and runs independently.

- **Batching** — frames are buffered and flushed in one HTTP POST every
  `SHEETS_SYNC_INTERVAL_SEC` (default 5 s), not one request per frame, to stay
  under Apps Script quotas. The buffer is capped at 5000 rows (oldest dropped
  under sustained backpressure). A failed flush re-queues its rows and retries
  on the next tick — transient network/Apps Script errors don't lose data.
- **Per-day tabs** — each batch carries a `tab` field set to the local date
  (`YYYY-MM-DD`). The Web App writes to that tab, creating it (with the header)
  on first use. This keeps each tab small/fast and bounds growth against the
  10 M-cell spreadsheet cap (~526 k rows total across tabs); old tabs can be
  archived/deleted. The **local CSV remains the full, unbounded archive.**
- **No backend credentials** — the Web App runs as the sheet owner, so the
  backend only needs the deploy URL; it POSTs `{ header, values }` as JSON with
  the standard library (`urllib`, no extra dependency). The header row is sent
  every batch but the script writes it only when the sheet is empty.
- **Config** — `SHEETS_SYNC_ENABLED=1` + `SHEETS_WEBAPP_URL=<…/exec>`. Both are
  passed through by `start-local.sh` (export them before launch).

**Apps Script side** (paste in the sheet → Extensions → Apps Script, then
Deploy → New deployment → *Web app* → Execute as *Me* → Access *Anyone* → copy
the `/exec` URL):

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var body = JSON.parse(e.postData.contents);
    var rows = body.values || [];
    var tabName = body.tab || ss.getSheets()[0].getName();
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    if (sheet.getLastRow() === 0 && body.header) sheet.appendRow(body.header);
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, tab: tabName, added: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

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
