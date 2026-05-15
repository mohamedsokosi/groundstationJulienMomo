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
│   ├── common/
│   │   ├── appconfig.py      # Chargement data/configs/app_config.json
│   │   ├── arguments.py      # Parsing CLI (host, port, log-level, log-config)
│   │   └── logger.py         # Logging colorlog
│   └── data/
│       └── configs/app_config.json  # Config (host, port, log_level, log_config)
│
├── frontend/                 # Client React (Vite)
│   ├── index.html            # Entrée HTML — favicon SAFARI.png
│   ├── vite.config.js        # Build Vite + plugin Cesium + proxy backend
│   ├── package.json          # Dépendances : React, MUI, Redux, Cesium, Recharts
│   ├── public/               # Assets statiques
│   │   ├── SAFARI.png        # Logo SAFARI (favicon)
│   │   ├── CSA.png / ETS.jpg / Lassena.png / seds.png  # Logos partenaires (topbar)
│   │   └── telemetry.csv     # Données de vol statiques (fallback CSV)
│   └── src/
│       ├── main.jsx                  # Racine React — router + Redux Provider
│       ├── App.jsx                   # ThemeProvider + CssBaseline
│       ├── theme.js                  # Thème MUI dark
│       ├── theme-configs.js          # Palettes de couleurs (dark, light, etc.)
│       ├── store.jsx                 # Store Redux (slice telemetry uniquement)
│       ├── layout.jsx                # Topbar + sidebar hover-expand + <Outlet>
│       ├── navigation.jsx            # Définition sidebar (5 routes)
│       ├── page-actions-context.jsx  # Contexte pour boutons d'action par page
│       ├── error-page.jsx            # Page d'erreur
│       ├── assets/
│       │   ├── cubesat-annotated-base.svg
│       │   └── cubesat.png
│       └── pages/
│           ├── telemetry-dashboard.jsx    # /vueGlobe3d — Globe Cesium + timeline
│           ├── station-dashboard.jsx      # /station — carte + graphes + terminal
│           ├── analyse-dashboard.jsx      # /analyse — grille de graphes configurables
│           ├── cubesat-dashboard.jsx      # /cubesat — visualisation annotée CubeSat
│           ├── rapport-dashboard.jsx      # /rapport — génération de rapport
│           ├── CesiumViewport.jsx         # Composant globe Cesium (partagé)
│           ├── TelemetryChart.jsx         # Composant graphe Recharts (partagé)
│           ├── TelemetryStatsBar.jsx      # Barre de stats télémétrie
│           ├── TelemetryTerminal.jsx      # Terminal de flux brut
│           ├── ChartTitle.jsx             # Titre dynamique des graphes
│           ├── telemetry-components.jsx   # StatisticCard, ChartCard, TelemetrySummary
│           ├── telemetry-data-source.js   # Parsing CSV/Protobuf, buildTelemetryChartData
│           ├── telemetry-slice.jsx        # Redux slice — données télémétrie
│           ├── use-telemetry-stream.jsx   # Hook — chargement, lecture, seek, pause
│           ├── telemetry-utils.js         # distanceKm, getMqttSourceStat, helpers
│           ├── telemetry-protobuf.js      # Décodage Protobuf côté frontend
│           ├── cesium-utils.js            # getTelemetryRecordGeo, imagery providers
│           ├── chart-fields.js            # AVAILABLE_FIELDS — axes et steps des graphes
│           ├── chart-logic.js             # FSPL, bilan de liaison, enrich()
│           ├── cubesat-config.js          # Définition des sous-systèmes CubeSat
│           ├── cubesat-utils.js           # Helpers statut sous-systèmes
│           ├── cubesat-annotated-visual.jsx  # SVG annoté du CubeSat
│           ├── cubesat-subsystem-panel.jsx   # Panneau détail sous-système
│           └── ground-station-view.css    # Styles globaux (stats bar, globe)
│
├── shared/
│   └── proto/               # Schémas Protocol Buffers (TelemetryFrame, TelemetryBatch)
│
├── tools/
│   ├── dev/
│   │   └── start-local.sh   # Démarrage local (MQTT, Simulator, Restart)
│   └── simulators/
│       └── mqtt_cubesat_simulator.py  # Simulateur MQTT — publie des frames protobuf
│
├── config/
│   └── mosquitto/           # Configuration broker MQTT Eclipse Mosquitto
│
├── Dockerfile               # Build multi-étapes : Node → Python 3.12
├── docker-compose.mqtt.yml  # Service MQTT (eclipse-mosquitto:2, port 1883)
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
| Frontend | React 19 + Vite |
| State | Redux Toolkit |
| UI | Material-UI v7 |
| Globe 3D | Cesium |
| Graphes | Recharts |
| Conteneurisation | Docker |
