# Architecture — Ground Station

## Vue d'ensemble

Application web temps réel de suivi de ballon stratosphérique (projet ICARUS2).  
Stack : **FastAPI + Python** (backend) · **React + Redux + Cesium** (frontend) · **MQTT** (télémétrie live).

---

## Structure des dossiers

```
ground-station/
├── backend/                  # Serveur Python (FastAPI)
│   ├── app.py                # Point d'entrée — démarre Uvicorn
│   ├── logconfig.yaml        # Configuration logging (colorlog)
│   ├── server/
│   │   ├── startup.py        # App FastAPI, routes HTTP, CORS, fichiers statiques
│   │   └── telemetry_protobuf.py  # Encodage/décodage Protocol Buffers
│   ├── pipeline/
│   │   ├── mqtt_telemetry_receiver.py  # Client MQTT paho, topic icarus2/telemetry/frame.pb
│   │   └── telemetry_store.py          # Deque en mémoire pour les frames télémétrie
│   └── common/
│       ├── arguments.py      # Parsing CLI (host, port, log-level) + defaults
│       └── logger.py         # Logging stdlib basicConfig
│
├── frontend/                 # Client React (Vite)
│   ├── index.html            # Entrée HTML — favicon SAFARI.png
│   ├── vite.config.js        # Build Vite + plugin Cesium + proxy backend
│   ├── package.json          # Dépendances : React, MUI, Redux, Cesium, Recharts
│   ├── public/               # Assets statiques
│   │   ├── SAFARI.png        # Logo SAFARI (favicon)
│   │   ├── CSA.png / ETS.jpg / Lassena.png / seds.png  # Logos partenaires (topbar)
│   │   └── cubesat.png       # Image du CubeSat
│   └── src/
│       ├── main.jsx                  # Racine React — router + Redux Provider
│       ├── App.jsx                   # ThemeProvider + CssBaseline
│       ├── theme.js                  # Thème MUI dark
│       ├── theme-configs.js          # Palette de couleurs (thème dark)
│       ├── store.jsx                 # Store Redux (slice telemetry uniquement)
│       ├── layout.jsx                # Topbar + sidebar hover-expand + <Outlet>
│       ├── navigation.jsx            # Définition sidebar (5 routes)
│       ├── page-actions-context.jsx  # Contexte pour boutons d'action par page
│       ├── error-page.jsx            # Page d'erreur
│       └── pages/
│           ├── station/
│           │   └── station-dashboard.jsx      # /station — carte + graphes + terminal
│           ├── vueGlobe3d/
│           │   └── telemetry-dashboard.jsx    # /vueGlobe3d — Globe Cesium + timeline
│           ├── analyse/
│           │   └── analyse-dashboard.jsx      # /analyse — grille de graphes configurables
│           ├── cubesat/
│           │   ├── cubesat-dashboard.jsx      # /cubesat — visualisation annotée CubeSat
│           │   ├── cubesat-annotated-visual.jsx
│           │   ├── cubesat-subsystem-panel.jsx
│           │   ├── cubesat-config.js
│           │   └── cubesat-utils.js
│           ├── rapport/
│           │   └── rapport-dashboard.jsx      # /rapport — génération de rapport
│           └── shared/                        # Composants et utilitaires partagés
│               ├── cesiumViewport.jsx         # Globe Cesium
│               ├── telemetryChart.jsx         # Graphe Recharts
│               ├── telemetryStatsBar.jsx      # Barre de stats
│               ├── telemetryTerminal.jsx      # Terminal flux brut
│               ├── chartTitle.jsx             # Titre dynamique des graphes
│               ├── telemetry-components.jsx   # StatisticCard, ChartCard, TelemetrySummary
│               ├── telemetry-slice.jsx        # Redux slice — données télémétrie
│               ├── use-telemetry-stream.jsx   # Hook — chargement, lecture, seek, pause
│               ├── telemetry-data-source.js   # Parsing CSV/Protobuf
│               ├── telemetry-protobuf.js      # Décodage Protobuf
│               ├── telemetry-utils.js         # distanceKm, getMqttSourceStat, helpers
│               ├── cesium-utils.js            # getTelemetryRecordGeo, imagery providers
│               ├── chart-fields.js            # AVAILABLE_FIELDS — axes et steps
│               ├── chart-logic.js             # FSPL, bilan de liaison, enrich()
│               ├── useAnimatedDomain.js       # Animation fluide des axes
│               └── ground-station-view.css    # Styles globaux (stats bar, globe)
│
├── tools/
│   ├── dev/
│   │   └── start-local.sh   # Démarrage local (MQTT, Simulator, Restart)
│   └── simulators/
│       └── mqtt_cubesat_simulator.py  # Simulateur MQTT — publie des frames protobuf
│
├── Dockerfile               # Build multi-étapes : Node → Python 3.12
├── LICENSE
├── README.md
└── telemetry.csv            # Données de vol réelles (ICARUS2, 14 août 2025)
```

---

## Routes de l'application

| Route | Composant | Description |
|---|---|---|
| `/` | redirect | Redirige vers `/station` |
| `/station` | `StationDashboard` | Vue opérateur : carte Cesium + graphes configurables + terminal |
| `/vueGlobe3d` | `TelemetryDashboard` | Globe Cesium 3D, trajectoire, barre de stats, timeline |
| `/analyse` | `AnalyseDashboard` | Grille de graphes Recharts entièrement configurables |
| `/cubesat` | `CubeSatDashboard` | Image annotée du CubeSat, sous-systèmes, télémétrie |
| `/rapport` | `RapportDashboard` | Génération de rapport de mission |

---

## Flux de données

### Télémétrie (CSV / MQTT)

```
Option A — CSV fallback :
  GET /api/telemetry.pb  ──────────────────────────────────►
                                                             │
Option B — MQTT live :                                       │
  Broker MQTT :1883                                          │
    └─► mqtt_telemetry_receiver.py (thread daemon)          │
          └─► telemetry_store (deque maxlen=5000)            │
               └─► GET /api/telemetry.pb ──────────────────►│
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
                                            champs GPS, altitude, vitesse, temp
                                                             │
                                                             ▼
                                          enrich() (chart-logic.js)
                                            _fspl     ← Free Space Path Loss
                                            _bilan    ← Bilan de liaison (dBm)
                                                             │
                                                             ▼
                                          TelemetryChart / CesiumViewport / TelemetryStatsBar
```

---

## État Redux

| Slice | Contenu |
|---|---|
| `telemetry` | `telemetryData`, `sourceData`, `playbackIndex`, `streamIndex`, `mode`, `loading`, `error` |

---

## API HTTP (backend FastAPI)

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/telemetry.csv` | Fichier CSV de télémétrie courant |
| `GET` | `/api/telemetry.pb` | Frames télémétrie en Protocol Buffers (MQTT ou CSV) |
| `GET` | `/api/telemetry/mqtt/status` | Statut du broker MQTT |
| `POST` | `/api/telemetry/mqtt/clear` | Vide le store MQTT |
| `GET` | `/*` | SPA fallback → `dist/index.html` |

---

## Calculs de physique (chart-logic.js)

| Champ | Formule | Unité / Step |
|---|---|---|
| `_fspl` | `20·log₁₀(4π·d·f / c)` avec f=437 MHz | dB |
| `_bilan` | `TX(30 dBm) + TX_gain(8) − FSPL + RX_gain(10)` | dBm |
| `_elapsed_s` | `(timestamp_CSV − t₀) / 1000` | s · step 10 000 |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 60 |

---

## Démarrage local

```bash
./tools/dev/start-local.sh -Restart -Mqtt -Simulator
```

| Option | Effet |
|---|---|
| `-Restart` | Arrête les processus sur les ports 5000 et 5173 avant de redémarrer |
| `-Mqtt` | Démarre le broker Mosquitto local (port 1883) |
| `-Simulator` | Lance `mqtt_cubesat_simulator.py` (publie les frames CSV via MQTT) |

### Variables d'environnement clés

| Variable | Défaut | Description |
|---|---|---|
| `VITE_CESIUM_ION_TOKEN` | (`.env.local`) | Token Cesium Ion pour le fond de carte |
| `MQTT_TELEMETRY_ENABLED` | `0` | `1` pour activer la réception MQTT |
| `MQTT_BROKER_HOST` | `localhost` | Hôte du broker MQTT |
| `MQTT_BROKER_PORT` | `1883` | Port MQTT |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Topic de télémétrie |

---

## Stack technique

| Catégorie | Technologie |
|---|---|
| Backend | FastAPI + Uvicorn + paho-mqtt |
| Sérialisation | Protocol Buffers |
| Frontend | React 19 + Vite + React Router v7 |
| State | Redux Toolkit |
| UI | Material-UI v7 |
| Globe 3D | Cesium |
| Graphes | Recharts |
| Conteneurisation | Docker |
