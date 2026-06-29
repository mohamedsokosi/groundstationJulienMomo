# Ground Station — SAFARI / ICARUS2

Application web **temps réel** de station sol pour le suivi d'un ballon
stratosphérique / CubeSat (projet **ICARUS2**). La télémétrie arrive en direct
par **MQTT**, s'affiche sur un globe 3D **Cesium** et des graphes, et est
archivée **localement** (CSV) et dans le **cloud** (Google Sheet).

**Stack :** FastAPI + Python (backend) · React + Redux + Cesium (frontend) ·
MQTT (télémétrie live) · Protocol Buffers (transport).

> Détails techniques approfondis : voir **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Fonctionnalités

### Visualisation temps réel
- Globe **3D Cesium** : trajectoire du CubeSat, position de la station sol (GS),
  faisceau de liaison, projection au sol — mis à jour à 1 Hz.
- Mode **« Suivre CubeSat »** : caméra verrouillée sur la position courante
  (zoom ~27 km).
- **Position GS** configurable et persistée (partagée entre les vues).
- Trajectoire **incrémentale** (perf : O(1) par rafraîchissement).

### Pages
| Route | Rôle |
|---|---|
| `/station` | Vue opérateur : carte Cesium + colonne gauche **configurable** (graphes + terminaux) + barre de stats + terminal d'erreurs |
| `/vueGlobe3d` | Globe 3D plein écran (trajectoire, stats) |
| `/analyse` | Grille de graphes Recharts entièrement configurable |
| `/cubesat` | Vue annotée du CubeSat et de ses sous-systèmes |
| `/rapport` | Export **PDF** des graphes (/station + /analyse) en un clic |

### Barre supérieure (topbar)
- **Heure** — horloge locale en direct.
- **Météo** + **Vent** — via Open-Meteo (sans clé API), basés sur la position GS.
- **Décompte T** — sélecteur date/heure de lancement → compte à rebours
  **T- / T+** en direct.

### /station configurable
- **Graphes** : n'importe quel couple de champs X/Y, glisser-déposer, favoris
  (synchronisés avec `/analyse`), bouton **All Temp** (T1–T8 d'un coup).
- **Terminaux** : `télémétrie` / `verbose` / `erreurs`.
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
- **CLI `gss`** : `start`, `startoffline`, `kill`, `verbose`, `debug`, `help`.
- **Logs `.txt`** sur le Desktop : `~/Desktop/ground-station-logs/`.

---

## Pipeline matériel

```
┌─────────────────────────┐
│   Raspberry Pi Pico     │  Rejoue la donnée de vol ICARUS2 depuis un CSV
│   (émetteur télémétrie) │  embarqué, encapsulée CFDP sur USB série
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

---

## Démarrage rapide

### Prérequis
- **Backend** : Python + [Poetry](https://python-poetry.org/).
- **Frontend** : Node.js.
- Un **broker MQTT** accessible (le Raspberry Pi du pont UART→MQTT), **ou** le
  simulateur intégré (sans matériel).

### Installation
```bash
# Backend (crée backend/.venv via Poetry)
cd backend && poetry install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### Avec la CLI `gss` (recommandé)
Installer une fois (symlink sur le PATH) :
```bash
ln -sf "$PWD/tools/dev/gss" ~/.local/bin/gss      # ~/.local/bin doit être dans le PATH
```
Puis :
```bash
gss start defaut      # démarre, broker = 10.180.97.23, sync cloud ON
gss start <ip>        # broker sur une autre IP
gss startoffline      # local seulement (pas d'upload Google Sheet)
gss kill              # tout arrêter (backend + frontend)
gss verbose           # suivre le log backend en direct
gss debug             # erreurs / warnings récents
gss help              # aide
```

| Commande | Effet |
|---|---|
| `gss start [ip]` | Lance backend + frontend, broker `<ip>` (défaut `10.180.97.23`), cloud ON |
| `gss startoffline [ip]` | Idem mais **sans** upload Google Sheet (CSV local quand même écrit) |
| `gss kill` | Arrête ce qui écoute sur les ports backend/frontend |
| `gss verbose [all\|front]` | `tail -f` du log backend (`all` = + frontend) |
| `gss debug` | Lignes d'erreur/warning récentes du backend |

### Ou directement via le script
```bash
# Matériel live (broker sur le Raspberry Pi 4B)
./tools/dev/start-local.sh -Restart -BrokerHost 10.180.97.23

# Sans matériel (simulateur)
./tools/dev/start-local.sh -Restart -Mqtt -Simulator
```

| Option | Effet |
|---|---|
| `-Restart` | Tue les process sur les ports backend/frontend avant de relancer |
| `-Offline` | Force le sync Google Sheet OFF (CSV local non affecté) |
| `-Mqtt` | Démarre un broker Mosquitto local (port 1883) |
| `-Simulator` | Lance `mqtt_cubesat_simulator.py` (publie des frames de test) |
| `-BrokerHost <ip>` | Broker MQTT externe (ex. le Raspberry Pi 4B) |
| `-BackendPort <p>` / `-FrontendPort <p>` | Surcharge les ports (défaut 5000 / 5173) |

Une fois lancé : **frontend** `http://localhost:5173` · **backend**
`http://localhost:5000`.

### Configuration locale (`local.env`)
Les secrets/réglages (ex. l'URL du Google Sheet) vont dans
`tools/dev/local.env` (git-ignoré), chargé automatiquement par `start-local.sh` :
```bash
SHEETS_SYNC_ENABLED=1
SHEETS_WEBAPP_URL="https://script.google.com/macros/s/XXXX/exec"
```

---

## Sauvegarde de la télémétrie

### CSV local (automatique)
Chaque frame reçue est ajoutée à `~/Desktop/telemetry/<date>.csv` (un fichier
par jour). Désactivable via `TELEMETRY_CSV_LOG_ENABLED=0`, emplacement via
`TELEMETRY_CSV_DIR`.

### Google Sheet en direct (optionnel)
Le backend pousse les frames par lots (toutes les ~5 s) vers un **Web App Apps
Script** lié à ta feuille, qui les ajoute dans un **onglet par jour**. Mise en
place : coller le script `doPost` (voir
[ARCHITECTURE.md → Live Google Sheet sync](ARCHITECTURE.md)), déployer en
« Application Web », et mettre l'URL `/exec` dans `SHEETS_WEBAPP_URL`.

### Logs
Backend et frontend écrivent dans `~/Desktop/ground-station-logs/*.txt`
(`gss verbose` pour les suivre). Emplacement via `GS_LOG_DIR`.

---

## Variables d'environnement

### Backend
| Variable | Défaut | Rôle |
|---|---|---|
| `MQTT_TELEMETRY_ENABLED` | `0` | Active la réception MQTT (`1`) |
| `MQTT_BROKER_HOST` | `localhost` | Host du broker |
| `MQTT_BROKER_PORT` | `1883` | Port du broker |
| `MQTT_TELEMETRY_TOPIC` | `icarus2/telemetry/frame.pb` | Topic des frames protobuf |
| `MQTT_TELEMETRY_QOS` | `1` | QoS MQTT |
| `MQTT_TELEMETRY_STORE_MAXLEN` | `5000` | Frames gardées en mémoire (deque) |
| `MQTT_FRAME_TIMEOUT_SEC` | `3` | Watchdog : `[RPI_DISCONNECTED]` après N s sans frame |
| `TELEMETRY_CSV_LOG_ENABLED` | `1` | Écrire le CSV local par jour |
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

## Stack technique
| Catégorie | Techno |
|---|---|
| Backend | FastAPI + Uvicorn + paho-mqtt |
| Sérialisation | Protocol Buffers (encodés à la main, pas de `.proto`) |
| Frontend | React 19 + Vite + React Router v7 |
| État | Redux Toolkit |
| UI | Material-UI v7 |
| Globe 3D | Cesium |
| Graphes | Recharts |
| Conteneurisation | Docker |

---

## Docker

Build multi-étapes (Node → Python 3.12) qui embarque le frontend compilé + le
backend :
```bash
docker build -t ground-station .
# avec le token Cesium au build :
docker build --build-arg VITE_CESIUM_ION_TOKEN="votre_token" -t ground-station .
```
L'image expose le port **7000**.

---

## Structure du dépôt
```
ground-station/
├── backend/          # FastAPI (app.py, server/, pipeline/, common/) — Poetry
├── frontend/         # React + Vite + Cesium
├── tools/
│   ├── dev/          # start-local.sh, gss (CLI), local.env
│   └── simulators/   # mqtt_cubesat_simulator.py
├── Dockerfile
├── ARCHITECTURE.md   # documentation technique détaillée
└── README.md
```

---

## Dépannage rapide
- **Aucune télémétrie / « CSV fallback »** : le broker n'est pas joignable.
  Vérifier l'IP du Raspberry Pi (DHCP → elle change) avec `gss debug`, et que
  `mosquitto` écoute (`listener 1883`, `allow_anonymous true`).
- **Carte Cesium noire** : vérifier `VITE_CESIUM_ION_TOKEN`
  (`frontend/.env.local`).
- **`Ctrl+C` n'arrête rien** : les process sont détachés → utiliser `gss kill`.
- **Le Google Sheet ne se remplit pas** : avoir bien **redéployé** le Web App
  Apps Script après modification du script, et `SHEETS_WEBAPP_URL` à jour.
