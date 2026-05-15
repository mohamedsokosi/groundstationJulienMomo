# Architecture — Ground Station

## Vue d'ensemble

Application web temps réel de suivi de ballon stratosphérique (projet ICARUS2).  
Stack : **FastAPI + Python** (backend) · **React + Redux + Cesium** (frontend) · **MQTT** (télémétrie live).

---

## Structure des dossiers

```
ground-station/
├── backend/                  # Serveur Python (FastAPI + Socket.IO)
│   ├── app.py                # Point d'entrée, démarrage Uvicorn
│   ├── server/
│   │   ├── startup.py        # App FastAPI, routes HTTP, CORS, fichiers statiques
│   │   ├── shutdown.py       # Gestion des signaux et nettoyage
│   │   ├── telemetry_protobuf.py  # Encodage/décodage Protocol Buffers
│   │   └── version.py        # Gestion de version et vérification de mises à jour
│   ├── handlers/
│   │   ├── socket.py         # Événements Socket.IO (connect, disconnect, data_request)
│   │   ├── routing.py        # Registre de handlers et dispatch des commandes
│   │   └── preferences.py    # Handlers fetch/update des préférences utilisateur
│   ├── crud/
│   │   └── preferences.py    # Opérations base de données (fetch, set)
│   ├── db/
│   │   ├── __init__.py       # Engine SQLAlchemy async, migrations
│   │   └── models.py         # Modèles ORM : Preferences (UUID, name, value, timestamps)
│   ├── pipeline/
│   │   ├── mqtt_telemetry_receiver.py  # Client MQTT paho, écoute icarus2/telemetry/frame.pb
│   │   └── telemetry_store.py          # Deque en mémoire pour les frames télémétrie
│   ├── common/
│   │   ├── appconfig.py      # Chargement de data/configs/app_config.json
│   │   ├── arguments.py      # Parsing CLI (host, port, db, log, MQTT, SDR)
│   │   └── logger.py         # Logging colorlog
│   └── data/
│       ├── configs/app_config.json  # Config par défaut (host, port, MQTT, etc.)
│       └── db/               # Fichiers SQLite
│
├── frontend/                 # Client React (Vite)
│   ├── index.html            # Entrée HTML — favicon SAFARI.png
│   ├── vite.config.js        # Build Vite + plugin Cesium
│   ├── .env.local            # VITE_CESIUM_ION_TOKEN (token Cesium Ion)
│   ├── .env.development      # VITE_GS_BACKEND_PORT=5173
│   ├── .env.production       # VITE_GS_BACKEND_PORT=443
│   ├── public/               # Assets statiques servis directement
│   │   ├── SAFARI.png        # Logo SAFARI (favicon de l'app)
│   │   ├── CSA.png           # Logo CSA
│   │   ├── ETS.jpg           # Logo ÉTS
│   │   ├── Lassena.png       # Logo Lassena
│   │   ├── seds.png          # Logo SEDS
│   │   ├── gs-tiny.png       # Ancien favicon
│   │   └── telemetry.csv     # Données de vol statiques (fallback)
│   └── src/
│       ├── main.jsx          # Racine React, router, Redux Provider, SocketProvider
│       ├── App.jsx           # Thème MUI, i18n, handlers Socket.IO globaux
│       ├── config/
│       │   ├── navigation.jsx  # Menu sidebar (Station en premier, SettingsInputAntennaIcon)
│       │   └── branding.jsx    # Logo et couleurs de l'app
│       ├── layout/
│       │   ├── dashboard-layout.jsx       # Layout principal (topbar + sidebar)
│       │   ├── dashboard-slice.jsx        # Redux slice — état du dashboard
│       │   ├── page-actions-context.jsx   # Contexte pour actions par page (boutons header)
│       │   ├── reconnecting-overlay.jsx   # Overlay de reconnexion Socket.IO
│       │   ├── version-slice.jsx          # Redux slice — version
│       │   ├── version-update-overlay.jsx # Notification de mise à jour
│       │   ├── update-slice.jsx           # Redux slice — vérification update
│       │   ├── wake-lock-provider.jsx     # Empêche la mise en veille écran
│       │   └── wake-lock-logic.jsx        # Logique wake lock
│       ├── shared/
│       │   ├── store.jsx              # Store Redux (preferences, dashboard, version, telemetry)
│       │   ├── socket.jsx             # Provider Socket.IO client
│       │   ├── preferences-slice.jsx  # Thème, langue, préférences
│       │   └── error-page.jsx         # Composant d'erreur
│       ├── themes/
│       │   └── theme-configs.js       # Thèmes MUI clair/sombre
│       ├── i18n/
│       │   ├── config.js              # Configuration i18next
│       │   └── locales/               # Traductions : en, fr, es, de, it, nl, el
│       └── pages/
│           ├── telemetry-dashboard.jsx     # /vueGlobe3d — Globe Cesium + timeline
│           ├── station-dashboard.jsx       # /station — Vue opérateur (carte + graphes + terminal)
│           ├── analyse-dashboard.jsx       # /analyse — Graphes configurables
│           ├── cubesat-dashboard.jsx       # /cubesat — Visualisation annotée CubeSat
│           ├── rapport-dashboard.jsx       # /rapport — Génération de rapport de mission
│           ├── CesiumViewport.jsx          # Composant globe Cesium partagé
│           ├── TelemetryChart.jsx          # Composant graphe Recharts partagé
│           ├── TelemetryStatsBar.jsx       # Barre de statistiques telémétrie
│           ├── TelemetryTerminal.jsx       # Terminal de flux telémétrie brut
│           ├── ChartTitle.jsx              # Titre dynamique des graphes
│           ├── telemetry-data-source.js    # Parsing CSV/Protobuf, buildTelemetryChartData
│           ├── telemetry-slice.jsx         # Redux slice — données télémétrie
│           ├── use-telemetry-stream.jsx    # Hook — chargement, lecture, seek, pause
│           ├── telemetry-utils.js          # Helpers numériques, distanceKm, getMqttSourceStat
│           ├── telemetry-protobuf.js       # Décodage Protobuf côté frontend
│           ├── cesium-utils.js             # Constantes carte, getTelemetryRecordGeo, imagery
│           ├── chart-fields.js             # AVAILABLE_FIELDS — axes et steps des graphes
│           ├── chart-logic.js             # FSPL, bilan de liaison, enrich()
│           ├── cubesat-config.js           # Définition des sous-systèmes CubeSat
│           ├── cubesat-utils.js            # Helpers statut sous-systèmes
│           ├── cubesat-annotated-visual.jsx # SVG annoté du CubeSat (zones cliquables)
│           ├── cubesat-subsystem-panel.jsx  # Panneau détail d'un sous-système
│           └── ground-station-view.css     # Styles CSS communs (stats bar, timeline, globe)
│
├── shared/
│   └── proto/               # Schémas Protocol Buffers (TelemetryFrame, TelemetryBatch)
│
├── tools/
│   ├── dev/
│   │   ├── start-local.sh   # Démarrage local (Unix)
│   │   └── start-local.ps1  # Démarrage local (Windows)
│   └── simulators/
│       └── mqtt_cubesat_simulator.py  # Simulateur MQTT — publie de faux frames protobuf
│
├── config/
│   └── mosquitto/           # Configuration broker MQTT Eclipse Mosquitto
│
├── docs/                    # Documentation additionnelle
├── Dockerfile               # Build multi-étapes : Node (frontend) → Python 3.12 (backend)
├── docker-compose.mqtt.yml  # Service MQTT (eclipse-mosquitto:2, port 1883)
├── .drone.yml               # Pipeline CI/CD Drone
└── telemetry.csv            # Données de vol réelles (ICARUS2, 14 août 2025)
```

---

## Routes de l'application

| Route | Composant | Description |
|---|---|---|
| `/` | redirect | Redirige vers `/vueGlobe3d` |
| `/vueGlobe3d` | `TelemetryDashboard` | Globe Cesium 3D, trajectoire, barre de stats, timeline de lecture |
| `/station` | `StationDashboard` | Vue opérateur : carte + colonne gauche configurable (graphes/terminal) + graphes bas |
| `/analyse` | `AnalyseDashboard` | Grille de graphes Recharts entièrement personnalisables, drag & drop |
| `/cubesat` | `CubeSatDashboard` | Image annotée du CubeSat, sélection de sous-systèmes, télémétrie associée |
| `/rapport` | `RapportDashboard` | Génération de rapport de mission |

---

## Flux de données

### Télémétrie (lecture CSV / MQTT)

```
┌─────────────────────────────────────────┐
│  Source de données (une des deux)        │
│                                          │
│  Option A : CSV                          │
│  GET /api/telemetry.csv  ──────────────► │
│  GET /api/telemetry.pb                   │
│                                          │
│  Option B : MQTT live                    │
│  Broker MQTT (port 1883)                 │
│    └─► mqtt_telemetry_receiver.py        │
│          └─► telemetry_store (deque)     │
│               └─► /api/telemetry.pb ──► │
└─────────────────────────────────────────┘
              │
              ▼
  use-telemetry-stream.jsx (hook React)
    parseTelemetryCsv() ou parseTelemetryProtobuf()
    loadRows() → Redux store (telemetryData)
    startStream() → points ajoutés un par un via setInterval
              │
              ▼
  buildTelemetryChartData()
    _elapsed_s / _elapsed_min ← timestamps CSV (m-time)
    U_Alt, Speed, Pressure, U_Lat, U_Long, #Sat, T1-T8, MIU
              │
              ▼
  enrich()  (chart-logic.js)
    _fspl    ← Free Space Path Loss (dB)
    _bilan   ← Bilan de liaison (dBm)
    _distance ← altitude
              │
              ▼
  TelemetryChart / CesiumViewport / TelemetryStatsBar
```

### Communication Socket.IO (préférences & commandes)

```
Frontend                          Backend
  emit("data_request", cmd) ────► handlers/socket.py
                                    routing.py → dispatch_request()
                                    handlers/preferences.py
                                    crud/preferences.py
                                    SQLite (aiosqlite)
  on("data_response", data) ◄────
```

---

## État Redux

| Slice | Persisté | Contenu |
|---|---|---|
| `telemetry` | oui | `telemetryData`, `sourceData`, `playbackIndex`, `streamIndex`, `mode`, `loading`, `error` |
| `preferences` | oui | Thème, langue, préférences utilisateur |
| `dashboard` | non | État UI du dashboard |
| `version` | non | Version courante de l'app |
| `updateCheck` | non | Statut de la vérification de mise à jour |

---

## API HTTP (backend FastAPI)

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/telemetry.csv` | Fichier CSV de télémétrie courant |
| `GET` | `/api/telemetry.pb` | Frames télémétrie en Protocol Buffers |
| `GET` | `/api/telemetry/mqtt/status` | Statut du broker MQTT (polling 2s) |
| `GET` | `/api/version` | Version de l'application |
| `GET` | `/api/update-check` | Vérification de mise à jour disponible |
| `WS` | `/socket.io/` | Socket.IO (préférences, commandes) |

---

## Calculs de physique (chart-logic.js)

| Champ | Formule | Unité |
|---|---|---|
| `_fspl` | `20·log₁₀(4π·d·f / c)` avec f=437 MHz | dB |
| `_bilan` | `TX_dBm(30) + TX_gain(8) − FSPL + RX_gain(10)` | dBm |
| `_elapsed_s` | `(timestamp_CSV − timestamp_premier_point) / 1000` | s · step 10 000 |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 60 |

---

## Déploiement

### Docker (production)

```bash
# Build image unique (frontend + backend)
docker build -t ground-station .

# Démarrer le broker MQTT
docker-compose -f docker-compose.mqtt.yml up -d

# Lancer l'application
docker run -p 5000:5000 ground-station
```

### Développement local

```bash
# Backend
cd backend && pip install -r requirements.txt
python app.py

# Frontend
cd frontend && npm install
npm run dev
```

### Variables d'environnement clés

| Variable | Valeur par défaut | Description |
|---|---|---|
| `VITE_CESIUM_ION_TOKEN` | (voir .env.local) | Token JWT Cesium Ion pour le fond de carte |
| `VITE_GS_BACKEND_HOST` | `localhost` | Hôte du backend |
| `VITE_GS_BACKEND_PORT` | `5173` (dev) / `443` (prod) | Port du backend |
| `MQTT_BROKER_HOST` | `localhost` | Hôte du broker MQTT |
| `MQTT_BROKER_PORT` | `1883` | Port MQTT |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Topic de télémétrie |

---

## Technologies principales

| Catégorie | Technologie | Version |
|---|---|---|
| Backend framework | FastAPI | latest |
| Async server | Uvicorn + python-socketio | latest |
| Base de données | SQLite + SQLAlchemy + aiosqlite | latest |
| MQTT | paho-mqtt | latest |
| Frontend framework | React | 19 |
| Build tool | Vite | latest |
| State management | Redux Toolkit + redux-persist | latest |
| UI components | Material-UI (MUI) v7 + Toolpad | latest |
| 3D Globe | Cesium | latest |
| Graphes | Recharts | latest |
| Temps réel (front) | socket.io-client | 4.8.1 |
| i18n | i18next | latest |
| Sérialisation | Protocol Buffers | latest |
| Conteneurisation | Docker | — |
