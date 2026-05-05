# API

## Vue d'ensemble

Le projet expose principalement:

- une API HTTP FastAPI pour quelques operations publiques et la documentation OpenAPI;
- une API Socket.IO pour le CRUD metier, le temps reel et les taches d arriere-plan;
- une route WebRTC legere pour les flux camera.

La plupart des echanges applicatifs passent par Socket.IO. Le format de reponse le plus courant
est:

```json
{ "success": true, "data": ... }
```

En cas d erreur, les handlers renvoient souvent:

```json
{ "success": false, "error": "message" }
```

Certains handlers utilisent plutot:

```json
{ "status": "success", "message": "..." }
```

## Authentification

Il n y a pas d authentification utilisateur active dans le code visible.

`backend/common/auth.py` indique que l ancienne authentification a ete retiree. Le handler
Socket.IO `connect` recoit bien un objet `auth`, mais il ne semble pas l utiliser pour autoriser
ou refuser la connexion.

## HTTP

### Documentation et assets statiques

FastAPI expose aussi:

- `GET /api/docs`
- `GET /api/redoc`
- `GET /api/openapi.json`

Le backend monte egalement des dossiers statiques accessibles via HTTP:

- `/satimages`
- `/recordings`
- `/snapshots`
- `/decoded`
- `/audio`
- `/transcriptions`

### `GET /api/version`

Retourne les informations de version statiques du build.

Reponse typique:

```json
{
  "version": "0.1.0-development-20260501-abc1234",
  "buildDate": "20260501",
  "gitCommit": "abc1234",
  "environment": "development",
  "cpuArchitecture": "x86_64"
}
```

Erreurs possibles:

- `500` si les informations de version ne peuvent pas etre lues.

### `GET /api/update-check`

Compare la version locale a la derniere release GitHub publique.

Reponse typique:

```json
{
  "currentVersion": "0.1.0",
  "latestVersion": "0.1.1",
  "latestTag": "v0.1.1",
  "latestUrl": "https://github.com/sgoudelis/ground-station/releases/tag/v0.1.1",
  "publishedAt": "2026-04-30T12:00:00Z",
  "isUpdateAvailable": true
}
```

Erreurs possibles:

- `500` si GitHub est injoignable ou si la lecture echoue.

### `GET /api/telemetry.csv`

Expose le CSV de demonstration utilise par le dashboard `customize`.

Reponse:

- `200` avec `text/csv`.

Erreurs possibles:

- `404` si le fichier `telemetry.csv` est absent;
- `500` si la lecture echoue.

### `GET /api/decoded/{foldername}/download`

Archive un dossier du repertoire `backend/data/decoded/` en zip.

Parametre:

- `foldername`: nom du dossier a zipper.

Erreurs possibles:

- `400` si le chemin est invalide ou tente une traversal;
- `404` si le dossier n existe pas;
- `500` si l archive ne peut pas etre creee.

### `POST /api/webrtc/offer`

Relaye une offre WebRTC vers `go2rtc` et renvoie une reponse SDP.

Corps de requete:

```json
{
  "source_url": "http://camera-host/stream.html?src=cam1",
  "camera_id": "cam1",
  "type": "offer",
  "sdp": "v=0..."
}
```

Reponse typique:

```json
{
  "type": "answer",
  "sdp": "v=0..."
}
```

Erreurs possibles:

- `500` si la requete vers `go2rtc` echoue;
- le code HTTP de `go2rtc` si la reponse distante est en erreur.

### `WebSocket /ws/webrtc/{client_id}`

WebSocket leger pour l echange de messages WebRTC. Le code actuel accepte les messages JSON et
renvoie un echo; la logique ICE reste un placeholder.

## Socket.IO

Le frontend construit sa connexion a partir du host et du port courants et vise le chemin `/ws`
dans `frontend/src/components/common/socket.jsx`.

### Format commun

Le backend utilise surtout trois familles d entrants:

- `data_request`
- `data_submission`
- `sdr_data`

Exemple:

```js
socket.emit('data_request', 'fetch-preferences', null, (response) => {
  console.log(response);
});
```

### `data_request` et `data_submission`

Ces deux canaux passent par le meme dispatcher. La difference est surtout semantique:

- `data_request` pour lire ou demander une action;
- `data_submission` pour creer, modifier ou supprimer des donnees.

Les commandes suivantes sont routees via `backend/handlers/entities/*`.

#### Satellites

| Commande | Type | But |
| --- | --- | --- |
| `get-satellites` | request | Liste des satellites avec filtres |
| `get-satellite` | request | Detail d un satellite |
| `get-satellites-for-group-id` | request | Satellites d un groupe |
| `get-satellite-search` | request | Recherche par mot cle |
| `submit-satellite` | submission | Creation d un satellite |
| `edit-satellite` | submission | Edition d un satellite |
| `delete-satellite` | submission | Suppression d un satellite |
| `sync-satellite-data` | request | Lance la synchro TLE en tache de fond |

#### TLE sources

| Commande | Type | But |
| --- | --- | --- |
| `get-tle-sources` | request | Liste des sources TLE |
| `submit-tle-sources` | submission | Creation d une source TLE |
| `edit-tle-source` | submission | Edition d une source TLE |
| `delete-tle-sources` | submission | Suppression de sources TLE |
| `fetch-sync-state` | request | Etat de synchro TLE |

#### Groupes de satellites

| Commande | Type | But |
| --- | --- | --- |
| `get-satellite-groups` | request | Tous les groupes |
| `get-satellite-groups-user` | request | Groupes utilisateur |
| `get-satellite-groups-system` | request | Groupes systeme |
| `submit-satellite-group` | submission | Creation d un groupe |
| `edit-satellite-group` | submission | Edition d un groupe |
| `delete-satellite-group` | submission | Suppression d un groupe |
| `fetch-next-passes-for-group` | request | Prochains passages pour un groupe |

#### Localisation

| Commande | Type | But |
| --- | --- | --- |
| `get-locations` | request | Liste des locations |
| `submit-location` | submission | Creation d une location |
| `edit-location` | submission | Edition d une location |
| `delete-location` | submission | Suppression d une location |

#### Preferences

| Commande | Type | But |
| --- | --- | --- |
| `fetch-preferences` | request | Preferences utilisateur |
| `update-preferences` | submission | Sauvegarde des preferences |
| `get-map-settings` | request | Reglages cartographiques |
| `set-map-settings` | submission | Mise a jour des reglages cartographiques |

#### Transmitters

| Commande | Type | But |
| --- | --- | --- |
| `submit-transmitter` | submission | Creation d un transmetteur |
| `edit-transmitter` | submission | Edition d un transmetteur |
| `delete-transmitter` | submission | Suppression d un transmetteur |

#### Tracking

| Commande | Type | But |
| --- | --- | --- |
| `get-tracking-state` | request | Etat courant du tracking |
| `set-tracking-state` | submission | Mise a jour de l etat de tracking |
| `fetch-next-passes` | request | Prochains passages pour un satellite |

#### Hardware

| Commande | Type | But |
| --- | --- | --- |
| `get-rigs` / `submit-rig` / `edit-rig` / `delete-rig` | request/submission | CRUD rigs |
| `get-rotators` / `submit-rotator` / `edit-rotator` / `delete-rotator` | request/submission | CRUD rotateurs |
| `nudge-rotator` | submission | Commande manuelle de rotateur |
| `get-cameras` / `submit-camera` / `edit-camera` / `delete-camera` | request/submission | CRUD cameras |
| `get-sdrs` / `submit-sdr` / `edit-sdr` / `delete-sdr` | request/submission | CRUD SDR |
| `get-soapy-servers` | request | Serveurs SoapyRemote detectes |
| `get-sdr-parameters` | request | Parametres et capacites d un SDR |
| `get-local-soapy-sdr-devices` | request | Enumeration locale SoapySDR |
| `get-local-rtl-sdr-devices` | request | Enumeration locale RTL-SDR |

#### Scheduler

| Commande | Type | But |
| --- | --- | --- |
| `get-scheduled-observations` | request | Liste des observations planifiees |
| `create-scheduled-observation` | submission | Creation d une observation |
| `update-scheduled-observation` | submission | Edition d une observation |
| `delete-scheduled-observations` | submission | Suppression d observations |
| `toggle-observation-enabled` | submission | Active ou desactive une observation |
| `cancel-observation` | submission | Annule une observation en cours |
| `get-monitored-satellites` | request | Liste des satellites surveilles |
| `create-monitored-satellite` | submission | Creation d un satellite surveille |
| `update-monitored-satellite` | submission | Edition d un satellite surveille |
| `delete-monitored-satellites` | submission | Suppression de satellites surveilles |
| `toggle-monitored-satellite-enabled` | submission | Active ou desactive un satellite surveille |
| `regenerate-observations` | submission | Regeneration des observations |

#### Sessions

| Commande | Type | But |
| --- | --- | --- |
| `fetch_runtime_snapshot` | request | Etat runtime des sessions et SDR |
| `fetch_session_view` | request | Vue fusionnee pour une session |

#### System info

| Commande | Type | But |
| --- | --- | --- |
| `fetch_library_versions` | request | Versions backend |
| `fetch_frontend_library_versions` | request | Versions frontend |

#### Decoder config

| Commande | Type | But |
| --- | --- | --- |
| `get-decoder-config` | request | Configuration d un decodeur |
| `get-decoder-configs-batch` | request | Batch de configurations decodeurs |

#### VFO

| Commande | Type | But |
| --- | --- | --- |
| `update-vfo-parameters` | submission | Mise a jour des parametres VFO |
| `toggle-transcription` | submission | Active ou desactive la transcription |

### `sdr_data`

Commandes speciales pour le pipeline SDR:

| Commande | But |
| --- | --- |
| `configure-sdr` | Prepare un SDR et sa session |
| `start-streaming` | Lance le streaming IQ |
| `stop-streaming` | Arrete le streaming IQ |
| `start-recording` | Demarre un enregistrement SigMF |
| `stop-recording` | Arrete un enregistrement SigMF |
| `start-audio-recording` | Demarre un enregistrement audio |
| `stop-audio-recording` | Arrete un enregistrement audio |
| `save-waterfall-snapshot` | Sauvegarde une capture waterfall |

### `file_browser`

Le canal `file_browser` ne renvoie pas toujours une reponse de callback. Les mises a jour passent
surtout par:

- `file_browser_state`
- `file_browser_error`

Commandes:

| Commande | But |
| --- | --- |
| `list-files` | Liste les enregistrements, snapshots, fichiers decoded, audio et transcriptions |
| `list-recordings` | Liste les enregistrements |
| `get-recording-details` | Detail d un enregistrement |
| `delete-recording` | Supprime un enregistrement |
| `list-snapshots` | Liste les snapshots |
| `delete-snapshot` | Supprime un snapshot |
| `delete-decoded` | Supprime un fichier ou dossier decode |
| `delete-audio` | Supprime un fichier audio |
| `delete-transcription` | Supprime une transcription |
| `delete-batch` | Suppression en lot |

### `service_control`

| Commande | But |
| --- | --- |
| `restart_service` | Arrete le service puis termine le conteneur ou le process |

### `database_backup`

| Action | But | Parametres visibles |
| --- | --- | --- |
| `list_tables` | Liste les tables et leur nombre de lignes | `action` |
| `backup_table` | Genere des INSERT SQL pour une table | `table` |
| `restore_table` | Restaure une table a partir de SQL | `table`, `sql`, `delete_first` |
| `full_backup` | Genere un dump complet | `action` |
| `full_restore` | Restaure la base complete | `sql`, `drop_tables` |

Le code valide les noms de tables et n accepte que des instructions `INSERT` pour la restauration
de table.

### `transmitter_import`

| Source | But |
| --- | --- |
| `satdump` | Importe des transmetteurs depuis la page SatDump |
| `gr-satellites` | Importe des transmetteurs depuis les YAML gr-satellites / satyaml |

Parametre visible:

- `source`

En cas de valeur inconnue, le handler renvoie une erreur.

### `start-monitoring` et `stop-monitoring`

Ces evenements activent ou desactivent la surveillance de performance cote backend. Ils ne
renvoient pas de callback standard.

### `background_task:start`, `background_task:stop`, `background_task:get`, `background_task:list`

| Evenement | But |
| --- | --- |
| `background_task:start` | Lance une tache autorisee via le registre |
| `background_task:stop` | Arrete une tache |
| `background_task:get` | Recupere les infos d une tache |
| `background_task:list` | Liste les taches |

`background_task:start` n autorise que les fonctions presentes dans `backend/tasks/registry.py`.

Taches visibles dans le registre:

- `example_long_task`
- `example_quick_task`
- `example_failing_task`
- `generate_waterfall`
- `satdump_process`
- `soapysdr_discovery`
- `soapysdr_quick_refresh`
- `tle_sync`

## Evenements emis vers le frontend

Les evenements les plus visibles dans le code frontend sont:

- `satellite-tracking`
- `ui-tracker-state`
- `sdr-status`
- `sdr-config`
- `sdr-config-error`
- `sdr-error`
- `audio-data`
- `decoder-data`
- `file_browser_state`
- `file_browser_error`
- `recording_state`
- `system-info`
- `session-runtime-snapshot`
- `sat-sync-events`
- `scheduled-observations-changed`
- `background_task:list`
- `background_task:started`
- `background_task:progress`
- `background_task:error`
- `performance-metrics`
- `vfo-states`

Le code peut emettre d autres evenements selon les modules actifs, mais ceux-ci sont les plus
visibles dans le frontend actuel.

## Exemples

### Preferences

```js
socket.emit('data_request', 'fetch-preferences', null, (response) => {
  if (response.success) {
    console.log(response.data);
  }
});
```

### Background task

```js
socket.emit('background_task:start', {
  task_name: 'tle_sync',
  args: [],
  kwargs: {},
  name: 'Manual TLE Sync'
}, (response) => {
  console.log(response);
});
```

### Database backup

```js
socket.emit('database_backup', { action: 'list_tables' }, (response) => {
  console.log(response);
});
```

### Transmitter import

```js
socket.emit('transmitter_import', { source: 'satdump' }, (response) => {
  console.log(response);
});
```

### File browser

```js
socket.emit('file_browser', 'list-files', {
  showRecordings: true,
  showSnapshots: true,
  showDecoded: true,
  showAudio: true,
  showTranscriptions: true
});
```

## Points de vigilance

- La plupart des handlers valident peu les schemas, donc les erreurs sont souvent renvoyees sous
  forme de `success: false` + `error`.
- Le file browser et certains services utilisent la diffusion d evenements plutot que des
  callbacks classiques.
- Les operations lourdes passent par des taches ou processus separes; il faut surveiller
  `background_task:*` et les evenements de status correspondants.
- Le couple `database_backup` / `restore_table` accepte du SQL controle, mais reste sensible a la
  structure du schema. A valider avec prudence.
