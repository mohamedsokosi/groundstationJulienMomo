# Rapport Complet des Fonctions et Méthodes — Ground Station

> Généré le 2026-05-12  
> Projet : Ground Station (backend Python + frontend React/JS)

---

## Table des Matières

### Backend (Python)
- [app.py](#backendapppy)
- [common/appconfig.py](#backendcommonappconfigpy)
- [common/arguments.py](#backendcommonargumentspy)
- [common/common.py](#backendcommoncommonpy)
- [common/logger.py](#backendcommonloggerpy)
- [crud/preferences.py](#backendcrudpreferencespy)
- [db/models.py](#backenddbmodelspy)
- [handlers/preferences.py](#backendhandlerspreferencespy)
- [handlers/routing.py](#backendhandlersroutingpy)
- [handlers/socket.py](#backendhandlerssocketpy)
- [pipeline/mqtt_telemetry_receiver.py](#backendpipelinemqtt_telemetry_receiverpy)
- [pipeline/telemetry_store.py](#backendpipelinetelemetry_storepy)
- [server/shutdown.py](#backendservershutdownpy)
- [server/startup.py](#backendserverstartuppy)
- [server/telemetry_protobuf.py](#backendservertelemetry_protobufpy)
- [server/version.py](#backendserverversionpy)

### Frontend (React / JavaScript)
- [pages/cesium-utils.js](#frontendpagescesium-utilsjs)
- [pages/telemetry-dashboard.jsx](#frontendpagestelemetry-dashboardjsx)
- [pages/CesiumViewport.jsx](#frontendpagescesiumviewportjsx)
- [pages/telemetry-components.jsx](#frontendpagestelemetry-componentsjsx)
- [pages/chart-logic.js](#frontendpageschart-logicjs)
- [pages/telemetry-protobuf.js](#frontendpagestelemetry-protobufjs)
- [pages/ChartTitle.jsx](#frontendpagescharttitlejsx)
- [pages/cubesat-dashboard.jsx](#frontendpagescubesat-dashboardjsx)
- [pages/chart-fields.js](#frontendpageschart-fieldsjs)
- [pages/station-dashboard.jsx](#frontendpagesstation-dashboardjsx)
- [pages/TelemetryStatsBar.jsx](#frontendpagestelemetrystatsbaarjsx)
- [pages/TelemetryTerminal.jsx](#frontendpagestelemetryterminalJsx)
- [pages/telemetry-data-source.js](#frontendpagestelemetry-data-sourcejs)
- [pages/TelemetryChart.jsx](#frontendpagestelemetrychartjsx)
- [pages/cubesat-annotated-visual.jsx](#frontendpagescubesat-annotated-visualjsx)
- [pages/use-telemetry-stream.jsx](#frontendpagesuse-telemetry-streamjsx)
- [pages/rapport-dashboard.jsx](#frontendpagesrapport-dashboardjsx)
- [pages/telemetry-slice.jsx](#frontendpagestelemetry-slicejsx)
- [pages/cubesat-utils.js](#frontendpagescubesat-utilsjs)
- [pages/analyse-dashboard.jsx](#frontendpagesanalyse-dashboardjsx)
- [pages/telemetry-utils.js](#frontendpagestelemetry-utilsjs)
- [pages/cubesat-subsystem-panel.jsx](#frontendpagescubesat-subsystem-paneljsx)

---

## Backend (Python)

---

### `backend/app.py`

Point d'entrée principal de l'application.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L27 | `print_banner` | `() → None` | Affiche la bannière de version de Ground Station dans le terminal. |
| L32 | `configure_process_names` | `() → None` | Définit les noms du processus et du thread principal pour faciliter le monitoring. |
| L39 | `main` | `() → None` | Point d'entrée principal : initialise la base de données, enregistre les handlers et démarre le serveur Uvicorn. |

---

### `backend/common/appconfig.py`

Chargement de la configuration de l'application.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L39 | `load_app_config` | `(config_path: Path) → Dict[str, Any]` | Charge la configuration applicative depuis un fichier JSON. Retourne les valeurs par défaut si le fichier est absent. |

---

### `backend/common/arguments.py`

Gestion des arguments en ligne de commande.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L104 | `_pick` | `(cli_value, key) → Any` | Fonction interne : sélectionne la valeur CLI ou revient à la valeur du fichier de configuration. |

---

### `backend/common/common.py`

Utilitaires communs (sérialisation JSON, décorateurs de timing).

| # | Fonction / Méthode | Signature | Description |
|---|-------------------|-----------|-------------|
| L29 | `ModelEncoder.__init__` | `(self, *args, **kwargs) → None` | Encodeur JSON personnalisé qui force `allow_nan=False` pour éviter les valeurs NaN/Infinity. |
| L36 | `ModelEncoder.default` | `(self, obj) → Any` | Gère la sérialisation des types non-standards : dates, UUID, types numpy, modèles SQLAlchemy. |
| L73 | `ModelEncoder.encode` | `(self, o) → str` | Assainit l'objet avant encodage pour détecter les valeurs NaN/Infinity. |
| L90 | `serialize_object` | `(obj) → Any` | Sérialise un objet Python en JSON et le désérialise via l'encodeur personnalisé. |
| L110 | `timeit` | `(func) → Decorator` | Décorateur synchrone qui mesure et journalise le temps d'exécution de la fonction décorée. |
| L124 | `async_timeit` | `(func) → Async Decorator` | Décorateur asynchrone qui mesure et journalise le temps d'exécution d'une coroutine. |

---

### `backend/common/logger.py`

Configuration du système de journalisation.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L25 | `get_logger_config` | `(args) → dict` | Charge la configuration de logging depuis un fichier YAML spécifié dans les arguments. |
| L51 | `get_logger` | `(args) → logging.Logger` | Retourne une instance de logger configurée nommée `"ground-station"`. |

---

### `backend/crud/preferences.py`

Opérations CRUD sur les préférences utilisateur.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L28 | `fetch_preference` | `(session, preference_id) → dict` | Récupère une préférence unique par son UUID. |
| L49 | `fetch_all_preferences` | `(session) → dict` | Récupère toutes les préférences en les fusionnant avec les valeurs par défaut. |
| L94 | `add_preference` | `(session, data) → dict` | Crée et persiste un nouvel enregistrement de préférence. |
| L126 | `edit_preference` | `(session, data) → dict` | Modifie une préférence existante en mettant à jour les champs fournis. |
| L168 | `set_preferences` | `(session, preferences) → dict` | Modifie ou insère (upsert) plusieurs enregistrements de préférences. |
| L272 | `delete_preference` | `(session, preference_id) → dict` | Supprime un enregistrement de préférence par son UUID. |

---

### `backend/db/models.py`

Modèles SQLAlchemy et types de données personnalisés.

| # | Méthode | Signature | Description |
|---|---------|-----------|-------------|
| L12 | `AwareDateTime.process_result_value` | `(self, value, dialect) → datetime` | Assure que les datetimes lus depuis la base sont timezone-aware (UTC si naïf). |
| L23 | `AwareDateTime.process_bind_param` | `(self, value, dialect) → datetime` | Assure que les datetimes écrits en base sont timezone-aware. |

---

### `backend/handlers/preferences.py`

Handlers Socket.IO pour les préférences.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L7 | `fetch_preferences` | `(sio, data, logger, sid) → Dict[str, Union[bool, list]]` | Récupère toutes les préférences via le handler Socket.IO. |
| L16 | `update_preferences` | `(sio, data, logger, sid) → Dict[str, Union[bool, list, str]]` | Met à jour les préférences via le handler Socket.IO. |
| L28 | `register_handlers` | `(registry) → None` | Enregistre les handlers de préférences dans le registre de handlers. |

---

### `backend/handlers/routing.py`

Registre et routage des handlers.

| # | Méthode / Fonction | Signature | Description |
|---|-------------------|-----------|-------------|
| L15 | `HandlerRegistry.register` | `(self, command, handler, event_type) → None` | Enregistre une seule route de handler. |
| L18 | `HandlerRegistry.register_batch` | `(self, routes) → dict` | Enregistre plusieurs routes de handlers à partir d'un dictionnaire. |
| L22 | `HandlerRegistry.get_handler` | `(self, command) → Optional[HandlerRoute]` | Récupère la route de handler associée à une commande. |
| L29 | `dispatch_request` | `(sio, cmd, data, logger, sid, registry) → Dict` | Dispatch une requête vers le handler approprié selon la commande. |

---

### `backend/handlers/socket.py`

Enregistrement des événements Socket.IO.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L10 | `_register_all_handlers` | `() → None` | Enregistre tous les handlers d'événements dans le registre. |
| L17 | `register_socketio_handlers` | `(sio) → None` | Enregistre les événements Socket.IO : `connect`, `disconnect`, `data_request`, `data_submission`. |

---

### `backend/pipeline/mqtt_telemetry_receiver.py`

Réception de télémétrie via MQTT.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L16 | `_env_int` | `(name, default) → int` | Parse une variable d'environnement en entier avec valeur de repli. |
| L23 | `is_mqtt_enabled` | `() → bool` | Vérifie si le récepteur MQTT est activé via variable d'environnement. |
| L27 | `get_mqtt_config` | `() → dict` | Retourne le dictionnaire de configuration MQTT depuis les variables d'environnement. |
| L39 | `_run_receiver` | `(config) → None` | Exécute la boucle du récepteur MQTT : connexion au broker et abonnement au topic. |
| L102 | `start_mqtt_receiver_in_background` | `() → None` | Démarre le récepteur MQTT dans un thread en arrière-plan. |

---

### `backend/pipeline/telemetry_store.py`

Stockage en mémoire des trames de télémétrie.

#### Classe `TelemetryStore`

| # | Méthode | Signature | Description |
|---|---------|-----------|-------------|
| L10 | `__init__` | `(self, maxlen) → None` | Initialise le store avec une longueur maximale de deque. |
| L14 | `configure_maxlen` | `(self, maxlen) → None` | Reconfigure la longueur maximale de la deque. |
| L23 | `add_frame` | `(self, frame) → None` | Ajoute une trame de télémétrie au store. |
| L27 | `get_frames` | `(self) → list[dict]` | Retourne la liste de toutes les trames stockées. |
| L31 | `clear_frames` | `(self) → None` | Vide toutes les trames du store. |
| L35 | `has_frames` | `(self) → bool` | Retourne `True` si le store contient au moins une trame. |
| L39 | `get_count` | `(self) → int` | Retourne le nombre de trames actuellement stockées. |

#### Fonctions module (wrappers sur le singleton)

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L47 | `configure_maxlen` | `(maxlen) → None` | Configure la longueur maximale du store singleton. |
| L51 | `add_frame` | `(frame) → None` | Ajoute une trame au store singleton. |
| L55 | `get_frames` | `() → list[dict]` | Retourne les trames du store singleton. |
| L59 | `clear_frames` | `() → None` | Vide le store singleton. |
| L63 | `has_frames` | `() → bool` | Vérifie si le store singleton a des trames. |
| L67 | `get_count` | `() → int` | Retourne le nombre de trames du store singleton. |

---

### `backend/server/shutdown.py`

Gestion de l'arrêt propre du serveur.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L6 | `cleanup_everything` | `() → None` | Exécute les opérations de nettoyage à l'arrêt du serveur. |
| L10 | `signal_handler` | `(signum, frame) → None` | Intercepte les signaux SIGINT/SIGTERM et déclenche l'arrêt propre. |

---

### `backend/server/startup.py`

Démarrage de l'application FastAPI, endpoints REST.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L26 | `lifespan` | `(fastapiapp) → AsyncContextManager` | Gestionnaire du cycle de vie FastAPI (démarrage / nettoyage). |
| L81 | `get_version` | `() → Response` | Endpoint GET `/api/version` : retourne les informations de version. |
| L90 | `update_check` | `() → Response` | Endpoint GET `/api/update-check` : vérifie les mises à jour disponibles. |
| L103 | `_get_telemetry_csv_path` | `() → Path` | Retourne le chemin vers le fichier `telemetry.csv`. |
| L107 | `_read_telemetry_csv_frames` | `(csv_path) → list[dict]` | Lit et parse les trames de télémétrie depuis un fichier CSV. |
| L116 | `get_telemetry_csv` | `() → Response` | Endpoint GET `/api/telemetry/csv` : retourne les données CSV de télémétrie. |
| L135 | `get_telemetry_protobuf` | `() → Response` | Endpoint GET `/api/telemetry/protobuf` : retourne la télémétrie encodée en Protobuf. |
| L161 | `get_telemetry_mqtt_status` | `() → Response` | Endpoint GET `/api/telemetry/mqtt/status` : retourne l'état du récepteur MQTT. |
| L175 | `clear_telemetry_mqtt_store` | `() → Response` | Endpoint DELETE `/api/telemetry/mqtt/store` : vide le store de télémétrie MQTT. |
| L184 | `serve_spa` | `(request, full_path) → Response` | Endpoint catch-all : sert l'application SPA React. |
| L191 | `init_db` | `() → None` | Initialise la base de données et exécute les migrations. |

---

### `backend/server/telemetry_protobuf.py`

Encodage/décodage Protobuf des trames de télémétrie.

#### Fonctions d'aide

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L32 | `_to_string` | `(value, fallback) → str` | Convertit une valeur en string avec valeur de repli. |
| L38 | `_to_float` | `(value, fallback) → float` | Convertit une valeur en float avec valeur de repli. |
| L45 | `_to_uint32` | `(value, fallback) → int` | Convertit une valeur en uint32 avec vérification des bornes. |
| L53 | `_clean_row` | `(row) → dict` | Assainit une ligne de télémétrie (trim strings, suppression des clés `None`). |

#### Fonctions de normalisation

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L61 | `csv_row_to_telemetry_frame` | `(row, sequence_number) → dict` | Convertit une ligne CSV en dictionnaire de trame de télémétrie. |
| L87 | `normalize_telemetry_frame` | `(frame, sequence_number) → dict` | Normalise une trame gérant à la fois snake_case et camelCase. |

#### Fonctions d'encodage Protobuf

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L139 | `encode_varint` | `(value) → bytes` | Encode un uint32 en entier à longueur variable (varint). |
| L151 | `encode_key` | `(field_number, wire_type) → bytes` | Encode la clé de champ Protobuf. |
| L155 | `encode_uint32` | `(field_number, value) → bytes` | Encode un champ uint32. |
| L159 | `encode_double` | `(field_number, value) → bytes` | Encode un champ double. |
| L163 | `encode_string` | `(field_number, value) → bytes` | Encode un champ string. |
| L170 | `encode_telemetry_frame` | `(frame) → bytes` | Encode une trame complète de télémétrie en Protobuf. |
| L196 | `encode_telemetry_batch` | `(frames, schema_version) → bytes` | Encode un lot de trames de télémétrie en Protobuf. |

#### Fonctions de décodage Protobuf

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L209 | `decode_varint` | `(data, offset) → tuple[int, int]` | Décode un entier à longueur variable depuis des bytes. |
| L229 | `_read_length_delimited` | `(data, offset) → tuple[bytes, int]` | Lit un champ à longueur délimitée. |
| L237 | `_read_double` | `(data, offset) → tuple[float, int]` | Lit un double (8 octets) depuis des bytes. |
| L244 | `_skip_field` | `(data, offset, wire_type) → int` | Saute un champ selon son wire type. |
| L264 | `decode_telemetry_frame` | `(data) → dict` | Décode une trame de télémétrie depuis des bytes Protobuf. |
| L322 | `decode_telemetry_batch` | `(data) → dict` | Décode un lot de trames de télémétrie depuis des bytes Protobuf. |

---

### `backend/server/version.py`

Gestion des versions, informations système et vérification de mises à jour.

#### Fonctions de version

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L44 | `_normalize_version` | `(raw) → str` | Normalise une chaîne de version au format `major.minor.patch`. |
| L62 | `_compare_versions` | `(a, b) → int` | Compare deux versions sémantiques (1 si a>b, -1 si a<b, 0 si égales). |
| L86 | `_fetch_latest_release` | `() → dict[str, Any]` | Récupère les informations de la dernière release depuis l'API GitHub. |
| L100 | `get_update_check` | `(cache_ttl_seconds) → UpdateCheckData` | Retourne la disponibilité d'une mise à jour avec mise en cache mémoire. |
| L138 | `get_version_base` | `() → str` | Lit la version de base depuis le fichier `version.json`. |
| L153 | `get_git_revision_short_hash` | `() → str` | Retourne le hash court de la révision git ou `"unknown"`. |
| L164 | `get_build_date` | `() → str` | Retourne la date de build au format ISO (YYYYMMDD). |
| L169 | `get_version_info` | `() → dict` | Retourne les informations complètes de version (version, buildDate, gitCommit, environment). |
| L368 | `get_version` | `() → str` | Retourne la chaîne de version courante depuis le cache. |
| L376 | `get_full_version_info` | `() → dict` | Retourne le dictionnaire complet d'informations de version. |
| L396 | `write_version_info_during_build` | `(version_info_override) → dict` | Écrit les informations de version dans un fichier lors du build. |

#### Fonctions d'informations système

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L211 | `_get_cpu_usage_percent_nonblocking` | `(prime) → float` | Retourne le pourcentage d'utilisation CPU sans bloquer. |
| L229 | `get_system_info` | `(include_load_avg, include_cpu_temp, nonblocking_cpu) → dict` | Retourne les informations système : CPU, mémoire, disque, OS, températures. |

---

## Frontend (React / JavaScript)

---

### `frontend/src/pages/cesium-utils.js`

Utilitaires pour l'intégration CesiumJS (carte 3D).

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L22 | `getTelemetryRecordGeo` | `(record) → {lat, lon, alt} \| null` | Extrait les coordonnées géographiques d'un enregistrement de télémétrie. |
| L30 | `getCesiumRecordPosition` | `(record) → Cartesian3 \| null` | Retourne la position 3D Cesium d'un enregistrement de télémétrie. |
| L36 | `getCesiumGroundPosition` | `(record) → Cartesian3 \| null` | Retourne la position au sol projetée (altitude 0) pour Cesium. |
| L42 | `getTrajectoryCameraView` | `(records) → {lon, lat, height}` | Calcule la vue caméra optimale pour afficher une trajectoire complète. |
| L61 | `createBaseImageryProvider` | `() → Promise<ImageryProvider>` | Crée le fournisseur d'imagerie de base avec chaîne de repli. |

---

### `frontend/src/pages/telemetry-dashboard.jsx`

Dashboard principal de télémétrie (composant legacy/monolithique).

#### Fonctions utilitaires

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L73 | `withTelemetryCacheBuster` | `(endpoint) → string` | Ajoute un paramètre anti-cache à une URL d'endpoint. |
| L78 | `getTelemetryPayloadSignature` | `(payload, format) → string` | Génère une signature unique d'un payload de télémétrie (pour détecter les changements). |
| L94 | `getTelemetryRowIdentity` | `(record) → string` | Génère un identifiant unique pour un enregistrement de télémétrie. |
| L102 | `parseCSV` | `(text) → array` | Parse un texte CSV en tableau d'objets JavaScript. |
| L133 | `formatClock` | `(value, fallback) → string` | Formate une valeur de date en affichage horloge `HH:MM:SS`. |
| L147 | `getRecordClock` | `(record, fallback) → string` | Extrait et formate l'heure depuis un enregistrement de télémétrie. |
| L151 | `distanceKm` | `(start, end) → number` | Calcule la distance Haversine (en km) entre deux points géographiques. |
| L166 | `getMqttSourceStat` | `(mqttStatus) → object` | Retourne les statistiques de l'état de la source MQTT. |

#### Composants React

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L206 | `TelemetryStatsBar` | `{currentRecord, distance, mqttStatus}` | Barre de statistiques de télémétrie (vitesse, altitude, distance, etc.). |
| L242 | `RightControlPanel` | `{onZoomIn, onZoomOut, options, onToggle}` | Panneau de contrôle droit avec options de carte. |
| L375 | `MapViewport` | `{currentRecord, firstRecord, hasData, loading, mapOptions, onToggleMapOption, trajectoryRecords}` | Viewport principal de la carte 3D Cesium. |
| L662 | `TimelineControls` | `{...}` | Contrôles de lecture/avance de la timeline de télémétrie. |
| L705 | `TelemetryDashboard` | `()` | Composant principal du dashboard de télémétrie. |

---

### `frontend/src/pages/CesiumViewport.jsx`

Composant isolé du viewport Cesium (version refactorisée).

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L34 | `RightControlPanel` | `{onZoomIn, onZoomOut, options, onToggle}` | Panneau de contrôle de la carte (exporté). |
| L62 | `CesiumViewport` | `{currentRecord, firstRecord, hasData, loading, mapOptions, onToggleMapOption, trajectoryRecords}` | Composant viewport Cesium isolé (exporté). |

---

### `frontend/src/pages/telemetry-components.jsx`

Composants React réutilisables pour la télémétrie.

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L29 | `StatisticCard` | `{label, value, color, icon}` | Carte de statistique réutilisable avec label, valeur, couleur et icône. |
| L74 | `ChartCard` | `{title, children, subtitle}` | Carte de graphique réutilisable avec titre et sous-titre. |
| L111 | `TelemetrySummary` | `{data}` | Résumé des données de télémétrie sous forme de cartes. |

---

### `frontend/src/pages/chart-logic.js`

Logique de calcul pour les graphiques (FSPL, link budget).

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L6 | `computeFSPL` | `(altM) → number \| null` | Calcule la perte en espace libre (FSPL) depuis l'altitude en mètres. |
| L11 | `computeLinkBudget` | `(fspl) → number \| null` | Calcule le bilan de liaison depuis le FSPL. |
| L16 | `enrich` | `(row) → object` | Enrichit une ligne de télémétrie avec les champs calculés (FSPL, link budget, distance). |
| L22 | `pagedDomain` | `(maxVal, minVal, step) → [number, number]` | Calcule le domaine paginé pour les axes de graphiques. |

---

### `frontend/src/pages/telemetry-protobuf.js`

Décodage Protobuf côté frontend (implémentation JavaScript).

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L8 | `readVarint` | `(bytes, offset) → {value, offset}` | Lit un entier à longueur variable (varint) depuis un buffer. |
| L31 | `readLengthDelimited` | `(bytes, offset) → {value, offset}` | Lit un champ à longueur délimitée depuis un buffer. |
| L46 | `readDouble` | `(bytes, offset) → {value, offset}` | Lit un double (8 octets) depuis un buffer. |
| L60 | `readString` | `(bytes, offset) → {value, offset}` | Lit un champ string UTF-8 depuis un buffer. |
| L68 | `skipField` | `(bytes, offset, wireType) → number` | Saute un champ Protobuf selon son wire type. |
| L83 | `decodeTelemetryFrame` | `(bytes) → object` | Décode une trame de télémétrie depuis des bytes Protobuf. |

---

### `frontend/src/pages/ChartTitle.jsx`

Composant d'en-tête de graphique.

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L5 | `ChartTitle` | `{chart, sx}` | Affiche le titre d'un graphique avec les noms de champs. |

---

### `frontend/src/pages/cubesat-dashboard.jsx`

Dashboard interactif CubeSat.

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L20 | `CubeSatDashboard` | `()` | Dashboard principal interactif du CubeSat avec visualisation des sous-systèmes. |

---

### `frontend/src/pages/chart-fields.js`

Configuration des champs de graphiques.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L27 | `fieldLabel` | `(key) → string` | Retourne le label lisible d'un champ de télémétrie par sa clé. |
| L31 | `fieldUnit` | `(key) → string` | Extrait l'unité depuis le label d'un champ. |
| L36 | `fieldStep` | `(key) → number` | Retourne le pas de graduation pour un champ donné. |

---

### `frontend/src/pages/station-dashboard.jsx`

Dashboard principal de la station sol.

#### Fonctions utilitaires

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L26 | `formatClock` | `(value, fallback) → string` | Formate une valeur temporelle en `HH:MM:SS`. |
| L33 | `getRecordClock` | `(record, fallback) → string` | Extrait l'heure formatée d'un enregistrement de télémétrie. |
| L84 | `loadFavoriteCharts` | `() → array` | Charge la liste des graphiques favoris depuis `localStorage`. |
| L95 | `loadLeftColumnItems` | `() → array` | Charge la configuration de la colonne gauche depuis `localStorage`. |

#### Composants React

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L38 | `TimelineControls` | `{...}` | Contrôles de timeline (lecture, pause, avance, rewind). |

---

### `frontend/src/pages/TelemetryStatsBar.jsx`

Barre de statistiques de télémétrie (composant extrait).

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L5 | `TelemetryStatsBar` | `{currentRecord, distance, mqttStatus}` | Affiche les statistiques temps-réel de télémétrie (altitude, vitesse, RSSI, etc.). |

---

### `frontend/src/pages/TelemetryTerminal.jsx`

Terminal d'affichage de télémétrie brute.

| # | Fonction / Composant | Signature | Description |
|---|---------------------|-----------|-------------|
| L7 | `fmtTime` | `(d) → string` | Formate une date en `HH:MM:SS`. |
| L12 | `TelemetryTerminal` | `() → JSX` | Composant terminal style CLI affichant les trames de télémétrie brutes en temps réel. |

---

### `frontend/src/pages/telemetry-data-source.js`

Sources de données de télémétrie (CSV, Protobuf, fichiers).

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L14 | `parseTelemetryCsv` | `(text) → array` | Parse un texte CSV en tableau d'enregistrements de télémétrie normalisés. |
| L45 | `parseTelemetryProtobuf` | `(buffer) → array` | Décode des données de télémétrie Protobuf depuis un ArrayBuffer. |
| L49 | `buildTelemetryChartData` | `(data) → array` | Transforme des données de télémétrie en format optimisé pour les graphiques. |
| L80 | `createTelemetryStreamPoint` | `(rows, currentIndex, streamIndex) → object \| null` | Crée un point de stream depuis un tableau de lignes et un index. |
| L92 | `getTelemetryStreamLimit` | `(sourceLength) → number` | Calcule le nombre maximum de points de stream selon la taille de la source. |
| L96 | `readTextFile` | `(file) → Promise<string>` | Lit un fichier texte de l'utilisateur et retourne son contenu. |

---

### `frontend/src/pages/TelemetryChart.jsx`

Composant de graphique de télémétrie.

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L17 | `TelemetryChart` | `{data, xKey, lines, tracking, onTrackingChange}` | Graphique Recharts pour visualiser les séries temporelles de télémétrie. |

---

### `frontend/src/pages/cubesat-annotated-visual.jsx`

Visualisation annotée SVG du CubeSat.

| # | Fonction / Composant | Signature | Description |
|---|---------------------|-----------|-------------|
| L15 | `getPolygonPath` | `(points) → string` | Convertit un tableau de points en chemin SVG `d`. |
| L19 | `CubeSatAnnotatedVisual` | `{selectedSubsystemId, hoveredSubsystemId, ...}` | Diagramme SVG interactif annoté du CubeSat avec sélection de sous-systèmes. |

---

### `frontend/src/pages/use-telemetry-stream.jsx`

Hook React pour le streaming de télémétrie.

| # | Hook | Signature | Description |
|---|------|-----------|-------------|
| L39 | `useTelemetryStream` | `({autoStart, sourceUrl, intervalMs}) → state & controls` | Hook React gérant le streaming de télémétrie : chargement, lecture, pause, avance trame par trame. |

---

### `frontend/src/pages/rapport-dashboard.jsx`

Dashboard de rapport et d'export.

#### Fonctions utilitaires

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L48 | `fsplDB` | `(distM, freqMHz) → number \| null` | Calcule le FSPL en dB depuis la distance (m) et la fréquence (MHz). |
| L53 | `downloadText` | `(filename, content, mime) → void` | Déclenche le téléchargement d'un contenu texte comme fichier. |

#### Composants React

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L63 | `StatCard` | `{label, value, unit, color}` | Carte de statistique avec label, valeur, unité et couleur. |
| L94 | `SectionHeader` | `{title, subtitle}` | En-tête de section avec titre et sous-titre. |

---

### `frontend/src/pages/telemetry-slice.jsx`

Redux slice pour la gestion de l'état de télémétrie.

| # | Action / Reducer | Signature | Description |
|---|-----------------|-----------|-------------|
| L37 | `setTelemetrySourceData` | `(state, action)` | Définit les données source brutes dans le store Redux. |
| L41 | `setTelemetryData` | `(state, action)` | Définit les données de télémétrie traitées dans le store. |
| L45 | `appendTelemetryPoint` | `(state, action)` | Ajoute un point de télémétrie au tableau existant. |
| L65 | `setLoading` | `(state, action)` | Définit l'état de chargement (`true`/`false`). |
| L68 | `setError` | `(state, action)` | Définit le message d'erreur dans le store. |
| L71 | `setSelectedPoint` | `(state, action)` | Définit le point actuellement sélectionné dans la timeline. |
| L74 | `setPlaybackState` | `(state, action)` | Définit l'index de lecture et l'index de stream. |
| L78 | `setTelemetryMode` | `(state, action)` | Définit le mode de télémétrie (CSV, Protobuf, MQTT, etc.). |
| L81 | `resetTelemetryStream` | `(state, action)` | Réinitialise le stream à son état initial. |
| L88 | `clearTelemetryData` | `(state, action)` | Efface toutes les données de télémétrie du store. |

---

### `frontend/src/pages/cubesat-utils.js`

Utilitaires pour le dashboard CubeSat.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L8 | `getSubsystemById` | `(subsystemId) → object` | Retourne la configuration d'un sous-système par son identifiant. |
| L12 | `getTelemetryField` | `(fieldId) → object` | Retourne la configuration d'un champ de télémétrie par son ID. |
| L16 | `getFieldCurrentValue` | `(fieldConfig, record) → any` | Extrait la valeur actuelle d'un champ depuis un enregistrement de télémétrie. |
| L28 | `formatFieldCurrentValue` | `(fieldConfig, record) → string` | Formate la valeur d'un champ pour l'affichage (avec unité). |
| L42 | `getSubsystemMetrics` | `(subsystem, record) → array` | Retourne toutes les métriques d'un sous-système pour un enregistrement. |
| L56 | `getSubsystemSummaryMetrics` | `(subsystem, record) → array` | Retourne les métriques résumées (affichage compact) d'un sous-système. |
| L67 | `getSubsystemTrendSeries` | `(subsystem, chartData, limit) → array` | Retourne les séries de tendance d'un sous-système pour les graphiques. |
| L100 | `getSubsystemStatus` | `(subsystem, latestRecord) → {label, tone}` | Détermine le statut opérationnel d'un sous-système (OK, WARNING, ERROR). |

---

### `frontend/src/pages/analyse-dashboard.jsx`

Dashboard d'analyse et de configuration des graphiques.

#### Fonctions utilitaires

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L51 | `gridCol` | `(cols) → object` | Retourne une configuration de colonne de grille CSS. |
| L59 | `migrateChart` | `(c) → object` | Migre un graphique depuis l'ancien format vers le format actuel. |
| L64 | `loadSavedCharts` | `() → array \| null` | Charge les graphiques sauvegardés depuis `localStorage`. |

#### Composants React

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L86 | `AnalyseDashboard` | `()` | Dashboard d'analyse permettant la création et personnalisation de graphiques. |

---

### `frontend/src/pages/telemetry-utils.js`

Utilitaires bas-niveau pour la télémétrie.

| # | Fonction | Signature | Description |
|---|----------|-----------|-------------|
| L1 | `normalizeTelemetryHeader` | `(header) → string` | Normalise un header CSV en remplaçant les espaces par des underscores. |
| L5 | `isTelemetryNumericHeader` | `(header) → boolean` | Vérifie si un header représente une donnée numérique. |
| L11 | `toTelemetryNumber` | `(value, fallback) → number` | Convertit une valeur en nombre avec valeur de repli. |
| L30 | `getTelemetryValue` | `(record, keys, fallback) → any` | Extrait une valeur d'un enregistrement par clé(s) avec repli. |
| L44 | `getTelemetryNumber` | `(record, keys, fallback) → number` | Extrait une valeur numérique d'un enregistrement par clé(s). |
| L48 | `formatTelemetryNumber` | `(value, decimals, unit) → string` | Formate un nombre avec décimales et unité pour l'affichage. |
| L59 | `distanceKm` | `(start, end) → number` | Calcule la distance Haversine (km) entre deux coordonnées géographiques. |
| L70 | `getMqttSourceStat` | `(mqttStatus) → object` | Retourne les statistiques de l'état de la source MQTT. |

---

### `frontend/src/pages/cubesat-subsystem-panel.jsx`

Panneau de détail d'un sous-système CubeSat.

| # | Composant | Props | Description |
|---|-----------|-------|-------------|
| L40 | `CubeSatSubsystemPanel` | `{subsystem, latestPoint, chartData}` | Panneau détaillé d'un sous-système : métriques, graphiques de tendance, statut. |

---

## Résumé statistique

| Catégorie | Nombre |
|-----------|--------|
| Fichiers backend Python | 16 |
| Fichiers frontend JS/JSX | 21 |
| Fonctions/méthodes backend | ~80 |
| Composants React | ~22 |
| Fonctions utilitaires frontend | ~55 |
| **Total fonctions/méthodes** | **~157** |

---

*Rapport généré automatiquement depuis le code source du projet Ground Station.*
