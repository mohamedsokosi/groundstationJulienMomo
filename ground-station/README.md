# Ground Station

Ground Station est une application web full-stack de station sol pour le suivi CubeSat /
satellite, la visualisation de telemetrie, la supervision radio/SDR et la preparation de
rapports. Le projet combine un backend Python FastAPI + Socket.IO et une interface React
compilee avec Vite.

L'interface actuelle met l'accent sur quatre vues:

- `/vueGlobe3d`: globe 3D Cesium avec trajectoire, altitude et liaison sol.
- `/cubesat`: vue annotee du CubeSat et de ses sous-systemes.
- `/analyse`: graphes et tendances issues des donnees de telemetrie.
- `/rapport`: generation et consultation d'un rapport de mission.

La telemetrie part encore du fichier `telemetry.csv`, mais le backend expose maintenant aussi
un flux Protocol Buffers via `/api/telemetry.pb`. Le frontend essaie Protobuf en priorite et
retombe sur le CSV si besoin.

## Architecture Rapide

```text
.
|-- backend/                  # API FastAPI, Socket.IO, DB, workers, SDR, observations
|-- frontend/                 # SPA React, Vite, Redux, Cesium, pages applicatives
|-- shared/proto/             # Schemas partages Protocol Buffers
|-- docs/                     # Documentation complementaire
|-- telemetry.csv             # Source locale de telemetrie
|-- Dockerfile                # Image de production full-stack
`-- README.md
```

Vue de haut niveau:

```text
telemetry.csv
   |
   | lu par le backend
   v
backend/server/startup.py
   |
   | expose /api/telemetry.pb et /api/telemetry.csv
   v
frontend/src/pages/telemetry-data-source.js
   |
   | decode Protobuf ou parse CSV
   v
frontend/src/pages/use-telemetry-stream.jsx
   |
   | alimente Redux et les composants
   v
/vueGlobe3d, /cubesat, /analyse, /rapport
```

## Fonctionnalites Principales

- Visualisation 3D de trajectoire satellite avec Cesium.
- Suivi temporel de la telemetrie CubeSat.
- Graphes d'analyse: altitude, vitesse, pression, satellites visibles.
- Vue CubeSat annotee avec sous-systemes.
- Chargement de fichiers CSV depuis le frontend.
- Transport Protobuf backend -> frontend pour la telemetrie serveur.
- Simulation MQTT CubeSat optionnelle avec payloads `TelemetryFrame` Protobuf binaires.
- Backend FastAPI avec endpoints HTTP et serveur Socket.IO.
- Modules backend pour tracking, observations, SDR, audio, fichiers et taches longues.
- Build Docker incluant le frontend compile et le backend Python.

## Backend

Le backend se trouve dans `backend/`.

Fichiers importants:

- `backend/app.py`: point d'entree Python. Il initialise la base, enregistre les handlers
  Socket.IO et lance Uvicorn.
- `backend/server/startup.py`: cree l'application FastAPI, monte les fichiers statiques,
  initialise Socket.IO et declare les endpoints HTTP.
- `backend/handlers/`: handlers Socket.IO pour les commandes et evenements applicatifs.
- `backend/db/`: SQLAlchemy, migrations et acces SQLite.
- `backend/observations/`: planification et execution d'observations.
- `backend/pipeline/`: orchestration des processus radio, SDR, decodeurs et enregistrements.
- `backend/tracker/`: suivi satellite et messages de tracking.
- `backend/tasks/`: gestion des taches longues et decouverte materielle.
- `backend/startup.sh`: script de demarrage utilise dans le conteneur Docker.

Endpoints HTTP utiles:

| Endpoint | Role |
| --- | --- |
| `GET /api/version` | Retourne les informations de version/build. |
| `GET /api/update-check` | Verifie si une mise a jour est disponible. |
| `GET /api/telemetry.csv` | Sert le fichier `telemetry.csv` en texte CSV. |
| `GET /api/telemetry.pb` | Sert la meme telemetrie encodee en Protocol Buffers. |
| `GET /api/telemetry/mqtt/status` | Retourne l'etat du receiver MQTT et du store memoire. |
| `POST /api/telemetry/mqtt/clear` | Vide le store memoire des frames MQTT. |

Fichiers statiques montes par le backend:

- `/satimages`
- `/recordings`
- `/snapshots`
- `/decoded`
- `/audio`
- `/transcriptions`

En production, FastAPI sert aussi le frontend compile depuis `frontend/dist`.

## Frontend

Le frontend se trouve dans `frontend/`.

Stack principale:

- React 19
- Vite
- Redux Toolkit + redux-persist
- Material UI / Toolpad
- Recharts
- Cesium
- Socket.IO client

Fichiers importants:

- `frontend/src/main.jsx`: declare les routes React.
- `frontend/src/App.jsx`: fournit le provider applicatif Toolpad.
- `frontend/src/layout/dashboard-layout.jsx`: layout principal avec topbar/sidebar.
- `frontend/src/config/navigation.jsx`: configuration de la navigation.
- `frontend/src/shared/socket.jsx`: connexion Socket.IO.
- `frontend/src/shared/store.jsx`: store Redux.
- `frontend/src/pages/telemetry-dashboard.jsx`: page `/vueGlobe3d`.
- `frontend/src/pages/cubesat-dashboard.jsx`: page `/cubesat`.
- `frontend/src/pages/analyse-dashboard.jsx`: page `/analyse`.
- `frontend/src/pages/rapport-dashboard.jsx`: page `/rapport`.
- `frontend/src/pages/ground-station-view.css`: styles de la vue station sol.

Routes actuelles:

| Route | Composant |
| --- | --- |
| `/` | redirige vers `/vueGlobe3d` |
| `/vueGlobe3d` | `TelemetryDashboard` |
| `/cubesat` | `CubeSatDashboard` |
| `/analyse` | `AnalyseDashboard` |
| `/rapport` | `RapportDashboard` |

## Telemetrie et Protocol Buffers

La source de donnees actuelle reste `telemetry.csv` a la racine du depot. Ce fichier contient
les colonnes suivantes:

```text
m-time, Flight ID, Ublox UTC, U Lat, U Long, U Alt, Speed, Vert speed, #Sat, Pressure
```

### Schema partage

Le schema est defini dans:

```text
shared/proto/telemetry.proto
```

Il contient deux messages:

- `TelemetryFrame`: une ligne de telemetrie.
- `TelemetryBatch`: un lot de plusieurs `TelemetryFrame`.

Mapping principal:

| CSV | Protobuf | Frontend |
| --- | --- | --- |
| `m-time` | `mission_time` | `m-time`, `m_time` |
| `Flight ID` | `flight_id` | `Flight ID`, `Flight_ID` |
| `Ublox UTC` | `gnss_time_utc` | `Ublox UTC`, `Ublox_UTC` |
| `U Lat` | `latitude_deg` | `U Lat`, `U_Lat` |
| `U Long` | `longitude_deg` | `U Long`, `U_Long` |
| `U Alt` | `altitude_m` | `U Alt`, `U_Alt` |
| `Speed` | `speed_mps` | `Speed` |
| `Vert speed` | `vertical_speed_mps` | `Vert speed`, `Vert_speed` |
| `#Sat` | `satellite_count` | `#Sat`, `#_Sat` |
| `Pressure` | `pressure_hpa` | `Pressure` |

### Encodage backend

Dans `backend/server/startup.py`, l'endpoint `/api/telemetry.pb`:

1. lit `telemetry.csv`;
2. nettoie les noms de colonnes;
3. transforme chaque ligne en `TelemetryFrame`;
4. regroupe les frames dans `TelemetryBatch`;
5. renvoie une reponse `application/x-protobuf`.

L'encodage Protobuf est manuel pour cette premiere version. Aucune dependance Python `protobuf`
n'est necessaire. Le code encode seulement les types utilises par le schema:

- `uint32` en varint;
- `double` en 64 bits little-endian;
- `string` en champ length-delimited.

### Decodage frontend

Dans `frontend/src/pages/telemetry-protobuf.js`, le frontend decode le binaire Protobuf:

1. lit les tags Protobuf;
2. identifie le numero de champ et le wire type;
3. decode les `TelemetryFrame`;
4. reconstruit des objets JavaScript compatibles avec l'ancien parseur CSV.

Le fichier `frontend/src/pages/telemetry-data-source.js` expose:

- `TELEMETRY_SOURCE_URL = '/api/telemetry.csv'`;
- `TELEMETRY_PROTOBUF_SOURCE_URL = '/api/telemetry.pb'`;
- `parseTelemetryCsv(text)`;
- `parseTelemetryProtobuf(buffer)`.

Le hook `frontend/src/pages/use-telemetry-stream.jsx` charge les donnees serveur ainsi:

```text
1. essayer /api/telemetry.pb
2. si echec, essayer /api/telemetry.csv
```

Les fichiers CSV charges manuellement depuis l'interface restent parses cote frontend en CSV.

## Simulation MQTT CubeSat

MQTT est optionnel. Si le receiver MQTT n'est pas active ou si aucune frame MQTT n'a encore ete
recue, `/api/telemetry.pb` continue a utiliser `telemetry.csv` comme avant.

Flux MQTT:

```text
telemetry.csv
   |
   v
tools/simulators/mqtt_cubesat_simulator.py
   |
   | MQTT payload = 1 TelemetryFrame protobuf binaire
   v
MQTT broker
   |
   | topic: icarus2/telemetry/frame.pb
   v
backend/pipeline/mqtt_telemetry_receiver.py
   |
   v
backend/pipeline/telemetry_store.py
   |
   v
/api/telemetry.pb
   |
   v
frontend React
```

Principe:

- le frontend ne parle jamais directement a MQTT;
- le simulateur publie une ligne CSV a la fois;
- un message MQTT correspond a un `TelemetryFrame`;
- le backend stocke les frames recues en memoire;
- `/api/telemetry.pb` renvoie un `TelemetryBatch` au frontend;
- si le store MQTT est vide, l'endpoint retombe automatiquement sur le CSV.

Variables d'environnement MQTT:

| Variable | Defaut | Role |
| --- | --- | --- |
| `MQTT_TELEMETRY_ENABLED` | `0` | Active le receiver si la valeur est `1`. |
| `MQTT_BROKER_HOST` | `localhost` | Host du broker MQTT. |
| `MQTT_BROKER_PORT` | `1883` | Port du broker MQTT. |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Topic des frames Protobuf. |
| `MQTT_TELEMETRY_QOS` | `1` | QoS MQTT utilise par le receiver. |
| `MQTT_TELEMETRY_STORE_MAXLEN` | `5000` | Nombre maximum de frames gardees en memoire. |

Installer la dependance MQTT si l'environnement Python local n'est pas encore a jour:

```bash
pip install paho-mqtt
```

Lancer un broker Mosquitto local:

```bash
docker compose -f docker-compose.mqtt.yml up -d
```

Activer MQTT cote backend sur Linux/macOS:

```bash
cd backend
MQTT_TELEMETRY_ENABLED=1 python app.py --host 0.0.0.0 --port 5000
```

Activer MQTT cote backend sur PowerShell:

```powershell
cd backend
$env:MQTT_TELEMETRY_ENABLED="1"
python app.py --host 0.0.0.0 --port 5000
```

Lancer le simulateur:

```bash
python tools/simulators/mqtt_cubesat_simulator.py --csv telemetry.csv --delay 0.2 --loop
```

Verifier le statut:

```bash
curl http://localhost:5000/api/telemetry/mqtt/status
```

Vider le store MQTT:

```bash
curl -X POST http://localhost:5000/api/telemetry/mqtt/clear
```

## Flux Temps Reel

Il y a deux mecanismes a distinguer:

- Socket.IO: utilise pour les evenements applicatifs, le status, les commandes, le tracking et
  les interactions backend temps reel.
- Telemetrie fichier: les pages de telemetrie lisent le flux serveur Protobuf/CSV et peuvent
  rejouer les points sous forme de stream dans l'interface.

Donc le Protobuf ne remplace pas Socket.IO. Il remplace surtout le transport texte CSV pour les
donnees de telemetrie exposees par le backend.

## Configuration

### Backend

Variables courantes:

| Variable | Role | Defaut / remarque |
| --- | --- | --- |
| `GS_DB` | Chemin de la base SQLite | `backend/data/db/gs.db` |
| `STATIC_FILES_DIR` | Dossier du frontend compile | `frontend/dist` hors Docker |
| `GS_ENVIRONMENT` | Environnement affiche dans les metadonnees | `development` |
| `BUILD_VERSION` | Version du build | calculee si absente |
| `BUILD_DATE` | Date du build | UTC si absente |
| `GIT_COMMIT` | Commit du build | `unknown` si absent |
| `GITHUB_TOKEN` | Token optionnel pour la verification de releases | non requis |
| `SYSTEM_INFO_POLL_INTERVAL_SECONDS` | Frequence du status systeme | `2` |
| `MQTT_TELEMETRY_ENABLED` | Active le receiver MQTT de telemetrie | `0` |
| `MQTT_BROKER_HOST` | Host du broker MQTT | `localhost` |
| `MQTT_BROKER_PORT` | Port du broker MQTT | `1883` |
| `MQTT_TELEMETRY_TOPIC` | Topic des frames Protobuf | `icarus2/telemetry/frame.pb` |
| `MQTT_TELEMETRY_QOS` | QoS du receiver MQTT | `1` |
| `MQTT_TELEMETRY_STORE_MAXLEN` | Taille max du store memoire MQTT | `5000` |

Le backend peut aussi lire:

```text
backend/data/configs/app_config.json
```

Ce fichier contient notamment host, port, base de donnees, logs et options de decouverte SoapySDR.

### Frontend

Variables utiles:

| Variable | Role |
| --- | --- |
| `GS_BACKEND_HOST` | Host cible du proxy Vite. |
| `GS_BACKEND_PORT` | Port cible du proxy Vite. |
| `VITE_CESIUM_ION_TOKEN` | Token Cesium ion injecte dans le build frontend. |

Pour le developpement local Cesium, utilisez:

```text
frontend/.env.local
```

Exemple:

```env
VITE_CESIUM_ION_TOKEN=votre_token_cesium
```

Ne commitez pas de vrai token.

## Installation Locale

### 1. Cloner

```bash
git clone https://github.com/sgoudelis/ground-station.git
cd ground-station
```

### 2. Backend

Depuis `backend/`:

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

Sur macOS / Linux:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Demarrage:

```bash
python app.py --host 0.0.0.0 --port 5000
```

### 3. Frontend

Depuis `frontend/`:

```bash
npm install
npm run dev
```

Le frontend Vite ecoute sur:

```text
http://localhost:5173
```

Le backend local ecoute par defaut sur:

```text
http://localhost:5000
```

## Commandes Utiles

Backend:

| Commande | Role |
| --- | --- |
| `python app.py --host 0.0.0.0 --port 5000` | Lance le backend en local. |
| `ground-station` | Lance le backend apres installation editable. |
| `python run_alembic.py upgrade head` | Applique les migrations. |
| `pytest` | Lance les tests backend. |
| `python -m py_compile server/startup.py` | Verifie rapidement la syntaxe du serveur. |

Frontend:

| Commande | Role |
| --- | --- |
| `npm run dev` | Lance Vite en developpement. |
| `npm run build` | Compile le frontend. |
| `npm run preview` | Sert le build localement. |
| `npm test` | Lance Vitest. |
| `npm run lint` | Lance ESLint. |
| `npm run test:e2e` | Lance Playwright. |

Appels rapides:

```bash
curl http://localhost:5000/api/version
curl http://localhost:5000/api/update-check
curl http://localhost:5000/api/telemetry.csv
curl http://localhost:5000/api/telemetry.pb --output telemetry.pb
```

## Docker

Build simple:

```bash
docker build -t ground-station .
```

Build avec token Cesium:

```bash
docker build --build-arg VITE_CESIUM_ION_TOKEN="votre_token_cesium" -t ground-station .
```

Demarrage minimal:

```bash
docker run -d --name ground-station \
  -p 7000:7000 \
  -v "${PWD}/backend/data:/app/backend/data" \
  -e GS_ENVIRONMENT=production \
  ground-station
```

Pour utiliser le `telemetry.csv` local sans rebuild:

```bash
docker run -d --name ground-station \
  -p 7000:7000 \
  -v "${PWD}/backend/data:/app/backend/data" \
  -v "${PWD}/telemetry.csv:/app/telemetry.csv:ro" \
  -e GS_ENVIRONMENT=production \
  ground-station
```

Selon le materiel SDR/radio, il peut etre necessaire d'ajouter des options Docker comme
`--network host`, `--device /dev/bus/usb` ou des privileges supplementaires.

## Build de Production

Le Dockerfile fait deux etapes:

1. `frontend-builder`: installe les dependances Node et compile `frontend/dist`.
2. image Ubuntu finale: installe Python, les librairies radio/SDR, copie le backend, le frontend
   compile et `telemetry.csv`, puis lance `backend/startup.sh`.

Le conteneur expose l'application sur le port `7000`.

## Problemes Frequents

- Page vide en production: verifier que `frontend/dist` a bien ete genere et que
  `STATIC_FILES_DIR` pointe vers le bon dossier.
- Cesium affiche une carte noire ou limitee: verifier `VITE_CESIUM_ION_TOKEN`.
- `/api/telemetry.pb` ne repond pas: verifier que `telemetry.csv` existe a la racine du projet
  ou dans `/app/telemetry.csv` dans le conteneur.
- Les graphes ne changent pas apres modification CSV dans Docker: monter le CSV avec
  `-v "${PWD}/telemetry.csv:/app/telemetry.csv:ro"` ou rebuild l'image.
- Le frontend ne parle pas au backend en dev: verifier `GS_BACKEND_HOST`, `GS_BACKEND_PORT` et
  le proxy dans `frontend/vite.config.js`.
- `No module named gnuradio` en local Windows: GNU Radio n'est pas installe via `pip`.
  Les decodeurs radio qui en dependent sont ignores en local; l'image Docker contient la pile
  SDR complete si vous avez besoin des decodeurs GNU Radio.
- Les SDR ne sont pas detectes: verifier drivers systeme, permissions USB, Avahi/D-Bus et le
  mode reseau du conteneur.
- Build frontend trop lourd ou erreur memoire: le Dockerfile utilise deja
  `NODE_OPTIONS="--max-old-space-size=4096"` pour compiler Cesium.

## Documentation Complementaire

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Contribution](docs/CONTRIBUTING.md)
- [Modifications](docs/MODIFICATIONS.md)
- [Guide developpement](DEVELOPMENT.md)

## Notes de Maintenance

- Garder `shared/proto/telemetry.proto` comme contrat de donnees lorsque le format telemetrie
  evolue.
- Si un champ est ajoute au CSV, ajouter un numero de champ Protobuf sans reutiliser les anciens.
- Le decodeur frontend conserve les anciens noms de colonnes pour eviter de casser les graphes.
- Les vrais secrets, comme le token Cesium, doivent rester dans `.env.local` ou dans les secrets
  de CI/CD.
