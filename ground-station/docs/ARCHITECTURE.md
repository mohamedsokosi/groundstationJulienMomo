# Architecture

## Vue d'ensemble technique

Ground Station est construit autour de deux couches principales:

- une SPA React cote navigateur;
- un backend Python qui expose FastAPI pour le HTTP et Socket.IO pour la quasi-totalite des
  echanges temps reel.

Le backend orchestre ensuite plusieurs sous-systemes specialises:

- un processus de tracking satellite;
- des workers pour les SDR, la demodulation, le decodage, la transcription et l'enregistrement;
- un ordonnanceur d'observations;
- un registre de taches longues executees de facon controlee;
- des emissions periodiques de metriques systeme et d'etat runtime.

Le stockage est hybride:

- SQLite pour les donnees metier;
- le systeme de fichiers pour les enregistrements, snapshots, sorties decodees, transcriptions et
  images;
- un CSV a la racine du depot pour le dashboard telemetry.

## Responsabilites par dossier

### Racine

- `README.md`: entree principale pour les nouveaux arrivants.
- `Dockerfile`: image de production et packaging des assets frontend/backend.
- `telemetry.csv`: source de donnees pour les vues `customize` et `CubeSat`.
- `docs/`: documentation technique et de contribution.

### `backend/`

- `backend/app.py`: point d entree principal du serveur.
- `backend/common/`: arguments CLI, configuration, logger, constantes et aides transverses.
- `backend/server/startup.py`: creation de l application FastAPI, montage des fichiers statiques,
  routes HTTP et initialisation runtime.
- `backend/server/version.py`: versioning, check de release et collecte d informations systeme.
- `backend/handlers/`: couche Socket.IO et routage des commandes metier.
- `backend/handlers/entities/`: commandes par domaine fonctionnel.
- `backend/db/`: modele SQLAlchemy, session async et migrations Alembic.
- `backend/session/`: gestion des sessions navigateur / SDR.
- `backend/pipeline/`: orchestration des processus de signal.
- `backend/tracker/`: calculs et processus de suivi satellite.
- `backend/observations/`: generation et execution des observations automatisees.
- `backend/tasks/`: registre des taches longues autorisees.
- `backend/audio/`, `backend/demodulators/`, `backend/workers/`, `backend/fft/`: acquisition et
  traitement du signal.
- `backend/video/`: route WebRTC et aide au streaming camera.
- `backend/telemetry/`: manipulation de certaines donnees telemetry.
- `backend/tests/`: tests backend.

### `frontend/`

- `frontend/src/main.jsx`: declaration des routes React.
- `frontend/src/App.jsx`: layout global, theme, i18n et hooks Socket.
- `frontend/src/components/common/socket.jsx`: connexion Socket.IO et statistiques de trafic.
- `frontend/src/components/common/store.jsx`: store Redux et persistence locale.
- `frontend/src/components/customize/`: vues telemetry et CubeSat, helpers et slices associes.
- `frontend/src/services/data-sync.js`: chargement initial des donnees au demarrage.
- `frontend/src/hooks/`: handlers realtime et effets periodiques.
- `frontend/src/config/navigation.jsx`: navigation de l interface.
- `frontend/src/i18n/`: traductions JSON par langue.
- `frontend/public/`: assets statiques servis par Vite.

### Pages `customize` et `CubeSat`

- `/customize` correspond au tableau de bord telemetry. Il est declare dans
  `frontend/src/main.jsx`, visible dans `frontend/src/config/navigation.jsx` et rendu par
  `frontend/src/components/customize/telemetry-dashboard.jsx`.
- `/cubesat` correspond a la vue CubeSat. Elle est declaree dans `frontend/src/main.jsx`, visible
  dans `frontend/src/config/navigation.jsx` et rendue par
  `frontend/src/components/customize/cubesat-dashboard.jsx`.
- Les deux pages partagent le sous-arbre `frontend/src/components/customize/`, qui contient les
  config, slices, helpers, widgets et guides de feature associes.
- Le flux de donnees principal de ces vues provient de `telemetry.csv`, expose par
  `GET /api/telemetry.csv` et recopie dans `frontend/public/telemetry.csv` pour certains usages
  frontend.

## Flux de donnees

1. Le navigateur charge la SPA et ouvre une connexion Socket.IO.
2. Au `connect`, le frontend lance `initializeAppData()` pour charger preferences, version,
   localisation, materiel, TLE, tracking, observations et autres donnees runtime.
3. Les commandes UI passent majoritairement par `data_request`, `data_submission`, `sdr_data`,
   `file_browser`, `service_control`, `database_backup`, `transmitter_import` et
   `background_task:*`.
4. Les handlers backend appellent les modules CRUD, mettent a jour SQLite puis emettent des
   evenements temps reel.
5. `ProcessManager` cree et supervise les workers de SDR, demodulation, enregistrement et
   transcription.
6. `SessionService` et `SessionTracker` conservent la relation session -> SDR -> VFO.
7. `ObservationExecutor` et APScheduler declenchent les sessions internes pour les observations
   planifiees.
8. Les sorties generees sont ecrites dans `backend/data/*` et servent a alimenter le file browser
   et les vues frontend.
9. Le dashboard `customize` lit `telemetry.csv` via HTTP plutot que depuis la base de donnees.

### Donnees et sorties

- `backend/data/recordings/`: fichiers SigMF.
- `backend/data/snapshots/`: images waterfall.
- `backend/data/decoded/`: produits de decodage.
- `backend/data/audio/`: enregistrements audio et metadonnees associees.
- `backend/data/transcriptions/`: transcriptions texte.
- `backend/data/configs/`: configuration applicative et configurations decodeurs.
- `backend/data/uhd_images/` et `backend/data/uhd_config/`: support UHD.

## Dependances importantes

### Backend

- `FastAPI` pour le serveur HTTP et les docs OpenAPI.
- `python-socketio` pour le temps reel et la plupart des commandes metier.
- `SQLAlchemy` + `aiosqlite` pour la base SQLite.
- `Alembic` pour les migrations au demarrage.
- `APScheduler` pour la planification.
- `Skyfield` et `sgp4` pour les calculs orbitaux.
- `psutil` pour les metriques systeme.
- `Pillow` pour lire certaines images et snapshots.
- `requests` pour les appels HTTP externes.
- `multiprocessing` pour isoler les taches longues et les workers de signal.

### Frontend

- `React 19` pour l interface.
- `Redux Toolkit` et `redux-persist` pour l etat et certaines preferences UI.
- `MUI` pour le design system.
- `React Router` pour la navigation.
- `socket.io-client` pour le temps reel.
- `Leaflet` pour la cartographie.
- `Recharts` pour le dashboard telemetry.
- `i18next` pour les traductions.

## Choix techniques visibles dans le code

- Les commandes de domaine passent principalement par Socket.IO plutot que par une grosse API REST.
- Le backend utilise SQLite locale avec migrations automatiques au demarrage.
- Les workers lourds sont executes dans des processus separes plutot que dans un seul event loop.
- Le backend expose des repertoires de fichiers statiques pour les enregistrements et sorties
  decodees.
- Le frontend persiste seulement une partie de l interface dans le navigateur.
- La recherche de version et de mise a jour est integree au runtime via GitHub Releases.
- Il n y a pas d authentification utilisateur active dans le code visible.
- Le dashboard `customize` lit un CSV HTTP (`/api/telemetry.csv`) au lieu d une table de base de
  donnees.

## Deploiement

Le build Docker assemble le frontend puis copie le backend et `telemetry.csv` dans l image finale.
Le script `backend/startup.sh` demarre aussi plusieurs services systeme utiles au materiel radio:

- `dbus-daemon`
- `avahi-daemon`
- `sdrplay_apiService`

Il configure egalement:

- `STATIC_FILES_DIR=/app/frontend/dist`
- `UHD_IMAGES_DIR=/app/backend/data/uhd_images`
- `UHD_CONFIG_DIR=/app/backend/data/uhd_config`
- `GR_BUFFER_TYPE=vmcirc_mmap_tmpfile`

Le conteneur lance ensuite le backend sur le port `7000`.

## Points d attention

- `frontend/vite.config.js` et les fichiers `.env.*` visibles dans le depot n utilisent pas les
  memes noms de variables. `A confirmer`.
- Le dossier `backend/data/` est central; sa suppression remet l application dans un etat proche
  d une premiere installation.
- Plusieurs fonctions radio/SDR dependent de bibliotheques systeme non presentes par defaut sur
  un OS nu.
