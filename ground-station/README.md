# Ground Station

Ground Station est une application web full-stack pour le suivi de satellites, le controle
d'equipements radio et SDR, l'enregistrement IQ/audio, la transcription en temps reel et la
planification d'observations automatisees.

Le depot est organise autour de trois blocs principaux:
- `backend/` pour FastAPI, Socket.IO, la base SQLite, les workers et les migrations.
- `frontend/` pour l'interface React, Redux Toolkit, MUI et Vite.
- `docs/` pour l'architecture, l'API, la contribution et le journal des modifications.

Le projet expose aussi deux vues de telemetrie:
- `customize`, qui lit `telemetry.csv` via `GET /api/telemetry.csv`
- `CubeSat`, basee sur le meme flux de telemetrie

## Pages `customize` et `CubeSat`

Ces deux pages sont des vues frontend visibles dans l application:

- `/customize` affiche un tableau de bord de telemetrie base sur le CSV expose par le backend.
  La page est rendue par `frontend/src/components/customize/telemetry-dashboard.jsx` et s appuie
  sur `telemetry-data-source.js`, `telemetry-slice.jsx`, `telemetry-components.jsx` et
  `use-telemetry-stream.jsx`.
- `/cubesat` affiche une vue CubeSat avec visualisation annotee et panneaux de sous-systemes.
  La page est rendue par `frontend/src/components/customize/cubesat-dashboard.jsx` et s appuie sur
  `cubesat-config.js`, `cubesat-annotated-visual.jsx`, `cubesat-subsystem-panel.jsx` et
  `cubesat-utils.js`.

Elles sont presentes:

- dans les routes React de `frontend/src/main.jsx`;
- dans la navigation de `frontend/src/config/navigation.jsx`;
- dans le sous-arbre `frontend/src/components/customize/`;
- pour les donnees, via `telemetry.csv` a la racine, `frontend/public/telemetry.csv` et
  `GET /api/telemetry.csv`.

## Documentation associee

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Contribution](docs/CONTRIBUTING.md)
- [Modifications](docs/MODIFICATIONS.md)

## Prerequis

- Python 3.12.x
- Node.js 20+ et `npm`
- Git
- SQLite, utilise localement via `aiosqlite`, sans serveur externe

Fonctionnalites optionnelles selon le materiel disponible:
- RTL-SDR / `rtl_tcp`
- SoapySDR / SoapyRemote
- UHD / USRP
- Hamlib pour rotateurs et stations radio compatibles
- SatDump pour certains traitements satellite
- GNU Radio et `gr-lora_sdr` pour le support LoRa en developpement local

## Installation

### 1. Cloner le depot

```bash
git clone https://github.com/sgoudelis/ground-station.git
cd ground-station
```

### 2. Installer le backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

Sur macOS ou Linux:

```bash
source .venv/bin/activate
pip install -e ".[dev]"
```

### 3. Installer le frontend

```bash
cd ../frontend
npm install
```

### 4. Demarrer en developpement

Terminal 1:

```bash
cd backend
.venv\Scripts\Activate.ps1
python app.py --host 0.0.0.0 --port 5000
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Le frontend de developpement tourne sur `http://localhost:5173` et proxifie les requetes vers
le backend.

## Configuration

### Variables cote backend

| Variable | Role | Valeur visible dans le code |
| --- | --- | --- |
| `GS_DB` | Chemin de la base SQLite | `data/db/gs.db` |
| `STATIC_FILES_DIR` | Dossier du frontend compile servi par FastAPI | `../../frontend/dist` hors Docker |
| `GS_ENVIRONMENT` | Metadonnees de version | `development` |
| `BUILD_VERSION` | Version fournie au build | calculee au runtime si absente |
| `BUILD_DATE` | Date du build | date UTC courante si absente |
| `GIT_COMMIT` | Hash Git du build | `unknown` si absent |
| `GITHUB_TOKEN` | Token optionnel pour l endpoint de verification de release | non defini |
| `SYSTEM_INFO_POLL_INTERVAL_SECONDS` | Frequence du flux `system-info` | `2` |
| `GS_DECODER_TRACE` | Traceur de debug pour certains decodeurs | non defini |
| `ALEMBIC_CONTEXT` | Variable interne pour eviter les conflits de parsing CLI pendant les migrations | non defini |

### Configuration applicative

Le backend lit aussi `backend/data/configs/app_config.json` si le fichier existe. Les cles
visibles dans le code sont:

- `host`
- `port`
- `db`
- `temp_db`
- `log_level`
- `log_config`
- `secret_key`
- `track_interval_ms`
- `enable_soapy_discovery`
- `runonce_soapy_discovery`

Le fichier est cree automatiquement s'il manque.

### Variables cote frontend

| Variable | Role | Remarque |
| --- | --- | --- |
| `GS_BACKEND_HOST` | Host utilise par `frontend/vite.config.js` | valeur par defaut `localhost` |
| `GS_BACKEND_PORT` | Port utilise par `frontend/vite.config.js` | valeur par defaut `5000` |
| `VITE_GS_BACKEND_HOST` | Variable presente dans les fichiers `.env.*` visibles | `A confirmer` |
| `VITE_GS_BACKEND_PORT` | Variable presente dans les fichiers `.env.*` visibles | `A confirmer` |

`A confirmer`: le code Vite lit `GS_BACKEND_HOST` et `GS_BACKEND_PORT`, alors que les fichiers
`.env.development` et `.env.production` visibles dans le depot utilisent le prefixe `VITE_`. Si
la configuration locale ne se charge pas comme attendu, verifiez les deux conventions.

## Commandes utiles

Sauf mention contraire, lancez les commandes backend depuis `backend/` et les commandes frontend
depuis `frontend/`.

### Developpement et demarrage

| Commande | But |
| --- | --- |
| `python app.py --host 0.0.0.0 --port 5000` | Demarre le backend depuis `backend/` |
| `ground-station` | Demarre le backend apres installation editable |
| `python run_alembic.py upgrade head` | Applique les migrations Alembic |
| `npm run dev` | Demarre le frontend en mode developpement |
| `npm run build` | Compile le frontend pour la production |
| `npm run preview` | Sert le build frontend localement |

### Tests et qualite

| Commande | But |
| --- | --- |
| `pytest` | Lance les tests backend |
| `pytest -m unit` | Lance uniquement les tests unitaires backend |
| `pytest -m integration` | Lance uniquement les tests d integration backend |
| `pytest -m slow` | Lance uniquement les tests lents backend |
| `npm test` | Lance les tests Vitest |
| `npm run test:coverage` | Lance les tests frontend avec couverture |
| `npm run test:e2e` | Lance les tests Playwright |
| `npm run test:e2e:ui` | Lance Playwright avec interface interactive |
| `npm run test:e2e:debug` | Lance Playwright en mode debug |
| `npm run lint` | Verifie le code frontend avec ESLint |
| `pre-commit run --all-files` | Verifie les hooks de qualite du depot |

### Deploiement Docker

```bash
docker build -t ground-station .
```

Le conteneur expose le port `7000` et lance `backend/startup.sh`.

Exemple de demarrage minimal:

```bash
docker run -d --name ground-station \
  -p 7000:7000 \
  -v "${PWD}/backend/data:/app/backend/data" \
  -e GS_ENVIRONMENT=production \
  ground-station
```

Pour la decouverte mDNS ou l acces materiel SDR, le conteneur peut aussi avoir besoin de
`--network host`, `--device /dev/bus/usb` et de privileges supplementaires selon la plateforme.

## Structure du projet

```text
.
|-- backend/            # API, workers, base de donnees, migrations, tasks
|-- frontend/           # SPA React, state management, pages et tests
|-- docs/               # Documentation maintenue
|-- Dockerfile          # Image de production
|-- telemetry.csv       # Source CSV pour le tableau de bord telemetry
`-- README.md
```

Repere rapide cote backend:
- `backend/app.py` est le point d entree principal.
- `backend/server/startup.py` cree l application FastAPI et enregistre les routes.
- `backend/handlers/` contient la majorite des commandes Socket.IO.
- `backend/pipeline/` orchestre les processus SDR, decodeurs et enregistreurs.
- `backend/observations/` gere la planification et l execution automatisees.

Repere rapide cote frontend:
- `frontend/src/main.jsx` declare les routes de l application.
- `frontend/src/components/common/socket.jsx` ouvre la connexion Socket.IO.
- `frontend/src/components/common/store.jsx` configure Redux et la persistence.
- `frontend/src/config/navigation.jsx` alimente la navigation de l interface.
- `frontend/src/components/customize/` contient les vues telemetry et CubeSat.

## Architecture generale

L application suit un modele event-driven:
- le navigateur charge une SPA React;
- le frontend ouvre une connexion Socket.IO vers le backend;
- le backend route les commandes vers des handlers metier;
- les donnees sont stockees dans SQLite et sur le systeme de fichiers;
- des processus separes traitent le tracking, les SDR, les decodeurs, les enregistrements et les
  taches longues.

Les flux principaux visibles dans le code sont:
- suivi satellite et calcul des passages;
- controle du materiel radio;
- capture et lecture IQ;
- demodulation et decodage;
- transcription audio;
- observations planifiees;
- visualisation de telemetrie CSV pour les dashboards `customize` et `CubeSat`.

## Exemples d utilisation

### Ouvrir les pages principales

- `http://localhost:5173/` pour la vue d ensemble
- `http://localhost:5173/track` pour la console de suivi
- `http://localhost:5173/waterfall` pour le waterfall SDR
- `http://localhost:5173/filebrowser` pour les enregistrements et sorties decodees
- `http://localhost:5173/scheduler` pour les observations planifiees
- `http://localhost:5173/customize` pour le dashboard telemetry
- `http://localhost:5173/cubesat` pour la vue CubeSat

### Appels rapides

```bash
curl http://localhost:5000/api/version
curl http://localhost:5000/api/update-check
curl http://localhost:5000/api/telemetry.csv
```

### Premiere mise en route

1. Configurez au moins une `location` si l assistant de premiere ouverture le demande.
2. Ajoutez vos rigs, SDR, rotateurs et cameras dans la section hardware.
3. Synchronisez les TLE dans la section satellites.
4. Ouvrez `track` ou `waterfall` pour commencer le travail en temps reel.

## Problemes frequents

- Si le backend ne trouve pas la base, verifiez `GS_DB` et le repertoire `backend/data/db/`.
- Si le frontend affiche une page vide en production, verifiez que `STATIC_FILES_DIR` pointe
  vers `frontend/dist`.
- Si les donnees temps reel ne passent pas, controlez la connexion Socket.IO, le port du backend
  et le proxy du frontend.
- Si les appareils SDR ne sont pas detectes, verifiez les drivers systeme et les permissions USB.
- Si la decouverte mDNS / SoapyRemote ne remonte rien, verifiez `avahi-daemon`, `dbus` et le mode
  reseau du conteneur.
- Si les dashboards `customize` ou `CubeSat` restent vides, verifiez que `telemetry.csv` est
  present a la racine du projet ou dans l image Docker.

## Notes

- L authentification utilisateur n est pas active dans le code visible; `backend/common/auth.py`
  indique que cette fonctionnalite a ete retiree.
- Le depot contient aussi des guides plus avances dans `DEVELOPMENT.md` et `frontend/TESTING.md`.
