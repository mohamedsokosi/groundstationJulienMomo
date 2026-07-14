# Documentation - Ground Station (SAFARI / ICARUS2)

**Complete** documentation of the ground station: overview, installation, usage,
features, internal technical architecture, telemetry backup, environment
variables, Docker and troubleshooting.

> To get started in 2 minutes, see **[README.md](README.md)**. This document is the
> detailed reference covering the whole codebase.

---

## 1. Overview

**Real-time** web ground-station application for tracking a stratospheric balloon
/ CubeSat (the **ICARUS2** project). Telemetry arrives live over **MQTT**, is
displayed on a **Cesium** 3D globe and charts, and is archived **locally** (CSV)
and in the **cloud** (Google Sheet).

**Stack:** FastAPI + Python (backend) · React + Redux + Cesium (frontend) ·
MQTT (live telemetry) · Protocol Buffers (transport).

---

## 2. `gss` commands

`tools/dev/gss` is a convenience wrapper around `start-local.sh` and the dev logs.
Installed once via a symlink on the `PATH`, it can be used from anywhere.

```
gss, Ground Station CLI

  gss start [ip]          Start the station (cloud upload enabled).  Default: 10.180.97.23
  gss start default       Start with the default IP (10.180.97.23)
  gss startoffline [ip]   Start WITHOUT cloud upload (Google Sheet disabled)
  gss simulation [csv]    Replay a CSV as live telemetry (local broker, offline)
  gss simulation fast     Same, but 20x faster (0.01s per frame)
  gss simulation fast <N> Same, Nx faster (N in ]0, 50]; e.g. fast 5, fast 10)
  gss simulation corrupt  Same, but injects faults every 50 frames to rehearse
                          failures: corrupt, truncate, garbage, empty, drop,
                          duplicate, outoforder, outofrange, badgeojson
  gss simulation corrupt <list>  Only those faults (e.g. corrupt drop,truncate)
  gss kill                Stop the station (backend + frontend)
  gss verbose [all|front] Follow the backend log live (all = +frontend)
  gss debug               Show recent errors / warnings
  gss help                Show this help

After start / startoffline / simulation, the terminal stays attached to the backend log:
  -> CTRL+C stops EVERYTHING (backend + frontend + simulator).
  -> GS_FOLLOW=0 gss start   keeps the old behaviour (returns to the prompt, station detached).

Examples:
  gss start 10.180.97.45      # broker on this IP
  gss start default           # default IP
  gss startoffline            # local only, no cloud
  gss simulation              # replay the ICARUS2 flight CSV (no hardware)
  gss simulation corrupt      # same + ALL fault types (launch-day rehearsal)
```

| Command | Effect |
|---|---|
| `gss start [ip]` | `start-local.sh -Restart -BrokerHost <ip>` (cloud sync ON). Without ip / `default` → `10.180.97.23`. **Resumes** the previous session's graphs (mission history survives a restart) unless the **Reset** button on `/rapport` was used |
| `gss startoffline [ip]` | Same but `-Offline` (Google Sheet sync forced OFF; local CSV still written) |
| `gss simulation [csv]` | Replays a CSV as live telemetry (local broker + simulator), **without hardware**. Offline and without local CSV capture. Default: the ICARUS2 flight CSV (`../Safari_GS_antenna/telemetrySender/src/telemetry.csv`). Requires `mosquitto`. **Each simulation start auto-resets the graphs** (a `gss start` resumes instead — see the session semantics in §7.2). |
| `gss simulation fast [csv]` | Same, but replay **20x faster** (`--delay 0.01` instead of `0.2`). |
| `gss simulation fast <N> [csv]` | Fast mode with multiplier **N** (`--delay 0.2/N`). N in `]0, 50]`. E.g. `gss simulation fast 10` = 10x, `fast 5` = 5x. `fast`, N and the CSV are accepted in any order. |
| `gss simulation corrupt [faults]` | Same replay, but the simulator **injects faults** into the MQTT stream (one every 50 frames, cycling) to **rehearse failure handling before a launch**. `corrupt` alone = all fault types; a comma list narrows it (e.g. `corrupt drop,truncate`). Composes with `fast N`. See **[§2.1](#21-fault-injection-gss-simulation-corrupt)**. |
| `gss kill` | Stop backend + frontend (+ the CubeSat simulator, which has no listening port) |
| `gss verbose [all\|front]` | `tail -f` of the **backend** log (`all` = + frontend, `front` = frontend only) |
| `gss debug` | Recent error/warning lines from the backend log |
| `gss help` | Show the help |

> **Named `gss`, not `gs`** - `gs` is Ghostscript, a standard system binary that
> must not be shadowed. The script resolves its own real path (via the symlink) to
> find `start-local.sh`, so it works from any directory.

### 2.1 Fault injection (`gss simulation corrupt`)

Launch-day rehearsal mode: the simulator replays the flight CSV **but
deliberately mangles the stream** so the station's failure handling can be
exercised without hardware. One fault every **50 frames**, cycling through the
enabled types; the RNG is **seeded** (default 42) so a run is reproducible.
Each injection prints a **banner** in the simulator log
(`~/Desktop/ground-station-logs/cubesat-simulator.txt`) stating what was sent
and the expected station reaction - the operator checks them off against the
frontend and `gss debug`.

| Fault | What is sent | Expected station reaction |
|---|---|---|
| `corrupt` | 1-3 random bits flipped in the payload | Backend logs `Failed to decode…` **or** the frame decodes with silently wrong values (realistic RF corruption - watch for a spike) |
| `truncate` | Payload cut mid-message | Backend logs `Failed to decode MQTT telemetry payload`, frame skipped, station keeps running |
| `garbage` | Random bytes, not protobuf at all | Same as `truncate` - no crash, next frame displays normally |
| `empty` | 0-byte payload | Decodes to an all-defaults frame (GPS 0,0, empty `mission_time`) - globe/charts must not break |
| `drop` | ~4.5 s of silence (all frames dropped) | Gap > 3 s → backend `[RPI_DISCONNECTED]` (visible in `gss debug`) + red ghost line, then `[TELEMETRY_RESUMED]` |
| `duplicate` | The exact same frame twice (QoS-1 redelivery) | Charts / local CSV / Google Sheet must not double-count |
| `outoforder` | Two consecutive frames swapped | X axis must not zigzag |
| `outofrange` | Decodes fine but **physically wrong** (rotating: GPS 0,0 + 0 sats, ~5000 km teleport, altitude −500 m / 99 999 m, all temps −999, zero quaternion, pressure 0, `mission_time` −2 h) | Globe must not teleport, chart axes must survive the spikes, 3D cube must not NaN out, errors terminal flags GPS/pressure anomalies |
| `badgeojson` | Fire zone with truncated JSON / a `Point` instead of a `Polygon` / a ~200 KB payload | Cesium must not crash; invalid zones silently skipped; the pipeline absorbs the oversized frame |

```bash
gss simulation corrupt              # all fault types, full rehearsal
gss simulation corrupt drop         # only the missing-frames outage
gss simulation corrupt drop,truncate,outofrange
gss simulation corrupt fast 5       # faults + 5x replay speed
tail -f ~/Desktop/ground-station-logs/cubesat-simulator.txt   # fault banners
```

Cadence/seed are tunable when running the simulator directly:
`mqtt_cubesat_simulator.py --faults all --fault-every 50 --fault-seed 42`.

---

## 3. Quick start & installation

### Prerequisites
- **Backend**: Python + [Poetry](https://python-poetry.org/).
- **Frontend**: Node.js.
- An accessible **MQTT broker** (the Raspberry Pi of the UART→MQTT bridge), **or**
  the built-in simulator (no hardware).

### Installation
```bash
# Backend (creates backend/.venv via Poetry - virtualenvs.in-project = true)
cd backend && poetry install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### Install the `gss` CLI (once)
```bash
ln -sf "$PWD/tools/dev/gss" ~/.local/bin/gss      # ~/.local/bin must be on the PATH
```
Then:
```bash
gss start default     # start, broker = 10.180.97.23, cloud sync ON
gss start <ip>        # broker on another IP
gss startoffline      # local only (no Google Sheet upload)
gss simulation        # replay the ICARUS2 flight CSV, no hardware
gss kill              # stop everything (backend + frontend)
```

Once running: **frontend** `http://localhost:5173` · **backend**
`http://localhost:5000`.

### Or directly via the `start-local.sh` script
```bash
# Live hardware (broker on the Raspberry Pi 4B)
./tools/dev/start-local.sh -Restart -BrokerHost 10.180.97.23

# Without hardware (simulator) - low-level equivalent of `gss simulation`
./tools/dev/start-local.sh -Restart -Mqtt -Simulator -Offline \
  -SimCsv ../Safari_GS_antenna/telemetrySender/src/telemetry.csv
```

| Option | Effect |
|---|---|
| `-Restart` | Kills the processes on the backend/frontend ports (+ simulator) before relaunching |
| `-Offline` | Forces the Google Sheet sync OFF (local CSV unaffected) |
| `-Mqtt` | Starts a local Mosquitto broker (port 1883) if `MQTT_HOST` is local and unreachable |
| `-Simulator` | Launches `mqtt_cubesat_simulator.py` (publishes test frames) |
| `-SimCsv <path>` | CSV replayed by the simulator (default `telemetry.csv`, relative to the repo root) |
| `-SimDelay <s>` | Delay between simulated frames (default `0.2`; `gss simulation fast` = 20x → `0.01`, `fast <N>` passes `0.2/N`) |
| `-SimFaults <spec>` | Fault types injected by the simulator (`all` or a comma list, e.g. `drop,truncate`). Empty = normal replay. Passed by `gss simulation corrupt` (see §2.1) |
| `-BrokerHost <ip>` | External MQTT broker (e.g. the Raspberry Pi 4B) |
| `-BackendPort <p>` / `-FrontendPort <p>` | Override the ports (default 5000 / 5173) |

### Local configuration (`local.env`)
Secrets/settings (e.g. the Google Sheet URL) go into `tools/dev/local.env`
(git-ignored), loaded automatically by `start-local.sh`:
```bash
SHEETS_SYNC_ENABLED=1
SHEETS_WEBAPP_URL="https://script.google.com/macros/s/XXXX/exec"
```

### Process detachment & logs
The backend (uvicorn) and frontend (vite) are launched with `nohup … &` +
`disown` and their outputs are redirected to per-service `.txt` files in
`~/Desktop/ground-station-logs/` (`ground-station-backend.txt`,
`ground-station-frontend.txt`). Location overridable via `GS_LOG_DIR`. This keeps
the interactive prompt usable - otherwise the uvicorn/vite logs would drown out
keystrokes.

The services stay detached, but **`gss start` / `startoffline` / `simulation`
then re-attach to the backend log** (equivalent of an automatic `gss verbose`) via
a foreground `tail -f` with a `SIGINT` trap. In that terminal, **`Ctrl+C` stops
the whole station** (the trap calls `cmd_kill`: backend + frontend + simulator).
From another terminal - or if launched with **`GS_FOLLOW=0`** (which keeps the old
behaviour: returns control immediately, station detached) - use `gss kill` /
`-Restart` (which kill whatever is listening on the backend/frontend ports).
Follow the logs with `gss verbose` or `tail -f ~/Desktop/ground-station-logs/*.txt`.

### Run the backend manually (without the script)
```bash
cd backend
MQTT_TELEMETRY_ENABLED=1 MQTT_BROKER_HOST=10.180.97.70 .venv/bin/python app.py
```
Poetry creates the virtualenv at `backend/.venv` (`virtualenvs.in-project = true`
in `poetry.toml`). Run `poetry install` once inside `backend/`.

---

## 4. Hardware pipeline

```
┌─────────────────────────┐
│   Raspberry Pi Pico     │  Replays the ICARUS2 flight data (7,681 records @ 1 s)
│   (telemetry emitter)   │  from an embedded CSV, CFDP-encapsulated over USB serial
└────────────┬────────────┘
             │  USB CDC - /dev/ttyACM0 (115200 baud)
             ▼
┌─────────────────────────┐
│   Raspberry Pi 4B       │  uart_mqtt_bridge.py: strips the CFDP header,
│   (gs-modem)            │  encodes to protobuf, publishes to the MQTT broker
└────────────┬────────────┘
             │  MQTT - topic: icarus2/telemetry/frame.pb (port 1883)
             ▼
┌─────────────────────────┐
│   Ground Station        │  FastAPI backend + React frontend
│   (this application)    │  displays the telemetry live
└─────────────────────────┘
```

The backend connects directly to the Pi's broker - no local mosquitto needed. The
Pi (`gs-modem`) must have `uart_mqtt_bridge.py` running and its mosquitto reachable
(`listener 1883`, `allow_anonymous true`).

---

## 5. Features

### Real-time visualization
- **Cesium 3D globe**: CubeSat trajectory, 3D CubeSat model oriented by the IMU,
  ground-station (GS) position, link beam, ground projection - updated at 1 Hz.
- **"Follow CubeSat" mode**: camera locked on the current position (zoom ~27 km).
- **GS position** configurable and persisted (shared across views).
- **Incremental** trajectory (perf: O(1) per refresh).
- **Forest-fire danger zones**: **irregular GeoJSON polygons** baked into the
  flight CSV (columns `Fire Level` / `Fire GeoJSON`) are carried in the telemetry;
  the ground station **draws what it receives** (no runtime generation or clipping).
  Colours - **red = extreme risk**, **orange = high risk**, **yellow = risk**.
  **"Fire zones"** toggle + legend in the Cesium right panel. Regenerable via
  `tools/simulators/generate_fire_zones.py`.

### Top bar (topbar)
- **Time** - live local clock.
- **Weather** + **Wind** - via Open-Meteo (no API key), based on the GS position.
- **T Countdown** - launch date/time picker → live **T- / T+** countdown.

The widget cluster sits to the **right of the per-page Export / Import / Edit
buttons** (when a page provides them), and left of the partner logos.

### Configurable `/station`
- **Chart panels**: any X/Y field pair, drag-and-drop, favorites (synced with
  `/analyse`), **All Temp** button (T1-T8 at once).
- **3D cube panel**: CubeSat attitude widget (`cubesat.glb` model) oriented live by
  the IMU quaternion.
- **Terminal panels**: `telemetry` / `verbose` / `errors`.
- Configuration **persisted** (localStorage), **JSON import/export**.

### Telemetry-outage detection
- **Frontend**: ghost red line + `[RPI_DISCONNECTED]` as soon as telemetry stops
  (> 3 s), `[TELEMETRY_RESUMED]` on return. Past outages are reconstructed on page
  refresh.
- **Backend**: watchdog that logs `[RPI_DISCONNECTED]` at **WARNING** → visible in
  `gss debug`.

### Telemetry backup (parallel, independent)
- **Per-day local CSV** on the Desktop: `~/Desktop/telemetry/<date>.csv`
  (same format as the ICARUS2 flight data, so reusable as-is).
- **Live Google Sheet**: one **tab per day** (named by the date), via an Apps
  Script Web App - no key/credential on the backend side.

### Tooling
- **`gss` CLI**: `start`, `startoffline`, `simulation`, `kill`, `verbose`, `debug`, `help`.
- **`.txt` logs** on the Desktop: `~/Desktop/ground-station-logs/`.

---

## 6. Pages & routes

| Route | Component | Role |
|---|---|---|
| `/` | redirect | Redirects to `/station` |
| `/station` | `StationDashboard` | Operator view: Cesium map + **configurable** left column (charts + 3D cube + terminals) + stats bar + errors terminal |
| `/vueGlobe3d` | `TelemetryDashboard` | Full-screen Cesium 3D globe (trajectory, stats) |
| `/analyse` | `AnalyseDashboard` | Fully configurable grid of Recharts charts |
| `/cubesat` | `CubeSatDashboard` | Annotated view of the CubeSat and its subsystems |
| `/rapport` | `RapportDashboard` | One-click **PDF** export of the charts (/station + /analyse) (`window.print()`) + **Reset data** button (confirmation dialog) — the manual way to clear a live session's graphs |

### Single MQTT data source
All routes consume live MQTT telemetry - the CSV/MQTT source selector was removed
from the topbar. The Redux `sourceMode` stays at its default value `'mqtt'`; the
`setSourceMode` action and the `parseTelemetryCsv` helper remain available for
future use but no UI changes the mode anymore.

---

## 7. Technical architecture

### 7.1 Repository structure

```
ground-station/
├── backend/                  # Python server (FastAPI) - Poetry
│   ├── app.py                # Entry point - starts Uvicorn
│   ├── logconfig.yaml        # Log configuration (colorlog)
│   ├── poetry.toml           # virtualenvs.in-project = true (.venv in backend/)
│   ├── server/
│   │   ├── startup.py        # FastAPI app, HTTP routes, CORS, static files
│   │   └── telemetry_protobuf.py  # Encode/decode Protocol Buffers
│   ├── pipeline/
│   │   ├── mqtt_telemetry_receiver.py  # paho MQTT client, topic icarus2/telemetry/frame.pb
│   │   ├── telemetry_store.py          # In-memory frame deque (maxlen 5000)
│   │   ├── telemetry_csv_logger.py     # Appends each MQTT frame to a per-day local CSV
│   │   └── telemetry_sheets_sync.py    # Batches frames → Google Sheet (Apps Script Web App)
│   └── common/
│       ├── arguments.py      # CLI parsing (host, port, log-level) + defaults
│       └── logger.py         # logging basicConfig (stdlib)
│
├── frontend/                 # React client (Vite)
│   ├── index.html            # HTML entry - favicon SAFARI.png
│   ├── vite.config.js        # Vite build + Cesium plugin + backend proxy
│   ├── package.json          # Deps: React, MUI, Redux, Cesium, Recharts, three
│   ├── public/               # Static assets
│   │   ├── SAFARI.png        # SAFARI logo (favicon)
│   │   ├── CSA.png / ETS.jpg / Lassena.png / seds.png  # Partner logos (topbar)
│   │   ├── cubesat.png       # CubeSat image
│   │   └── cubesat.glb       # CubeSat 3D model (live attitude + map)
│   └── src/
│       ├── main.jsx                  # React root - router + Redux Provider
│       ├── App.jsx                   # ThemeProvider + CssBaseline
│       ├── theme.js / theme-configs.js  # MUI dark theme + palette
│       ├── store.jsx                 # Redux store (telemetry slice)
│       ├── layout.jsx                # Topbar + hover-expand sidebar + <Outlet>
│       ├── topbar-widgets.jsx        # Topbar widgets: Time, Weather + Wind, T Countdown
│       ├── navigation.jsx            # Sidebar definition (5 routes)
│       ├── page-actions-context.jsx  # Per-page action-button context
│       ├── error-page.jsx            # Error page
│       └── pages/
│           ├── station/station-dashboard.jsx      # /station - MQTT operator view
│           ├── vueGlobe3d/telemetry-dashboard.jsx # /vueGlobe3d - Cesium globe
│           ├── analyse/analyse-dashboard.jsx      # /analyse - chart grid
│           ├── cubesat/                           # /cubesat - annotated view + subsystems
│           │   ├── cubesat-dashboard.jsx
│           │   ├── cubesat-annotated-visual.jsx
│           │   ├── cubesat-subsystem-panel.jsx
│           │   ├── cubesat-config.js
│           │   └── cubesat-utils.js
│           ├── rapport/rapport-dashboard.jsx      # /rapport - PDF export
│           └── shared/                            # Shared components and utilities
│               ├── cesiumViewport.jsx         # Cesium globe + right panel (zoom, GS position, CubeSat model)
│               ├── attitudeCube.jsx           # 3D attitude widget (three.js, IMU quaternion)
│               ├── telemetryChart.jsx         # Recharts chart (decimated to 800 pts)
│               ├── telemetryStatsBar.jsx      # Stats bar (8 cards)
│               ├── telemetryTerminal.jsx      # Raw-stream terminal (telemetry/verbose/errors)
│               ├── chartTitle.jsx             # Dynamic title
│               ├── telemetry-components.jsx   # StatisticCard, ChartCard, TelemetrySummary
│               ├── telemetry-slice.jsx        # Redux slice - telemetry data (sourceMode: mqtt)
│               ├── use-telemetry-stream.jsx   # Hook - load, playback, incremental MQTT poll
│               ├── telemetry-data-source.js   # CSV/Protobuf parsing, 5000 display limit
│               ├── telemetry-protobuf.js      # Protobuf decoding
│               ├── telemetry-utils.js         # distanceKm, getMqttSourceStat, helpers
│               ├── cesium-utils.js            # geo record, imagery, GS position, follow height
│               ├── chart-fields.js            # AVAILABLE_FIELDS, TEMP_FIELD_KEYS
│               ├── chart-logic.js             # FSPL, link budget, enrich()
│               ├── telemetry-worker.js        # Web Worker - buildTelemetryChartData + enrich off-thread
│               ├── useAnimatedDomain.js       # Smooth axis animation
│               └── ground-station-view.css    # Global styles (stats bar, globe)
│
├── tools/
│   ├── dev/
│   │   ├── gss              # CLI (wrapper of start-local.sh)
│   │   ├── start-local.sh   # Local startup (MQTT, Simulator, Restart, BrokerHost…)
│   │   └── local.env        # Secrets/overrides (git-ignored)
│   └── simulators/
│       ├── mqtt_cubesat_simulator.py  # MQTT simulator - replays the CSV as protobuf frames (+ --faults injection, §2.1)
│       └── generate_fire_zones.py     # One-shot - bakes the GeoJSON fire zones into telemetry.csv
│
├── Dockerfile               # Multi-stage build: Node → Python 3.12
├── LICENSE
├── Documentation.md         # This document
├── README.md                # Quick-start manual
└── system-architecture.drawio  # draw.io diagram (RFD900x → Jetson → Ground Station)
```

The canonical ICARUS2 flight CSV (7,681 rows @ 1 s) is **not** in this repo; it is
replayed by the simulator from
`../Safari_GS_antenna/telemetrySender/src/telemetry.csv`.

### 7.2 Data flow

#### Telemetry (live MQTT - default for all routes)

```
Pico (USB /dev/ttyACM0) → Raspberry Pi 4B
  └─► uart_mqtt_bridge.py
        └─► MQTT broker :1883
              └─► mqtt_telemetry_receiver.py (daemon)
                    └─► telemetry_store (deque maxlen 5000)
                         └─► GET /api/telemetry/mqtt/frames ──►
                                                              ▼
                                         use-telemetry-stream.jsx (hook)
                                           poll every 1 s
                                           change detection by content fingerprint
                                           (detects the sliding window when the deque is full)
                                           stamps _epoch_ms on every frame at session
                                           start so the X axis doesn't drift when the
                                           5000-frame window slides
                                           initial load → setTelemetryData (all frames)
                                           incremental → appendTelemetryPoints (batched,
                                           one Redux update per poll instead of one per frame)
                                                              ▼
                                         buildTelemetryChartData()
                                           _elapsed_s / _elapsed_min ← m-time (protobuf field)
                                           GPS, altitude, speed, temperatures
                                                              ▼
                                         enrich() (chart-logic.js)
                                           _fspl     ← Free Space Path Loss
                                           _bilan    ← Link budget (dBm)
                                           _distance ← vertical distance (m)
                                                              ▼
                                         TelemetryChart (≤800 decimated pts)
                                         CesiumViewport (incremental trajectory)
                                         TelemetryStatsBar
```

#### Resume on route change (MQTT)

Navigating between MQTT routes (e.g. `/station` → `/analyse` → `/station`)
unmounts and remounts the page component, including its `useTelemetryStream` hook.
The MQTT effect:

- **Cleanup** clears only the poll interval, NOT the Redux telemetry data - the
  Redux state is the source of truth and survives unmount.
- **Mount** reads `telemetry.telemetryData` from Redux. If MQTT-shaped data exists
  (frames with `_epoch_ms`), it seeds the `live` poll context with `shownCount = -1`
  (sentinel) and `lastRowKey` derived from the last REAL (non-blackout) frame. The
  first poll looks up that key in the backend deque to find the resume point,
  dispatches only the rows that arrived since, and preserves the outage ghost
  frames in place. If the key is not found (deque rolled past, or backend
  restarted), clean fallback: `clearTelemetryData()` + initial load.
- **`keepMonotonicSuffix`** is applied to the backend rows on initial load. The
  Pico firmware loops its CSV from line 1 after each full pass - so the 5000-frame
  deque can contain frames from two consecutive cycles with a backward jump of
  `mission_time` (~2 h) at the boundary. Without trimming, the chart would zigzag
  after a refresh because `_epoch_ms` is anchored to the FIRST (oldest) frame of the
  deque. The helper walks back through the real frames (ignoring ghosts) and returns
  the longest tail where `mission_time` is non-decreasing; the epoch is re-derived
  from the first kept frame.
- An `isMounted` flag per effect closure guards against late dispatches if the user
  navigates during an in-flight `fetch`.

#### Session semantics: simulations reset, live sessions resume

The backend stamps every frames response with two headers: **`X-GS-Boot-Id`** (a
uuid regenerated on every backend start) and **`X-GS-Session-Mode`**
(`simulation` when launched with `-Simulator`, else `live` — via the
`GS_SESSION_MODE` env var set by `start-local.sh`). The poll hook compares the
boot id with the one this tab last saw (`gs_seen_boot_id` in sessionStorage):

- **New SIMULATION boot** → **automatic full reset**: Redux telemetry, the
  sessionStorage snapshot and the poll counters are wiped, then the new replay
  loads from scratch. Every `gss simulation …` therefore starts with clean
  graphs — no mixing of two replays.
- **New LIVE boot** (`gss start` / `startoffline`) → **resume**: the charts keep
  the previous session's history; the hook re-enters the merge-by-`mission_time`
  path so only genuinely newer frames are appended, with the red ghost line
  covering the gap. A mid-flight backend restart never costs the operator their
  mission history. (This also applies to a live backend whose deque comes back
  empty: the frontend keeps its data and waits.)
- **Manual reset** — the **Reset data** button on `/rapport` (with a
  confirmation dialog) is the only way to clear a live session: it POSTs
  `/api/telemetry/mqtt/clear`, removes the tab's snapshot (persistence is
  suppressed during the unload so the `beforeunload` flush can't resurrect the
  data) and reloads the page.

### 7.3 `/station` - stats bar

The top row of the right column is a horizontal flex container:

- **TelemetryStatsBar** (flex: 1) - 7 fixed-width cards:

  | Card | Key | Width | Accent colour |
  |---|---|---|---|
  | ALTITUDE | `U_Alt` | 80 px | green `#9ece6a` |
  | DISTANCE | computed | 80 px | blue `#7aa2f7` |
  | SPEED | `Speed` | 80 px | coral `#f7768e` |
  | GPS SAT | `#_Sat` | 60 px | lavender `#bb9af7` |
  | PRESSURE | `Pressure` | 80 px | sky `#7dcfff` |
  | LINK BDG | `_bilan` | 80 px | gold `#e0af68` |
  | SOURCE | MQTT state | 75 px | teal / gold / slate (depending on state) |

  **Style: outlined tiles** - the card interior keeps the **page background**
  (`--mui-palette-background-default`, `#0d0f13`, like the bar); the accent colour
  (`--gs-stat-accent`) colours only the **border** (`border: 1px solid`) and the
  **text** (muted label, full-strength value). No fill, no gradient, no side stripe.
  The palette is **harmonized** (a single tone family, not a rainbow). The cards
  have a fixed max width and never grow. `valueFontSize()` shrinks the text size
  (12 → 10 → 9 → 8 px) when the value exceeds 8 characters so it always fits without
  overflow. `pointer-events: none` - no hover effect.

- **TelemetryTerminal variant="errors"** (width 25vw) - errors terminal always
  visible at the far right, same width as the left column.

### 7.4 `/station` - left-column panel system

The left column (25%) is fully configurable via the **Edit** menu:

- **Chart panels** - any X/Y pair from `AVAILABLE_FIELDS`; movable, deletable,
  favoritable (synced with the `/analyse` favorites). A new chart takes a **random**
  colour from `CHART_COLORS`.
- **3D cube panel** (`type: 'cube'`, component `AttitudeCube`) - 3D CubeSat model
  (`public/cubesat.glb`, three.js + GLTFLoader) oriented live by the IMU quaternion
  (`Quat_w/x/y/z`). Rendered **on demand** (only when the model moves), because
  Cesium already renders the globe continuously on the same page.
- **Terminal panels** - three variants, at most one of each. Each variant caps its
  retained lines (`slice(-maxLines)`) to avoid lag: `telemetry` → 5 lines, `verbose`
  → 1 line, `errors` → 500 lines.
  - `telemetry` - key telemetry fields, green
  - `verbose` - all non-internal fields, yellow
  - `errors` - anomaly detection (GPS lost, few satellites, missing
    altitude/pressure) + outage transitions: **one** `[RPI_DISCONNECTED]` line at the
    start of a real Pi/broker outage, **one** `[BLACKOUT_SIM]` line at the start of a
    manual simulation, **one** `[TELEMETRY_RESUMED]` line in **green** (`#59d98b`) when
    real frames return.

#### "Station status" block (terminals' empty state)

When a terminal has **no lines**, it renders a **live station-status block**
(`StationStatus` in `telemetryTerminal.jsx`) so the operator knows *why* nothing is
arriving. Each terminal polls `GET /api/status` every 2 s:

- **Broker** - ✓ connected / ✗ NOT connected to `<host:port>` (from
  `_broker_connected`, set in the MQTT `on_connect`/`on_disconnect` callbacks).
- **Telemetry** - ✓ active / ✗ no frame, with frame count and age of the last one
  (`last_frame_age_sec`).
- **RFD** - ✓ plugged in / ✗ not plugged in / ? unknown. Derived server-side.
- A **hint** line adapted to the state (`gss start <ip>` if broker down, "plug in the
  RFD" if disconnected, "waiting for frames" if idle).

All terminal state (`lines`, `cursor`, `inBlackout`) lives in the Redux slice
`telemetry.terminalState` per variant, and survives route unmount/remount. The
processing cursor advances by dispatched batch so remounted terminals only replay
new frames.

**Default when empty** - `loadLeftColumnItems()` falls back to
`DEFAULT_LEFT_COL_ITEMS` (a **telemetry** terminal + a **verbose** terminal) when
there is neither a saved config nor `/analyse` favorites. Config persisted in
`localStorage` (`station_left_column_config`); favorites synced with `/analyse` via
`analyse_charts_config`.

#### All Temp shortcut (`/station` and `/analyse`)
The **All Temp** button adds T1-T8 (the 8 temperature fields) at once, each with a
distinct colour from `CHART_COLORS`. Disabled once all are present.
`TEMP_FIELD_KEYS` is exported from `chart-fields.js`.

### 7.5 Real-outage detection (all routes)

A real outage (Pi unplugged, broker unreachable) is detected from the frontend in
two complementary ways.

**Live detection** - centralized in `useTelemetryStream` so every consumer
(`/station`, `/analyse`, `/vueGlobe3d`…) gets the ghost red line without
reimplementing the watchdog. The hook tracks `lastMqttFrameAt` (updated on every
real frame). A 1 s watchdog sets `autoOutageActive = true` when
`Date.now() - lastMqttFrameAt > 3 s`. While active, a second effect injects ghost
frames (`_blackout: true`, `_realOutage: true`, frozen Y values) every 1 s. The MQTT
poll keeps running during the outage, so as soon as real frames return
`lastMqttFrameAt` refreshes, `autoOutageActive` clears, injection stops, and
`blackoutOffsetSec` smooths the X axis.

**Reconstruction on refresh** - ghost frames only live in Redux; a refresh clears
them. Two mechanisms preserve them:

1. **`reconstructOutages`** (first pass of `buildTelemetryChartData`) - scans the
   consecutive real frames and, when their `mission_time` gap exceeds
   `OUTAGE_GAP_THRESHOLD_SEC` (2 s), inserts ghosts `_synthesized: true` (one per
   missing second). Surfaces outages prior to opening the page, as long as the
   surrounding frames are in the backend deque.
2. **`sessionStorage` persistence of `telemetryData`** - a **throttled** (2 s)
   effect serializes `telemetryData` under `mqtt_telemetry_data_v1`. Throttle (not
   debounce!) is essential: under continuous 1 Hz a debounce would never fire. A
   `beforeunload` listener flushes the last snapshot. On mount, if Redux is empty
   (after F5), the MQTT effect restores from storage then the resume path
   (`shownCount = -1`) catches up with the backend. Storage in `sessionStorage` (not
   `localStorage`) → a new tab starts fresh; `QuotaExceeded` swallowed silently,
   fallback on `reconstructOutages`.

**Backend watchdog** - the detection above is frontend-only, so it never reaches
the backend log. A server-side watchdog in `mqtt_telemetry_receiver.py` mirrors it:
`on_message` stamps `_last_frame_at`, and a 1 Hz thread logs a **WARNING**
`[RPI_DISCONNECTED] telemetry not received` after `MQTT_FRAME_TIMEOUT_SEC` (3 s)
without a frame, plus an INFO `[TELEMETRY_RESUMED]` on return. Since it's a WARNING,
the disconnect also appears in `gss debug`. Only fires after the first frame (a
never-connected startup is not an outage).

### 7.6 Operator alert feed (Pi bridge + backend errors → errors terminal)

The UART→MQTT bridge on the Pi side (`uart_mqtt_bridge_rfd.py` on `gs-modem`)
forwards its **error/warning** output to the station so the operator sees Pi
problems (lost serial port, parse errors, reconnects) without SSH. It reuses the
existing broker - no extra port.

The same store (`bridge_log_store`) is also the **backend's own alert channel**
(`bridge_log_store.alert()`): every subsystem pushes its failures **and
recoveries** there, so nothing fails silently - the operator always gets a line
in the errors terminal + `gss debug` saying what broke, that it is retrying, and
when it is fixed:

| Source | Alerts |
|---|---|
| `[backend]` | `[BROKER] lost connection … reconnecting` / `[BROKER] cannot reach <ip> … retrying every 3s` / `[BROKER] reconnected` (green) · `[BAD_FRAME] N undecodable frame(s) … frames skipped, station keeps running` (throttled 1 line / 10 s) |
| `[sheets]` | `[SHEETS] sync FAILED: <reason> - N rows buffered, retrying` with a **classified reason** (Google rate limit HTTP 429 · Google-side 5xx · *Web App returned HTML instead of JSON - redeploy the Apps Script* · cannot reach Google - no internet? · timeout) · `[SHEETS] buffer full - N oldest rows dropped` · `[SHEETS] sync restored - N buffered rows flushed` (green) |
| `[csv]` | `[CSV_LOG] local CSV archive FAILED (<error>) - frames buffered in memory, retrying every 30s` · `[CSV_LOG] local CSV archive restored - N buffered rows written` (green) |
| `[station]` (frontend-local) | `backend unreachable - no telemetry/error feed` after 3 failed polls (~6 s), `backend reachable again` (green) on recovery |

All alerts go through the store's **dedup** (one identical consecutive line per
60 s window), so a persistent failure keeps reminding the operator without ever
flooding the terminal or the log. **INFO**-level lines (recoveries) render
**green**, WARN amber, ERROR red.

```
Pi bridge  ──publish──►  MQTT topic icarus2/bridge/log   (JSON {ts, level, source, msg})
                              │
mqtt_telemetry_receiver.py    │  on_message routes the topic to _handle_bridge_log
  └─► bridge_log_store (deque maxlen 500, monotonic id)
        └─► logger.warning("[BRIDGE:gs-modem] …")   → also appears in `gss debug`
        └─► GET /api/bridge/logs?after=<id>  ──►
                                                 ▼
                          telemetryTerminal.jsx (variant="errors")
                            polls every 2 s with the last seen id (persisted in
                            Redux terminalState.errors.bridgeLogId)
                            → red [gs-modem] lines (WARN = amber, ERROR = red)
```

- **Pi side** - a shadow of `print()` publishes any line containing an error/warning
  hint (`error`, `skipped`, `fail`, `exception`, `reconnect`…) to
  `icarus2/bridge/log`. The publish is in a `try/except` so it never affects the
  bridge.
- **Backend** - `_handle_bridge_log` parses the JSON (raw-text fallback), stores it
  in `bridge_log_store`, logs a WARNING. Two refinements:
  - **Humanize** - `_humanize_bridge_message` rewrites the raw serial-open failure
    (`Serial error: … could not open port /dev/ttyUSB0: No such file …`, printed every
    3 s when the RFD's USB adapter is unplugged) into
    **`[RFD_DISCONNECTED] RFD not plugged into the Pi (/dev/ttyUSB0 not found)`**.
  - **Dedup** - `bridge_log_store.add_log` suppresses consecutive identical lines
    within `_DEDUP_WINDOW_SEC` (60 s), so the 3 s reconnect loop collapses to one
    line. The WARNING mirror is also conditioned on a non-`None` return, so `gss debug`
    isn't flooded.
- **Frontend** - the errors terminal merges these lines into the same 500-line
  buffer as its telemetry-derived anomalies.

### 7.7 Topbar widgets, GS position, follow, /rapport legend

**Topbar widgets** (`topbar-widgets.jsx`) - a route-independent global cluster in
the `AppBar`, all driven by a shared 1 Hz interval (`useNow`):
- **Time** - local clock (`en-GB`, 24 h) + date.
- **Weather** - temperature + icon/label mapped from the WMO code.
- **Wind** - speed (km/h) + 8-point direction (N, NE, E, SE, S, SW, W, NW).
- **T Countdown** - persisted `datetime-local` picker (`launch_datetime`), then a
  `T- HH:MM:SS` countdown that flips to `T+ …` after launch.

In the `AppBar`, the toolbar lays these out left→right as **page-action buttons**
(`PageActionButtons`, the per-page Export/Import/Edit `node`) → **`TopbarWidgets`**
→ **partner logos**, so the widget cluster always renders to the right of the
Export/Import/Edit buttons on the pages that expose them (`/station`, `/analyse`).

Weather and Wind share a fetch in `useWeather()` against **Open-Meteo** (no key),
with the GS lat/lon from `loadGroundStationPosition()`, refreshed every 10 min. To
change provider, replace `fetchWeather()` - it just has to resolve
`{ tempC, windKmh, windDir, code }`.

**GS position** - configurable via **"GS position ▼"** in the Cesium right panel (on
`/station` and `/vueGlobe3d`):
- Persisted in `localStorage` under `station_ground_station_position`.
- Shared across routes via `loadGroundStationPosition()` /
  `saveGroundStationPosition()` (`cesium-utils.js`).
- Default: `{ lat: 48.55, lon: -81.35 }` (ICARUS2 launch site).
- Cesium entity: green point + "GS" label, always visible. Link beam (green line)
  drawn from the GS to the current CubeSat position.

**"Follow CubeSat" mode** - locks the camera onto the current position, updated
every 1 s. `MAP_FOLLOW_CAMERA_HEIGHT = 27000` m (27 km). The camera uses
`Math.min(cameraHeightRef.current, MAP_FOLLOW_CAMERA_HEIGHT)`. Pitch and heading
identical to the free camera (`MAP_CAMERA_PITCH = −48°`, `MAP_CAMERA_HEADING = 32°`).

**/rapport legend dedup** - when a chart contains outage frames, each Y series is
split into a `_normal` line and a `_ghost` (red) line. The ghost `<Line>`s carry
`legendType="none"` so only the normal series appears in the Recharts legend.

### 7.8 Forest-fire danger zones

The forest-fire danger zones are **static data baked into the flight CSV** (no
runtime generation). Each zone is an **irregular GeoJSON polygon** (a realistic
blob, not a perfect circle/triangle/square), already sized to fit **within the
CubeSat's camera view** at that frame. The ground station simply **parses and draws
the GeoJSON it receives** - no clipping, no generation.

```
tools/simulators/generate_fire_zones.py   (one-shot script, run ONCE)
  places ~12 zones spaced along the flight; at each location it projects the camera
  footprint with the REAL IMU QUATERNION (Quat_w/x/y/z) - not nadir: the IMU pitches
  20-38°, so the footprint (and the zone) lands 2-12 km OFF the ground track, scattered
  and not in a straight line. Generates an irregular blob, CLIPS it to the footprint → 2
  columns in telemetry.csv:
     "Fire Level" (1/2/3)  +  "Fire GeoJSON" (GeoJSON Polygon geometry)
  (pristine backup → telemetry.csv.bak; idempotent)
      │
      ▼   (at runtime, no more generation)
  mqtt_cubesat_simulator.py replays the CSV: "Fire Level"/"Fire GeoJSON" go through
    CSV_FIELD_ALIASES → fire_zone_level / fire_zone_geojson
  → protobuf fields 25-26: fire_zone_level (varint) + fire_zone_geojson (string)
        (emitted only if level>0 - normal frames keep their size)
      └─► MQTT broker → mqtt_telemetry_receiver → store → /api/telemetry/mqtt/frames
            └─► telemetry-protobuf.js decodes → Fire_Level + Fire_GeoJSON on each
                record (preserved via ...item)
                  └─► cesiumViewport.jsx: fireGeojsonPositions() parses the Polygon and
                      adds ONE coloured polygon entity (dedup by content), kept even
                      after the frame is evicted from the deque
```

- **Level → colour**: `1` yellow (**risk**), `2` orange (**high risk**), `3` red
  (**extreme risk**) - the colour comes from `Fire_Level`, the shape from the
  GeoJSON. The polygons are **irregular** (16 noised vertices then clipped to the
  footprint, so sometimes partial at the edge of the view).
- **No ground-side processing**: the frontend no longer has any footprint/clipping
  logic for the zones - it draws the received GeoJSON as-is (`JSON.parse` →
  `Cartesian3.fromDegreesArray`).
- **Regenerate** (rare): `python3 tools/simulators/generate_fire_zones.py` rewrites
  the columns in `telemetry.csv` (idempotent, backup once). Afterwards the zones are
  **in the telemetry forever**.
- **Toggle** `mapOptions.fireZones` (**"Fire zones"** button) + colour legend in the
  right panel; visible on `/station` and `/vueGlobe3d`.
- **Persistence**: `Fire_Level` + `Fire_GeoJSON` travel on the frames (survive a
  refresh via sessionStorage); already-drawn polygons stay displayed.
- **Recording**: two columns `Fire Level` and `Fire GeoJSON` are appended **at the
  end** of the per-day local CSV and the Google Sheet (the 19 leading ICARUS2 columns
  stay identical).

### 7.9 Redux state

| Slice | Content |
|---|---|
| `telemetry` | `telemetryData`, `sourceData`, `playbackIndex`, `streamIndex`, `mode`, `sourceMode` (default `'mqtt'`), `loading`, `error`, `terminalState` (per variant `{ lines, cursor, inBlackout }` to survive route unmount/remount) |

### 7.10 HTTP API (FastAPI backend)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/telemetry/mqtt/frames` | Frames from the MQTT store in Protocol Buffers (live). Response headers `X-GS-Boot-Id` / `X-GS-Session-Mode` carry the session identity (see §7.2 session semantics) |
| `GET` | `/api/telemetry/mqtt/status` | MQTT broker connection state |
| `POST` | `/api/telemetry/mqtt/clear` | Clears the MQTT store |
| `GET` | `/api/bridge/logs?after=<id>` | Error/warning lines forwarded by the Pi bridge (incremental by id) |
| `GET` | `/api/status` | Aggregated operator status: broker connected?, telemetry active?, RFD connected?, plus `sheets_sync` / `csv_log` backup-sink health (feeds the terminals' status block) and `boot_id` / `session_mode` |
| `GET` | `/*` | SPA fallback → `dist/index.html` (static files mounted via `StaticFiles`) |

### 7.11 Physics computations (`chart-logic.js`)

| Field | Formula | Unit / Step |
|---|---|---|
| `_fspl` | `20·log₁₀(4π·d·f / c)` with f=437 MHz | dB |
| `_bilan` | `TX(30 dBm) + TX_gain(8) − FSPL + RX_gain(10)` | dBm |
| `_elapsed_s` | `(timestamp − epoch) / 1000` - `epoch = data[0]._epoch_ms` (stable). Outage frames: `lastRealElapsed + N` | s · step 100 |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 10 |

### 7.12 Performance notes

| Component | Technique |
|---|---|
| MQTT poll | Content-fingerprint detection - detects new frames even when the deque is full (sliding window); dispatches only the new part via `appendTelemetryPoints` (batched) |
| Stable epoch | The first frame's mission-time is stored in `live.epochMs` and stamped `_epoch_ms` on every frame; the X-axis origin doesn't drift when old frames are evicted |
| Cesium trajectory | Incremental: only converts new GPS points to `Cartesian3`; O(1) per poll. Cached in `trajectoryPositionsRef` |
| TelemetryChart | Decimates to ≤800 points for SVG rendering; full dataset kept for domain/axes/scroll |
| Off-thread pipeline | `buildTelemetryChartData` + `reconstructOutages` + `enrich` (FSPL / budget / distance) run in a **Web Worker** (`telemetry-worker.js`, instantiated per `useTelemetryStream` mount via Vite's `?worker` import). A monotonic `requestId` discards stale results. First render (and environments without Worker): synchronous main-thread fallback. With `useDeferredValue` on the chart data, Cesium and Recharts stay smooth even with 5000-frame rebuilds |

---

## 8. Telemetry backup

### 8.1 Per-day local CSV (automatic)

Every MQTT frame received is appended to a local CSV by
`pipeline/telemetry_csv_logger.py` (called from `on_message`, right after
`telemetry_store.add_frame`). This is **independent** of the 5000-frame deque - the
deque is the live display window, the CSV is a durable per-day capture.

- **Per-day files** - one file per local calendar day, named by the date
  (`<YYYY-MM-DD>.csv`). Rotation at midnight; header written once per new file.
- **Format** - 19 leading columns identical to the canonical ICARUS2 recording
  (`m-time, Flight ID, Ublox UTC, U Lat, U Long, U Alt, Speed, Vert speed, #Sat,
  Pressure, MIU, T1…T8`), so interchangeable with the flight data, followed by 2 fire-
  zone columns (`Fire Level`, `Fire GeoJSON` = the zone's GeoJSON polygon), non-null
  only on detection frames.
- **Location** - `TELEMETRY_CSV_DIR`, default `~/Desktop/telemetry/` (outside the
  repo). Disableable with `TELEMETRY_CSV_LOG_ENABLED=0`.
- **Durability** - each line is `flush()`ed immediately. On a write/open failure
  (disk full, folder deleted, permissions…) the logger **does not give up**: it
  alerts the operator (`[CSV_LOG] … FAILED`, errors terminal + `gss debug`),
  **buffers incoming frames in memory** (capped at 5000 rows) and **retries every
  30 s**; once the problem is fixed the buffered rows are written and a green
  `restored` line confirms it. The rest of the pipeline is unaffected throughout.

### 8.2 Mirror to Google Drive (rclone)

Google has no native Linux Drive client, so the CSV is pushed with
[`rclone`](https://rclone.org). One-time setup:

```bash
sudo apt install rclone
rclone config            # new remote → "drive" → authorize in the browser → name it "gdrive"
```

Then periodic mirror (push-only, 30 s here); `rclone copy` of the folder re-uploads
only the changed files:

```bash
while true; do
  rclone copy ~/Desktop/telemetry gdrive:GroundStation/
  sleep 30
done
```

For an unattended setup, prefer a **systemd timer** or cron, or `rclone bisync` for
a two-way sync.

### 8.3 Live Google Sheet sync (Apps Script Web App)

As an alternative to the CSV mirror, `pipeline/telemetry_sheets_sync.py` pushes
frames **directly into a Google Sheet**. Wired into `on_message` alongside the CSV
logger, it runs independently.

- **Batching** - frames are buffered and flushed in a single HTTP POST every
  `SHEETS_SYNC_INTERVAL_SEC` (default 5 s), not one request per frame, to stay under
  Apps Script quotas. Buffer capped at 5000 rows (oldest dropped under backpressure,
  **with an operator alert** counting the lost rows). A failed flush re-queues its
  rows and retries on the next tick.
- **Failure handling** - every failed flush raises a **classified operator alert**
  (see §7.6): quota (HTTP 429), Google-side 5xx, *Web App returned HTML - redeploy
  the Apps Script*, no internet, timeout (the POST is capped at 30 s so a hung
  request can never block the loop for long). The response body is **validated**
  (`{ok: true}` JSON expected), so the classic silent misdeployment is caught even
  though it answers HTTP 200. On recovery a green `[SHEETS] sync restored` line
  confirms the backlog was flushed. **Known limitation**: if a flush times out
  *after* Apps Script actually wrote the rows, the retry can duplicate them in the
  Sheet - the local CSV (source of truth) is never affected.
- **Per-day tabs** - each batch carries a `tab` field = local date (`YYYY-MM-DD`).
  The Web App writes into that tab, creating it (with header) on first use. The
  **local CSV remains the full, unbounded archive.**
- **No backend credential** - the Web App runs as the sheet owner, so the backend
  only needs the deployment URL; it POSTs `{ header, values }` as JSON with the
  stdlib (`urllib`).
- **Config** - `SHEETS_SYNC_ENABLED=1` + `SHEETS_WEBAPP_URL=<…/exec>`. Both are
  passed by `start-local.sh`.

**Apps Script side** (paste into the sheet → Extensions → Apps Script, then Deploy →
New deployment → *Web app* → Execute as *Me* → Access *Anyone* → copy the `/exec`
URL):

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

### 8.4 Logs

Backend and frontend write to `~/Desktop/ground-station-logs/*.txt`
(`gss verbose` to follow them). Location via `GS_LOG_DIR`.

---

## 9. Environment variables

### Backend

| Variable | Default | Role |
|---|---|---|
| `MQTT_TELEMETRY_ENABLED` | `0` | Enables MQTT reception (`1`) |
| `MQTT_BROKER_HOST` | `localhost` | Broker host |
| `MQTT_BROKER_PORT` | `1883` | Broker port |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Protobuf frames topic |
| `MQTT_TELEMETRY_QOS` | `1` | MQTT QoS |
| `MQTT_BRIDGE_LOG_TOPIC` | `icarus2/bridge/log` | Topic for the Pi bridge's error/warning lines |
| `MQTT_BRIDGE_LOG_MAXLEN` | `500` | Max bridge log lines in the backend ring buffer |
| `MQTT_TELEMETRY_STORE_MAXLEN` | `5000` | Frames kept in memory (deque) |
| `MQTT_FRAME_TIMEOUT_SEC` | `3` | Watchdog: `[RPI_DISCONNECTED]` after N s without a frame |
| `GS_SESSION_MODE` | `live` | `simulation` = each new backend session auto-resets the frontend graphs; `live` = new sessions resume. Set automatically by `start-local.sh` (`simulation` when `-Simulator`) |
| `TELEMETRY_CSV_LOG_ENABLED` | `1` | Write the per-day local CSV (`0` to disable) |
| `TELEMETRY_CSV_DIR` | `~/Desktop/telemetry` | Folder for the `<date>.csv` files |
| `SHEETS_SYNC_ENABLED` | `0` | Push to Google Sheet (`1` + URL) |
| `SHEETS_WEBAPP_URL` | (empty) | `/exec` URL of the Apps Script Web App |
| `SHEETS_SYNC_INTERVAL_SEC` | `5` | Interval of the batches to the Sheet |
| `GS_LOG_DIR` | `~/Desktop/ground-station-logs` | Folder for the `.txt` logs |

### Frontend

| Variable | Role |
|---|---|
| `VITE_CESIUM_ION_TOKEN` | Cesium Ion token (base map) - in `frontend/.env.local` |
| `GS_BACKEND_HOST` / `GS_BACKEND_PORT` | Vite proxy target |

---

## 10. Docker

Multi-stage build (Node → Python 3.12) that bundles the compiled frontend + the
backend:
```bash
docker build -t ground-station .
# with the Cesium token at build time:
docker build --build-arg VITE_CESIUM_ION_TOKEN="your_token" -t ground-station .
```
The image exposes port **7000**.

---

## 11. Quick troubleshooting

- **No telemetry / "CSV fallback"**: the broker is unreachable. Check the Raspberry
  Pi's IP (DHCP → it changes) with `gss debug`, and that `mosquitto` is listening
  (`listener 1883`, `allow_anonymous true`).
- **Black Cesium map**: check `VITE_CESIUM_ION_TOKEN` (`frontend/.env.local`).
- **Stop the station**: after `gss start` / `startoffline` / `simulation`, the
  terminal is attached to the log → **`Ctrl+C` stops everything**. Otherwise (another
  terminal, or `GS_FOLLOW=0`), use `gss kill`.
- **The Google Sheet doesn't fill up**: make sure you **redeployed** the Apps Script
  Web App after changing the script, and that `SHEETS_WEBAPP_URL` is up to date.
- **`gss simulation` won't start**: `mosquitto` missing
  (`sudo apt install -y mosquitto`) or CSV not found at the default path.

---

## 12. Tech stack

| Category | Technology |
|---|---|
| Backend | FastAPI + Uvicorn + paho-mqtt |
| Serialization | Protocol Buffers (hand-encoded, no `.proto`) |
| Frontend | React 19 + Vite + React Router v7 |
| State | Redux Toolkit |
| UI | Material-UI v7 |
| 3D globe | Cesium |
| 3D (CubeSat attitude) | three.js |
| Charts | Recharts |
| Containerization | Docker |
