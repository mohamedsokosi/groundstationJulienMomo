# Documentation — Ground Station (SAFARI / ICARUS2)

Documentation **complète** de la station sol : présentation, installation,
utilisation, fonctionnalités, architecture technique interne, sauvegarde de la
télémétrie, variables d'environnement, Docker et dépannage.

> Pour démarrer en 2 minutes, voir **[README.md](README.md)**. Ce document est la
> référence détaillée qui couvre toute la base de code.

---

## 1. Présentation

Application web **temps réel** de station sol pour le suivi d'un ballon
stratosphérique / CubeSat (projet **ICARUS2**). La télémétrie arrive en direct
par **MQTT**, s'affiche sur un globe 3D **Cesium** et des graphes, et est
archivée **localement** (CSV) et dans le **cloud** (Google Sheet).

**Stack :** FastAPI + Python (backend) · React + Redux + Cesium (frontend) ·
MQTT (télémétrie live) · Protocol Buffers (transport).

---

## 2. Commandes `gss`

`tools/dev/gss` est un wrapper de commodité autour de `start-local.sh` et des
logs de dev. Installé une fois par symlink sur le `PATH`, il s'utilise depuis
n'importe où.

```
gss, Ground Station CLI

  gss start [ip]          Démarre la station (upload cloud activé).  Défaut: 10.180.97.23
  gss start defaut        Démarre avec l'IP par défaut (10.180.97.23)
  gss startoffline [ip]   Démarre SANS upload cloud (Google Sheet désactivé)
  gss simulation [csv]    Rejoue un CSV comme télémétrie live (broker local, offline)
  gss simulation fast     Idem, mais 20x plus rapide (0.01s par frame)
  gss kill                Arrête la station (backend + frontend)
  gss verbose [all|front] Suit le log backend en direct (all = +frontend)
  gss debug               Affiche les erreurs / warnings récents
  gss help                Affiche cette aide

Après start / startoffline / simulation, le terminal reste attaché au log backend :
  → CTRL+C arrête TOUT (backend + frontend + simulateur).
  → GS_FOLLOW=0 gss start   garde l'ancien comportement (rend la main, station détachée).

Exemples:
  gss start 10.180.97.45      # broker sur cette IP
  gss start defaut            # IP par défaut
  gss startoffline            # local seulement, pas de cloud
  gss simulation              # rejoue le CSV de vol ICARUS2 (sans matériel)
```

| Commande | Effet |
|---|---|
| `gss start [ip]` | `start-local.sh -Restart -BrokerHost <ip>` (sync cloud ON). Sans ip / `defaut` → `10.180.97.23` |
| `gss startoffline [ip]` | Idem mais `-Offline` (sync Google Sheet forcé OFF ; CSV local quand même écrit) |
| `gss simulation [csv]` | Rejoue un CSV comme télémétrie live (broker local + simulateur), **sans matériel**. Offline et sans capture CSV locale. Défaut : le CSV de vol ICARUS2 (`../Safari_GS_antenna/telemetrySender/src/telemetry.csv`). Nécessite `mosquitto`. |
| `gss simulation fast [csv]` | Idem, mais rejeu **20x plus rapide** (`--delay 0.01` au lieu de `0.2`). `fast` et le CSV sont acceptés dans n'importe quel ordre. |
| `gss kill` | Arrête backend + frontend (+ le simulateur CubeSat, qui n'a pas de port d'écoute) |
| `gss verbose [all\|front]` | `tail -f` du log **backend** (`all` = + frontend, `front` = frontend seul) |
| `gss debug` | Lignes d'erreur/warning récentes du log backend |
| `gss help` | Affiche l'aide |

> **Nommé `gss`, pas `gs`** — `gs` est Ghostscript, un binaire système standard
> qu'on ne doit pas masquer. Le script résout son propre chemin réel (via le
> symlink) pour retrouver `start-local.sh`, donc il fonctionne depuis n'importe
> quel dossier.

---

## 3. Démarrage rapide & installation

### Prérequis
- **Backend** : Python + [Poetry](https://python-poetry.org/).
- **Frontend** : Node.js.
- Un **broker MQTT** accessible (le Raspberry Pi du pont UART→MQTT), **ou** le
  simulateur intégré (sans matériel).

### Installation
```bash
# Backend (crée backend/.venv via Poetry — virtualenvs.in-project = true)
cd backend && poetry install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### Installer la CLI `gss` (une seule fois)
```bash
ln -sf "$PWD/tools/dev/gss" ~/.local/bin/gss      # ~/.local/bin doit être dans le PATH
```
Puis :
```bash
gss start defaut      # démarre, broker = 10.180.97.23, sync cloud ON
gss start <ip>        # broker sur une autre IP
gss startoffline      # local seulement (pas d'upload Google Sheet)
gss simulation        # rejoue le CSV de vol ICARUS2, sans matériel
gss kill              # tout arrêter (backend + frontend)
```

Une fois lancé : **frontend** `http://localhost:5173` · **backend**
`http://localhost:5000`.

### Ou directement via le script `start-local.sh`
```bash
# Matériel live (broker sur le Raspberry Pi 4B)
./tools/dev/start-local.sh -Restart -BrokerHost 10.180.97.23

# Sans matériel (simulateur) — équivalent bas niveau de `gss simulation`
./tools/dev/start-local.sh -Restart -Mqtt -Simulator -Offline \
  -SimCsv ../Safari_GS_antenna/telemetrySender/src/telemetry.csv
```

| Option | Effet |
|---|---|
| `-Restart` | Tue les process sur les ports backend/frontend (+ simulateur) avant de relancer |
| `-Offline` | Force le sync Google Sheet OFF (CSV local non affecté) |
| `-Mqtt` | Démarre un broker Mosquitto local (port 1883) si `MQTT_HOST` est local et non joignable |
| `-Simulator` | Lance `mqtt_cubesat_simulator.py` (publie des frames de test) |
| `-SimCsv <chemin>` | CSV rejoué par le simulateur (défaut `telemetry.csv`, relatif à la racine du dépôt) |
| `-SimDelay <s>` | Délai entre frames simulées (défaut `0.2` ; `gss simulation fast` passe `0.01`) |
| `-BrokerHost <ip>` | Broker MQTT externe (ex. le Raspberry Pi 4B) |
| `-BackendPort <p>` / `-FrontendPort <p>` | Surcharge les ports (défaut 5000 / 5173) |

### Configuration locale (`local.env`)
Les secrets/réglages (ex. l'URL du Google Sheet) vont dans
`tools/dev/local.env` (git-ignoré), chargé automatiquement par `start-local.sh` :
```bash
SHEETS_SYNC_ENABLED=1
SHEETS_WEBAPP_URL="https://script.google.com/macros/s/XXXX/exec"
```

### Détachement des process & logs
Le backend (uvicorn) et le frontend (vite) sont lancés avec `nohup … &` +
`disown` et leurs sorties sont redirigées vers des fichiers `.txt` par service
dans `~/Desktop/ground-station-logs/` (`ground-station-backend.txt`,
`ground-station-frontend.txt`). Emplacement surchargeable via `GS_LOG_DIR`. Cela
garde le prompt interactif utilisable — sinon les logs uvicorn/vite noient les
frappes.

Les services restent détachés, mais **`gss start` / `startoffline` / `simulation`
se ré-attachent ensuite au log backend** (équivalent d'un `gss verbose`
automatique) via un `tail -f` en avant-plan avec un trap `SIGINT`. Dans ce
terminal, **`Ctrl+C` arrête toute la station** (le trap appelle `cmd_kill` :
backend + frontend + simulateur). Depuis un autre terminal — ou si l'on a lancé
avec **`GS_FOLLOW=0`** (qui garde l'ancien comportement : rend la main
immédiatement, station détachée) — utiliser `gss kill` / `-Restart` (qui tuent ce
qui écoute sur les ports backend/frontend). Suivre les logs avec `gss verbose` ou
`tail -f ~/Desktop/ground-station-logs/*.txt`.

### Lancer le backend manuellement (sans le script)
```bash
cd backend
MQTT_TELEMETRY_ENABLED=1 MQTT_BROKER_HOST=10.180.97.70 .venv/bin/python app.py
```
Poetry crée le virtualenv à `backend/.venv` (`virtualenvs.in-project = true` dans
`poetry.toml`). Lancer `poetry install` une fois dans `backend/`.

---

## 4. Pipeline matériel

```
┌─────────────────────────┐
│   Raspberry Pi Pico     │  Rejoue la donnée de vol ICARUS2 (7 681 records @ 1 s)
│   (émetteur télémétrie) │  depuis un CSV embarqué, encapsulée CFDP sur USB série
└────────────┬────────────┘
             │  USB CDC — /dev/ttyACM0 (115200 bauds)
             ▼
┌─────────────────────────┐
│   Raspberry Pi 4B       │  uart_mqtt_bridge.py : retire l'entête CFDP,
│   (gs-modem)            │  encode en protobuf, publie sur le broker MQTT
└────────────┬────────────┘
             │  MQTT — topic : icarus2/telemetry/frame.pb (port 1883)
             ▼
┌─────────────────────────┐
│   Ground Station        │  Backend FastAPI + frontend React
│   (cette application)   │  affiche la télémétrie en direct
└─────────────────────────┘
```

Le backend se connecte directement au broker du RPi — pas besoin de mosquitto
local. Le RPi (`gs-modem`) doit avoir `uart_mqtt_bridge.py` en marche et son
mosquitto accessible (`listener 1883`, `allow_anonymous true`).

---

## 5. Fonctionnalités

### Visualisation temps réel
- Globe **3D Cesium** : trajectoire du CubeSat, modèle 3D du CubeSat orienté par
  l'IMU, position de la station sol (GS), faisceau de liaison, projection au sol
  — mis à jour à 1 Hz.
- Mode **« Suivre CubeSat »** : caméra verrouillée sur la position courante
  (zoom ~27 km).
- **Position GS** configurable et persistée (partagée entre les vues).
- Trajectoire **incrémentale** (perf : O(1) par rafraîchissement).
- **Zones de danger feu de forêt** : le CubeSat scanne le sol et signale des zones
  à risque dans sa télémétrie. Elles ne s'affichent **pas d'un bloc** : la forme est
  **découpée par l'empreinte caméra** et seule la partie **vue** (dans le rectangle
  de projection) est peinte, au fil du balayage — s'il n'a vu qu'un quart d'un
  cercle, seul ce quart apparaît. Couleurs — **rouge = grand danger**, **orange =
  danger**, **jaune = petit danger**. Toggle **« Zones feu »** + légende dans le
  panneau droit Cesium.

### Barre supérieure (topbar)
- **Heure** — horloge locale en direct.
- **Météo** + **Vent** — via Open-Meteo (sans clé API), basés sur la position GS.
- **Décompte T** — sélecteur date/heure de lancement → compte à rebours
  **T- / T+** en direct.

### `/station` configurable
- **Panneaux graphes** : n'importe quel couple de champs X/Y, glisser-déposer,
  favoris (synchronisés avec `/analyse`), bouton **All Temp** (T1–T8 d'un coup).
- **Panneau cube 3D** : widget d'attitude du CubeSat (modèle `cubesat.glb`)
  orienté en direct par le quaternion IMU.
- **Panneaux terminaux** : `télémétrie` / `verbose` / `erreurs`.
- Configuration **persistée** (localStorage), **import/export JSON**.

### Détection de coupure de télémétrie
- **Frontend** : ligne rouge fantôme + `[RPI_DISCONNECTED]` dès que la
  télémétrie s'arrête (> 3 s), `[TELEMETRY_RESUMED]` au retour. Les coupures
  passées sont reconstruites au rafraîchissement de la page.
- **Backend** : watchdog qui logge `[RPI_DISCONNECTED]` en **WARNING** →
  visible dans `gss debug`.

### Sauvegarde de la télémétrie (en parallèle, indépendantes)
- **CSV local par jour** sur le Desktop : `~/Desktop/telemetry/<date>.csv`
  (même format que la donnée de vol ICARUS2, donc réutilisable tel quel).
- **Google Sheet en direct** : un **onglet par jour** (nommé par la date), via
  un Web App Apps Script — aucune clé/credential côté backend.

### Outillage
- **CLI `gss`** : `start`, `startoffline`, `simulation`, `kill`, `verbose`, `debug`, `help`.
- **Logs `.txt`** sur le Desktop : `~/Desktop/ground-station-logs/`.

---

## 6. Pages & routes

| Route | Composant | Rôle |
|---|---|---|
| `/` | redirect | Redirige vers `/station` |
| `/station` | `StationDashboard` | Vue opérateur : carte Cesium + colonne gauche **configurable** (graphes + cube 3D + terminaux) + barre de stats + terminal d'erreurs |
| `/vueGlobe3d` | `TelemetryDashboard` | Globe 3D Cesium plein écran (trajectoire, stats) |
| `/analyse` | `AnalyseDashboard` | Grille de graphes Recharts entièrement configurable |
| `/cubesat` | `CubeSatDashboard` | Vue annotée du CubeSat et de ses sous-systèmes |
| `/rapport` | `RapportDashboard` | Export **PDF** des graphes (/station + /analyse) en un clic (`window.print()`) |

### Source de données MQTT unique
Toutes les routes consomment la télémétrie MQTT live — le sélecteur de source
CSV/MQTT a été retiré de la topbar. Le `sourceMode` Redux reste à sa valeur par
défaut `'mqtt'` ; l'action `setSourceMode` et le helper `parseTelemetryCsv`
restent disponibles pour un usage futur mais aucune UI ne change plus de mode.

---

## 7. Architecture technique

### 7.1 Structure du dépôt

```
ground-station/
├── backend/                  # Serveur Python (FastAPI) — Poetry
│   ├── app.py                # Point d'entrée — démarre Uvicorn
│   ├── logconfig.yaml        # Configuration de logs (colorlog)
│   ├── poetry.toml           # virtualenvs.in-project = true (.venv dans backend/)
│   ├── server/
│   │   ├── startup.py        # App FastAPI, routes HTTP, CORS, fichiers statiques
│   │   └── telemetry_protobuf.py  # Encode/décode Protocol Buffers
│   ├── pipeline/
│   │   ├── mqtt_telemetry_receiver.py  # Client paho MQTT, topic icarus2/telemetry/frame.pb
│   │   ├── telemetry_store.py          # Deque en mémoire des frames (maxlen 5000)
│   │   ├── telemetry_csv_logger.py     # Ajoute chaque frame MQTT à un CSV local par jour
│   │   └── telemetry_sheets_sync.py    # Batch frames → Google Sheet (Apps Script Web App)
│   └── common/
│       ├── arguments.py      # Parsing CLI (host, port, log-level) + défauts
│       └── logger.py         # logging basicConfig (stdlib)
│
├── frontend/                 # Client React (Vite)
│   ├── index.html            # Entrée HTML — favicon SAFARI.png
│   ├── vite.config.js        # Build Vite + plugin Cesium + proxy backend
│   ├── package.json          # Deps : React, MUI, Redux, Cesium, Recharts, three
│   ├── public/               # Assets statiques
│   │   ├── SAFARI.png        # Logo SAFARI (favicon)
│   │   ├── CSA.png / ETS.jpg / Lassena.png / seds.png  # Logos partenaires (topbar)
│   │   ├── cubesat.png       # Image du CubeSat
│   │   └── cubesat.glb       # Modèle 3D du CubeSat (attitude live + carte)
│   └── src/
│       ├── main.jsx                  # Racine React — router + Redux Provider
│       ├── App.jsx                   # ThemeProvider + CssBaseline
│       ├── theme.js / theme-configs.js  # Thème sombre MUI + palette
│       ├── store.jsx                 # Store Redux (slice telemetry)
│       ├── layout.jsx                # Topbar + sidebar hover-expand + <Outlet>
│       ├── topbar-widgets.jsx        # Widgets topbar : Heure, Météo + Vent, Décompte T
│       ├── navigation.jsx            # Définition sidebar (5 routes)
│       ├── page-actions-context.jsx  # Contexte des boutons d'action par page
│       ├── error-page.jsx            # Page d'erreur
│       └── pages/
│           ├── station/station-dashboard.jsx      # /station — vue opérateur MQTT
│           ├── vueGlobe3d/telemetry-dashboard.jsx # /vueGlobe3d — globe Cesium
│           ├── analyse/analyse-dashboard.jsx      # /analyse — grille de graphes
│           ├── cubesat/                           # /cubesat — vue annotée + sous-systèmes
│           │   ├── cubesat-dashboard.jsx
│           │   ├── cubesat-annotated-visual.jsx
│           │   ├── cubesat-subsystem-panel.jsx
│           │   ├── cubesat-config.js
│           │   └── cubesat-utils.js
│           ├── rapport/rapport-dashboard.jsx      # /rapport — export PDF
│           └── shared/                            # Composants et utilitaires partagés
│               ├── cesiumViewport.jsx         # Globe Cesium + panneau droit (zoom, position GS, modèle CubeSat)
│               ├── attitudeCube.jsx           # Widget 3D d'attitude (three.js, quaternion IMU)
│               ├── telemetryChart.jsx         # Graphe Recharts (décimé à 800 pts)
│               ├── telemetryStatsBar.jsx      # Barre de stats (8 cartes)
│               ├── telemetryTerminal.jsx      # Terminal flux brut (télémétrie/verbose/erreurs)
│               ├── chartTitle.jsx             # Titre dynamique
│               ├── telemetry-components.jsx   # StatisticCard, ChartCard, TelemetrySummary
│               ├── telemetry-slice.jsx        # Slice Redux — données télémétrie (sourceMode: mqtt)
│               ├── use-telemetry-stream.jsx   # Hook — load, playback, poll MQTT incrémental
│               ├── telemetry-data-source.js   # Parsing CSV/Protobuf, limite d'affichage 5000
│               ├── telemetry-protobuf.js      # Décodage protobuf
│               ├── telemetry-utils.js         # distanceKm, getMqttSourceStat, helpers
│               ├── cesium-utils.js            # geo record, imagery, position GS, hauteur follow
│               ├── chart-fields.js            # AVAILABLE_FIELDS, TEMP_FIELD_KEYS
│               ├── chart-logic.js             # FSPL, bilan de liaison, enrich()
│               ├── telemetry-worker.js        # Web Worker — buildTelemetryChartData + enrich off-thread
│               ├── useAnimatedDomain.js       # Animation lisse des axes
│               └── ground-station-view.css    # Styles globaux (barre de stats, globe)
│
├── tools/
│   ├── dev/
│   │   ├── gss              # CLI (wrapper de start-local.sh)
│   │   ├── start-local.sh   # Démarrage local (MQTT, Simulator, Restart, BrokerHost…)
│   │   └── local.env        # Secrets/overrides (git-ignoré)
│   └── simulators/
│       └── mqtt_cubesat_simulator.py  # Simulateur MQTT — publie des frames protobuf
│
├── Dockerfile               # Build multi-étapes : Node → Python 3.12
├── LICENSE
├── Documentation.md         # Ce document
├── README.md                # Manuel de démarrage rapide
└── system-architecture.drawio  # Diagramme draw.io (RFD900x → Jetson → Ground Station)
```

Le CSV de vol canonique ICARUS2 (7 681 lignes @ 1 s) n'est **pas** dans ce dépôt ;
il est rejoué par le simulateur depuis
`../Safari_GS_antenna/telemetrySender/src/telemetry.csv`.

### 7.2 Flux de données

#### Télémétrie (MQTT live — défaut pour toutes les routes)

```
Pico (USB /dev/ttyACM0) → Raspberry Pi 4B
  └─► uart_mqtt_bridge.py
        └─► Broker MQTT :1883
              └─► mqtt_telemetry_receiver.py (daemon)
                    └─► telemetry_store (deque maxlen 5000)
                         └─► GET /api/telemetry/mqtt/frames ──►
                                                              ▼
                                         use-telemetry-stream.jsx (hook)
                                           poll toutes les 1 s
                                           détection de changement par empreinte de contenu
                                           (détecte la fenêtre glissante quand le deque est plein)
                                           stampe _epoch_ms sur chaque frame au démarrage de
                                           session pour que l'axe X ne dérive pas quand la
                                           fenêtre de 5000 frames glisse
                                           load initial → setTelemetryData (toutes les frames)
                                           incrémental → appendTelemetryPoints (batché,
                                           un update Redux par poll au lieu d'un par frame)
                                                              ▼
                                         buildTelemetryChartData()
                                           _elapsed_s / _elapsed_min ← m-time (champ protobuf)
                                           GPS, altitude, vitesse, températures
                                                              ▼
                                         enrich() (chart-logic.js)
                                           _fspl     ← Free Space Path Loss
                                           _bilan    ← Bilan de liaison (dBm)
                                           _distance ← distance verticale (m)
                                                              ▼
                                         TelemetryChart (≤800 pts décimés)
                                         CesiumViewport (trajectoire incrémentale)
                                         TelemetryStatsBar
```

#### Resume au changement de route (MQTT)

Naviguer entre routes MQTT (ex. `/station` → `/analyse` → `/station`) démonte et
remonte le composant de page, dont son hook `useTelemetryStream`. L'effet MQTT :

- **Cleanup** n'efface que l'intervalle de poll, PAS les données télémétrie Redux
  — l'état Redux est la source de vérité et survit au démontage.
- **Mount** lit `telemetry.telemetryData` depuis Redux. S'il existe des données de
  forme MQTT (frames avec `_epoch_ms`), il amorce le contexte de poll `live` avec
  `shownCount = -1` (sentinelle) et `lastRowKey` dérivé de la dernière frame
  RÉELLE (non-blackout). Le premier poll cherche cette clé dans le deque backend
  pour trouver le point de reprise, dispatche seulement les lignes arrivées
  depuis, et préserve les frames fantômes de coupure en place. Si la clé est
  introuvable (deque roulé au-delà, ou backend redémarré), fallback propre :
  `clearTelemetryData()` + load initial.
- **`keepMonotonicSuffix`** est appliqué aux lignes backend au load initial. Le
  firmware Pico boucle son CSV depuis la ligne 1 après chaque passe complète — le
  deque de 5000 frames peut donc contenir des frames de deux cycles consécutifs
  avec un saut de `mission_time` en arrière (~2 h) à la frontière. Sans découpe,
  le graphe zigzaguerait après un refresh car `_epoch_ms` est ancré à la PREMIÈRE
  (plus ancienne) frame du deque. Le helper remonte les frames réelles (fantômes
  ignorées) et retourne la plus longue queue où `mission_time` est
  non-décroissant ; l'epoch est re-dérivé de la première frame gardée.
- Un flag `isMounted` par closure d'effet protège des dispatches tardifs si
  l'utilisateur navigue pendant un `fetch` en vol.

### 7.3 `/station` — barre de stats

La ligne du haut de la colonne droite est un conteneur flex horizontal :

- **TelemetryStatsBar** (flex: 1) — 8 cartes à largeur fixe :

  | Carte | Clé | Largeur | Couleur |
  |---|---|---|---|
  | ALTITUDE | `U_Alt` | 80 px | vert |
  | DISTANCE | calculée | 80 px | bleu |
  | VITESSE | `Speed` | 80 px | orange |
  | GPS SAT | `#_Sat` | 60 px | violet |
  | PRESSION | `Pressure` | 80 px | cyan |
  | LINK BDG | `_bilan` | 80 px | #22d3ee |
  | STATUS | — | 80 px | vert |
  | SOURCE | état MQTT | 75 px | vert/orange/gris |

  Les cartes ont une largeur max fixe et ne grandissent jamais. `valueFontSize()`
  réduit la taille du texte (12 → 10 → 9 → 8 px) quand la valeur dépasse 8
  caractères pour toujours tenir sans débordement. `pointer-events: none` — pas
  d'effet au survol.

- **TelemetryTerminal variant="errors"** (largeur 25vw) — terminal d'erreurs
  toujours visible à l'extrême droite, même largeur que la colonne gauche.

### 7.4 `/station` — système de panneaux de la colonne gauche

La colonne gauche (25 %) est entièrement configurable via le menu **Modifier** :

- **Panneaux graphes** — n'importe quel couple X/Y de `AVAILABLE_FIELDS` ;
  déplaçables, supprimables, favorisables (synchronisés avec les favoris
  `/analyse`). Un nouveau graphe prend une couleur **aléatoire** de `CHART_COLORS`.
- **Panneau cube 3D** (`type: 'cube'`, composant `AttitudeCube`) — modèle 3D du
  CubeSat (`public/cubesat.glb`, three.js + GLTFLoader) orienté en direct par le
  quaternion IMU (`Quat_w/x/y/z`). Rendu **à la demande** (seulement quand le
  modèle bouge), car Cesium rend déjà le globe en continu sur la même page.
- **Panneaux terminaux** — trois variantes, au plus une de chaque. Chaque
  variante limite ses lignes retenues (`slice(-maxLines)`) pour éviter le lag :
  `telemetry` → 5 lignes, `verbose` → 1 ligne, `errors` → 500 lignes.
  - `telemetry` — champs télémétrie clés, vert
  - `verbose` — tous les champs non-internes, jaune
  - `errors` — détection d'anomalie (GPS perdu, peu de satellites,
    altitude/pression manquante) + transitions de coupure : **une** ligne
    `[RPI_DISCONNECTED]` au début d'une vraie coupure Pi/broker, **une** ligne
    `[BLACKOUT_SIM]` au début d'une simulation manuelle, **une** ligne
    `[TELEMETRY_RESUMED]` en **vert** (`#59d98b`) au retour des frames réelles.

#### Bloc « statut station » (état vide des terminaux)

Quand un terminal n'a **aucune ligne**, il rend un **bloc de statut station live**
(`StationStatus` dans `telemetryTerminal.jsx`) pour que l'opérateur sache
*pourquoi* rien n'arrive. Chaque terminal poll `GET /api/status` toutes les 2 s :

- **Broker** — ✓ connecté / ✗ NON connecté à `<host:port>` (depuis
  `_broker_connected`, posé dans les callbacks MQTT `on_connect`/`on_disconnect`).
- **Télémétrie** — ✓ active / ✗ aucune trame, avec nombre de frames et âge de la
  dernière (`last_frame_age_sec`).
- **RFD** — ✓ branché / ✗ non branché / ? inconnu. Dérivé côté serveur.
- Une ligne **d'indice** adaptée à l'état (`gss start <ip>` si broker down,
  « brancher le RFD » si déconnecté, « en attente de trames » si idle).

Tout l'état des terminaux (`lines`, `cursor`, `inBlackout`) vit dans le slice
Redux `telemetry.terminalState` par variante, et survit au démontage/remontage de
route. Le curseur de traitement avance par batch dispatché pour que les terminaux
remontés ne rejouent que les nouvelles frames.

**Défaut si vide** — `loadLeftColumnItems()` retombe sur `DEFAULT_LEFT_COL_ITEMS`
(un terminal **telemetry** + un terminal **verbose**) quand il n'y a ni config
sauvée ni favoris `/analyse`. Config persistée dans `localStorage`
(`station_left_column_config`) ; favoris synchronisés avec `/analyse` via
`analyse_charts_config`.

#### Raccourci All Temp (`/station` et `/analyse`)
Le bouton **All Temp** ajoute T1–T8 (les 8 champs de température) d'un coup, chacun
avec une couleur distincte de `CHART_COLORS`. Désactivé une fois tous présents.
`TEMP_FIELD_KEYS` est exporté depuis `chart-fields.js`.

### 7.5 Détection de coupure réelle (toutes les routes)

Une vraie coupure (Pi débranché, broker injoignable) est détectée depuis le
frontend de deux façons complémentaires.

**Détection live** — centralisée dans `useTelemetryStream` pour que chaque
consommateur (`/station`, `/analyse`, `/vueGlobe3d`…) ait la ligne rouge fantôme
sans réimplémenter le watchdog. Le hook suit `lastMqttFrameAt` (mis à jour à
chaque frame réelle). Un watchdog 1 s passe `autoOutageActive = true` quand
`Date.now() - lastMqttFrameAt > 3 s`. Tant qu'actif, un second effet injecte des
frames fantômes (`_blackout: true`, `_realOutage: true`, valeurs Y gelées) toutes
les 1 s. Le poll MQTT continue de tourner pendant la coupure, donc dès le retour
des frames réelles `lastMqttFrameAt` se rafraîchit, `autoOutageActive` se
désactive, l'injection s'arrête, et `blackoutOffsetSec` lisse l'axe X.

**Reconstruction au refresh** — les frames fantômes ne vivent qu'en Redux ; un
refresh les efface. Deux mécanismes les préservent :

1. **`reconstructOutages`** (première passe de `buildTelemetryChartData`) — scanne
   les frames réelles consécutives et, quand leur écart de `mission_time` dépasse
   `OUTAGE_GAP_THRESHOLD_SEC` (2 s), insère des fantômes `_synthesized: true` (un
   par seconde manquante). Surface les coupures antérieures à l'ouverture de la
   page, tant que les frames encadrantes sont dans le deque backend.
2. **Persistance `sessionStorage` de `telemetryData`** — un effet **throttlé** (2 s)
   sérialise `telemetryData` sous `mqtt_telemetry_data_v1`. Throttle (pas
   debounce !) est essentiel : sous 1 Hz continu un debounce ne se déclencherait
   jamais. Un listener `beforeunload` flush le dernier snapshot. Au mount, si
   Redux est vide (après F5), l'effet MQTT restaure depuis le storage puis le
   chemin de resume (`shownCount = -1`) rattrape le backend. Storage en
   `sessionStorage` (pas `localStorage`) → un nouvel onglet repart de zéro ;
   `QuotaExceeded` avalé silencieusement, fallback sur `reconstructOutages`.

**Watchdog backend** — la détection ci-dessus est frontend-only, donc n'atteint
jamais le log backend. Un watchdog côté serveur dans `mqtt_telemetry_receiver.py`
la reflète : `on_message` stampe `_last_frame_at`, et un thread 1 Hz logge un
**WARNING** `[RPI_DISCONNECTED] télémétrie non reçue` après `MQTT_FRAME_TIMEOUT_SEC`
(3 s) sans frame, plus un INFO `[TELEMETRY_RESUMED]` au retour. Comme c'est un
WARNING, la déconnexion apparaît aussi dans `gss debug`. Ne se déclenche qu'après
la première frame (un démarrage jamais-connecté n'est pas une coupure).

### 7.6 Forwarding des logs du pont Pi (erreurs Pi → terminal erreurs)

Le pont UART→MQTT côté Pi (`uart_mqtt_bridge_rfd.py` sur `gs-modem`) forwarde ses
sorties **erreur/warning** vers la station pour que l'opérateur voie les problèmes
Pi (port série perdu, erreurs de parse, reconnexions) sans SSH. Il réutilise le
broker existant — pas de port supplémentaire.

```
Pont Pi  ──publish──►  topic MQTT icarus2/bridge/log   (JSON {ts, level, source, msg})
                              │
mqtt_telemetry_receiver.py    │  on_message route le topic vers _handle_bridge_log
  └─► bridge_log_store (deque maxlen 500, id monotone)
        └─► logger.warning("[BRIDGE:gs-modem] …")   → apparaît aussi dans `gss debug`
        └─► GET /api/bridge/logs?after=<id>  ──►
                                                 ▼
                          telemetryTerminal.jsx (variant="errors")
                            poll toutes les 2 s avec le dernier id vu (persisté en
                            Redux terminalState.errors.bridgeLogId)
                            → lignes rouges [gs-modem] (WARN = ambre, ERROR = rouge)
```

- **Côté Pi** — un shadow de `print()` publie toute ligne contenant un indice
  d'erreur/warning (`error`, `skipped`, `fail`, `exception`, `reconnect`…) sur
  `icarus2/bridge/log`. Le publish est dans un `try/except` pour ne jamais
  affecter le pont.
- **Backend** — `_handle_bridge_log` parse le JSON (fallback texte brut), stocke
  dans `bridge_log_store`, logge un WARNING. Deux raffinements :
  - **Humanize** — `_humanize_bridge_message` réécrit l'échec brut d'ouverture
    série (`Serial error: … could not open port /dev/ttyUSB0: No such file …`,
    imprimé toutes les 3 s quand l'adaptateur USB du RFD est débranché) en
    **`[RFD_DISCONNECTED] RFD non branché sur le Pi (/dev/ttyUSB0 introuvable)`**.
  - **Dedup** — `bridge_log_store.add_log` supprime les lignes identiques
    consécutives dans `_DEDUP_WINDOW_SEC` (60 s), donc la boucle de reconnexion
    3 s se réduit à une ligne. Le miroir WARNING est aussi conditionné à un retour
    non-`None`, donc `gss debug` n'est pas inondé.
- **Frontend** — le terminal d'erreurs fusionne ces lignes dans le même buffer de
  500 lignes que ses anomalies dérivées de la télémétrie.

### 7.7 Widgets topbar, position GS, suivi, légende /rapport

**Widgets topbar** (`topbar-widgets.jsx`) — cluster global route-indépendant dans
l'`AppBar`, tous cadencés par un intervalle 1 Hz partagé (`useNow`) :
- **Heure** — horloge locale (`fr-CA`, 24 h) + date.
- **Météo** — température + icône/label mappé sur le code WMO.
- **Vent** — vitesse (km/h) + direction 8 points (N, NE, E, SE, S, SO, O, NO).
- **Décompte T** — sélecteur `datetime-local` persisté (`launch_datetime`), puis
  compte à rebours `T- HH:MM:SS` qui bascule en `T+ …` après le lancement.

Météo et Vent partagent un fetch dans `useWeather()` contre **Open-Meteo**
(sans clé), avec la lat/lon GS de `loadGroundStationPosition()`, rafraîchi toutes
les 10 min. Pour changer de fournisseur, remplacer `fetchWeather()` — il doit
juste résoudre `{ tempC, windKmh, windDir, code }`.

**Position GS** — configurable via **« Position GS ▼ »** dans le panneau droit
Cesium (sur `/station` et `/vueGlobe3d`) :
- Persistée dans `localStorage` sous `station_ground_station_position`.
- Partagée entre routes via `loadGroundStationPosition()` /
  `saveGroundStationPosition()` (`cesium-utils.js`).
- Défaut : `{ lat: 48.55, lon: -81.35 }` (site de lancement ICARUS2).
- Entité Cesium : point vert + label « GS », toujours visible. Faisceau de liaison
  (ligne verte) tracé de la GS vers la position CubeSat courante.

**Mode « Suivre CubeSat »** — verrouille la caméra sur la position courante,
mise à jour à 1 s. `MAP_FOLLOW_CAMERA_HEIGHT = 27000` m (27 km). La caméra
utilise `Math.min(cameraHeightRef.current, MAP_FOLLOW_CAMERA_HEIGHT)`. Pitch et
heading identiques à la caméra libre (`MAP_CAMERA_PITCH = −48°`,
`MAP_CAMERA_HEADING = 32°`).

**Dédup de légende /rapport** — quand un graphe contient des frames de coupure,
chaque série Y est scindée en une ligne `_normal` et une `_ghost` (rouge). Les
`<Line>` fantômes portent `legendType="none"` pour que seule la série normale
apparaisse dans la légende Recharts.

### 7.8 Zones de danger feu de forêt

Le CubeSat scanne le sol à la recherche de risques de feu de forêt et signale les
zones détectées **dans sa télémétrie**. La station sol ne dessine **jamais la zone
entière d'un coup** : l'opérateur ne voit que la partie de la zone **à l'intérieur
de l'empreinte caméra** (le même rectangle `stripes.png` projeté au sol). À chaque
frame, la forme géométrique de la zone est **découpée (clippée) par le quadrilatère
d'empreinte** et seule cette intersection est peinte ; les morceaux s'accumulent. Si
la caméra n'a vu qu'un **quart** d'un cercle, seul ce quart est affiché — jamais le
cercle complet.

```
Simulateur (mqtt_cubesat_simulator.py)
  build_fire_zone() injecte une détection toutes les ~450 frames, SUR le track
  (jitter ~300 m) pour que l'empreinte caméra passe réellement dessus
  → champs protobuf 25-29 : fire_zone_level / lat / lon / radius_m / shape
        (émis SEULEMENT quand level>0 — les frames normales gardent leur taille)
      └─► broker MQTT → mqtt_telemetry_receiver → store → /api/telemetry/mqtt/frames
            └─► telemetry-protobuf.js décode → Fire_Level / Fire_Lat / Fire_Lon /
                Fire_Radius / Fire_Shape sur chaque record (préservés par ...item)
                  └─► cesiumViewport.jsx :
                      (1) enregistre chaque zone avec son contour (fireZoneShapeLonLat)
                          — rien n'est dessiné à ce stade
                      (2) passe de révélation : pour chaque frame, calcule l'empreinte
                          caméra (computeCameraFootprint) et CLIPPE la forme par le
                          quad (clipPolygonConvex, Sutherland–Hodgman) → peint
                          l'intersection zone ∩ vision
                      (3) échantillonné au déplacement (~60% de la taille d'empreinte)
                          pour ne pas empiler les patchs ; les patchs persistent (même
                          après éviction de la frame du deque)
```

- **Niveau → couleur** : `1` jaune (**petit danger**), `2` orange (**danger**),
  `3` rouge (**grand danger**). **Forme** : `1` cercle (48-gone), `2` triangle,
  `3` carré — c'est le **sujet** du clipping, donc le bord extérieur du patch suit
  exactement la géométrie de la zone ET l'empreinte.
- **Révélation = empreinte caméra** : mêmes optiques que la projection `stripes.png`
  (`computeCameraFootprint`), donc les patchs apparaissent exactement là où passe le
  rectangle de projection, et **jamais en dehors**. La passe est **incrémentale**
  (reprend après la dernière frame traitée via `m-time`) et **rejoue tout
  l'historique** au refresh pour reconstruire le balayage.
- **Toggle** `mapOptions.fireZones` (bouton **« Zones feu »**) + légende couleurs
  dans le panneau droit ; visible sur `/station` et `/vueGlobe3d`.
- **Persistance** : les champs `Fire_*` voyagent sur les frames (survivent au refresh
  via sessionStorage) ; les patchs déjà dessinés restent affichés même après éviction
  de la frame source du deque.
- **Enregistrement** : les colonnes `Fire Level / Fire Lat / Fire Lon / Fire Radius
  / Fire Shape` sont ajoutées **en fin** du CSV local par jour et du Google Sheet
  (les 19 colonnes ICARUS2 de tête restent identiques). Désactiver l'injection
  simulée : `mqtt_cubesat_simulator.py --no-fire-zones`.

### 7.9 État Redux

| Slice | Contenu |
|---|---|
| `telemetry` | `telemetryData`, `sourceData`, `playbackIndex`, `streamIndex`, `mode`, `sourceMode` (défaut `'mqtt'`), `loading`, `error`, `terminalState` (par variante `{ lines, cursor, inBlackout }` pour survivre au démontage/remontage de route) |

### 7.10 API HTTP (backend FastAPI)

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/telemetry/mqtt/frames` | Frames du store MQTT en Protocol Buffers (live) |
| `GET` | `/api/telemetry/mqtt/status` | État de connexion du broker MQTT |
| `POST` | `/api/telemetry/mqtt/clear` | Vide le store MQTT |
| `GET` | `/api/bridge/logs?after=<id>` | Lignes erreur/warning forwardées par le pont Pi (incrémental par id) |
| `GET` | `/api/status` | Statut opérateur agrégé : broker connecté ?, télémétrie active ?, RFD connecté ? (alimente le bloc statut des terminaux) |
| `GET` | `/*` | Fallback SPA → `dist/index.html` (fichiers statiques montés via `StaticFiles`) |

### 7.11 Calculs physiques (`chart-logic.js`)

| Champ | Formule | Unité / Step |
|---|---|---|
| `_fspl` | `20·log₁₀(4π·d·f / c)` avec f=437 MHz | dB |
| `_bilan` | `TX(30 dBm) + TX_gain(8) − FSPL + RX_gain(10)` | dBm |
| `_elapsed_s` | `(timestamp − epoch) / 1000` — `epoch = data[0]._epoch_ms` (stable). Frames de coupure : `lastRealElapsed + N` | s · step 100 |
| `_elapsed_min` | `_elapsed_s / 60` | min · step 10 |

### 7.12 Notes de performance

| Composant | Technique |
|---|---|
| Poll MQTT | Détection par empreinte de contenu — détecte les nouvelles frames même quand le deque est plein (fenêtre glissante) ; ne dispatche que le nouveau via `appendTelemetryPoints` (batché) |
| Epoch stable | La mission-time de la première frame est stockée dans `live.epochMs` et stampée `_epoch_ms` sur chaque frame ; l'origine de l'axe X ne dérive pas quand les vieilles frames sont évincées |
| Trajectoire Cesium | Incrémentale : ne convertit que les nouveaux points GPS en `Cartesian3` ; O(1) par poll. Cachée dans `trajectoryPositionsRef` |
| TelemetryChart | Décime à ≤800 points pour le rendu SVG ; dataset complet gardé pour domaine/axes/scroll |
| Pipeline off-thread | `buildTelemetryChartData` + `reconstructOutages` + `enrich` (FSPL / bilan / distance) tournent dans un **Web Worker** (`telemetry-worker.js`, instancié par mount de `useTelemetryStream` via l'import `?worker` de Vite). Un `requestId` monotone jette les résultats périmés. Premier rendu (et environnements sans Worker) : fallback synchrone main-thread. Avec `useDeferredValue` sur les données du graphe, Cesium et Recharts restent fluides même avec des rebuilds de 5000 frames |

---

## 8. Sauvegarde de la télémétrie

### 8.1 CSV local par jour (automatique)

Chaque frame reçue en MQTT est ajoutée à un CSV local par
`pipeline/telemetry_csv_logger.py` (appelé depuis `on_message`, juste après
`telemetry_store.add_frame`). C'est **indépendant** du deque de 5000 frames — le
deque est la fenêtre d'affichage live, le CSV est une capture durable par jour.

- **Fichiers par jour** — un fichier par jour calendaire local, nommé par la date
  (`<YYYY-MM-DD>.csv`). Rotation à minuit ; header écrit une fois par nouveau
  fichier.
- **Format** — 19 colonnes de tête identiques à l'enregistrement canonique ICARUS2
  (`m-time, Flight ID, Ublox UTC, U Lat, U Long, U Alt, Speed, Vert speed, #Sat,
  Pressure, MIU, T1…T8`), donc interchangeable avec la donnée de vol, suivies des
  5 colonnes de zone feu (`Fire Level, Fire Lat, Fire Lon, Fire Radius, Fire
  Shape`), non nulles seulement sur les frames de détection.
- **Emplacement** — `TELEMETRY_CSV_DIR`, défaut `~/Desktop/telemetry/` (hors du
  dépôt). Désactivable avec `TELEMETRY_CSV_LOG_ENABLED=0`.
- **Durabilité** — chaque ligne est `flush()`ée immédiatement. Un seul échec
  d'ouverture désactive le logging (pas de spam) ; le reste du pipeline n'est pas
  affecté.

### 8.2 Miroir vers Google Drive (rclone)

Google n'a pas de client Drive natif Linux, donc le CSV est poussé avec
[`rclone`](https://rclone.org). Setup unique :

```bash
sudo apt install rclone
rclone config            # nouveau remote → "drive" → autoriser dans le navigateur → nommer "gdrive"
```

Puis mirroir périodique (push-only, 30 s ici) ; `rclone copy` du dossier
ré-uploade seulement les fichiers modifiés :

```bash
while true; do
  rclone copy ~/Desktop/telemetry gdrive:GroundStation/
  sleep 30
done
```

Pour un setup non-attendu, préférer un **timer systemd** ou cron, ou
`rclone bisync` pour une sync bidirectionnelle.

### 8.3 Sync Google Sheet en direct (Apps Script Web App)

Alternative au miroir CSV, `pipeline/telemetry_sheets_sync.py` pousse les frames
**directement dans un Google Sheet**. Câblé dans `on_message` à côté du logger
CSV, tourne indépendamment.

- **Batching** — les frames sont bufferisées et flushées en un POST HTTP toutes
  les `SHEETS_SYNC_INTERVAL_SEC` (défaut 5 s), pas une requête par frame, pour
  rester sous les quotas Apps Script. Buffer plafonné à 5000 lignes (plus
  anciennes droppées sous backpressure). Un flush échoué re-queue ses lignes et
  retente au tick suivant.
- **Onglets par jour** — chaque batch porte un champ `tab` = date locale
  (`YYYY-MM-DD`). Le Web App écrit dans cet onglet, le créant (avec header) au
  premier usage. Le **CSV local reste l'archive complète et non-bornée.**
- **Aucun credential backend** — le Web App tourne comme propriétaire du sheet,
  donc le backend n'a besoin que de l'URL de déploiement ; il POST
  `{ header, values }` en JSON avec la stdlib (`urllib`).
- **Config** — `SHEETS_SYNC_ENABLED=1` + `SHEETS_WEBAPP_URL=<…/exec>`. Les deux
  sont passés par `start-local.sh`.

**Côté Apps Script** (coller dans le sheet → Extensions → Apps Script, puis
Déployer → Nouveau déploiement → *Application Web* → Exécuter en tant que *Moi* →
Accès *Tout le monde* → copier l'URL `/exec`) :

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

Backend et frontend écrivent dans `~/Desktop/ground-station-logs/*.txt`
(`gss verbose` pour les suivre). Emplacement via `GS_LOG_DIR`.

---

## 9. Variables d'environnement

### Backend

| Variable | Défaut | Rôle |
|---|---|---|
| `MQTT_TELEMETRY_ENABLED` | `0` | Active la réception MQTT (`1`) |
| `MQTT_BROKER_HOST` | `localhost` | Host du broker |
| `MQTT_BROKER_PORT` | `1883` | Port du broker |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Topic des frames protobuf |
| `MQTT_TELEMETRY_QOS` | `1` | QoS MQTT |
| `MQTT_BRIDGE_LOG_TOPIC` | `icarus2/bridge/log` | Topic des lignes erreur/warning du pont Pi |
| `MQTT_BRIDGE_LOG_MAXLEN` | `500` | Max de lignes de log du pont dans le ring buffer backend |
| `MQTT_TELEMETRY_STORE_MAXLEN` | `5000` | Frames gardées en mémoire (deque) |
| `MQTT_FRAME_TIMEOUT_SEC` | `3` | Watchdog : `[RPI_DISCONNECTED]` après N s sans frame |
| `TELEMETRY_CSV_LOG_ENABLED` | `1` | Écrire le CSV local par jour (`0` pour désactiver) |
| `TELEMETRY_CSV_DIR` | `~/Desktop/telemetry` | Dossier des CSV `<date>.csv` |
| `SHEETS_SYNC_ENABLED` | `0` | Pousser vers Google Sheet (`1` + URL) |
| `SHEETS_WEBAPP_URL` | (vide) | URL `/exec` du Web App Apps Script |
| `SHEETS_SYNC_INTERVAL_SEC` | `5` | Intervalle des lots vers le Sheet |
| `GS_LOG_DIR` | `~/Desktop/ground-station-logs` | Dossier des logs `.txt` |

### Frontend

| Variable | Rôle |
|---|---|
| `VITE_CESIUM_ION_TOKEN` | Token Cesium Ion (carte de base) — dans `frontend/.env.local` |
| `GS_BACKEND_HOST` / `GS_BACKEND_PORT` | Cible du proxy Vite |

---

## 10. Docker

Build multi-étapes (Node → Python 3.12) qui embarque le frontend compilé + le
backend :
```bash
docker build -t ground-station .
# avec le token Cesium au build :
docker build --build-arg VITE_CESIUM_ION_TOKEN="votre_token" -t ground-station .
```
L'image expose le port **7000**.

---

## 11. Dépannage rapide

- **Aucune télémétrie / « CSV fallback »** : le broker n'est pas joignable.
  Vérifier l'IP du Raspberry Pi (DHCP → elle change) avec `gss debug`, et que
  `mosquitto` écoute (`listener 1883`, `allow_anonymous true`).
- **Carte Cesium noire** : vérifier `VITE_CESIUM_ION_TOKEN`
  (`frontend/.env.local`).
- **Arrêter la station** : après `gss start` / `startoffline` / `simulation`, le
  terminal est attaché au log → **`Ctrl+C` arrête tout**. Sinon (autre terminal,
  ou `GS_FOLLOW=0`), utiliser `gss kill`.
- **Le Google Sheet ne se remplit pas** : avoir bien **redéployé** le Web App
  Apps Script après modification du script, et `SHEETS_WEBAPP_URL` à jour.
- **`gss simulation` refuse de partir** : `mosquitto` manquant
  (`sudo apt install -y mosquitto`) ou CSV introuvable au chemin par défaut.

---

## 12. Stack technique

| Catégorie | Techno |
|---|---|
| Backend | FastAPI + Uvicorn + paho-mqtt |
| Sérialisation | Protocol Buffers (encodés à la main, pas de `.proto`) |
| Frontend | React 19 + Vite + React Router v7 |
| État | Redux Toolkit |
| UI | Material-UI v7 |
| Globe 3D | Cesium |
| 3D (attitude CubeSat) | three.js |
| Graphes | Recharts |
| Conteneurisation | Docker |
