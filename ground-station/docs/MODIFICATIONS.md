# Modifications

## Cette passe de documentation

| Fichier | Statut | Ce qui a change | Pourquoi | Impact |
| --- | --- | --- | --- | --- |
| `README.md` | modifie | Remplacement par un guide d accueil complet, puis ajout d une section explicative sur les pages `/customize` et `/cubesat`. | Fournir une entree unique et lisible pour un nouveau developpeur. | Onboarding plus simple sans toucher a la logique applicative. |
| `docs/ARCHITECTURE.md` | cree | Ajout d une vue technique de l architecture, des dossiers, des flux de donnees, des dependances et des choix techniques, avec une precision sur `/customize` et `/cubesat`. | Documenter le fonctionnement interne du projet. | Reference utile pour les nouveaux arrivants et les revues techniques. |
| `docs/API.md` | cree | Ajout de la documentation HTTP et Socket.IO avec routes, commandes, exemples et erreurs. | Rendre l API exploitable sans parcourir tout le backend. | Guide de reference pour le frontend, les integrations et le debug. |
| `docs/CONTRIBUTING.md` | cree | Ajout des conventions de code, des commandes de test, du flux de contribution et du status des regles de branches/commits. | Centraliser les consignes de contribution. | Moins d ambiguite avant une PR. |
| `docs/MODIFICATIONS.md` | cree | Creation de ce journal de modifications. | Repondre a la demande de documentation des changements. | Trace explicite de cette passe. |

### Details par fichier

- `README.md`: le document d entree resume maintenant la base du projet, les prerequis,
  l installation locale, les variables d environnement, les commandes utiles, la structure du
  depot, l architecture generale, des exemples d usage, les problemes frequents et le role des
  pages `/customize` et `/cubesat`.
- `docs/ARCHITECTURE.md`: la documentation de fond decrit les couches frontend/backend, les flux
  event-driven, les principaux dossiers, les dependances visibles et les choix techniques. Elle
  precise aussi ou vivent les deux pages telemetry.
- `docs/API.md`: le guide API couvre les endpoints HTTP, la route WebRTC, les canaux Socket.IO,
  les commandes CRUD, les taches d arriere-plan et les evenements emis vers le frontend.
- `docs/CONTRIBUTING.md`: le guide contribution precise les conventions de style, les commandes de
  test et le process recommande pour proposer un changement.
- `docs/MODIFICATIONS.md`: ce fichier enregistre a la fois cette passe et l etat deja visible du
  worktree pour garder une trace honnete.

### Nouvelles fonctionnalites documentees

Aucune nouvelle fonctionnalite de code n a ete ajoutee dans cette passe. La documentation couvre
en revanche des elements deja presents ou deja ajoutes dans le worktree, notamment:

- les vues `customize` et `CubeSat`;
- l explication de ces pages dans le README et l architecture;
- le flux `telemetry.csv` expose via HTTP;
- les commandes Socket.IO de sauvegarde de base et d import de transmetteurs;
- la route WebRTC camera.

### Bugs corriges

Aucun bug applicatif n a ete corrige dans cette passe. Les ajustements portent uniquement sur la
documentation et la clarification des points visibles dans le code.

### Configuration, dependances et scripts

Aucun changement de code n a ete apporte aux scripts ou dependances. La documentation mentionne
simplement:

- les commandes `pytest`, `npm test`, `npm run build`, `npm run lint` et `python run_alembic.py
  upgrade head`;
- les variables `GS_DB`, `STATIC_FILES_DIR`, `GS_ENVIRONMENT`, `BUILD_VERSION`, `BUILD_DATE`,
  `GIT_COMMIT`, `GITHUB_TOKEN`, `SYSTEM_INFO_POLL_INTERVAL_SECONDS` et `GS_DECODER_TRACE`;
- le desaccord visible entre `GS_BACKEND_*` dans `vite.config.js` et `VITE_GS_BACKEND_*` dans les
  fichiers `.env.*` du frontend, marque `A confirmer`.

### Migrations ou actions apres modification

Aucune migration n est necessaire, car les modifications de cette passe concernent uniquement la
documentation.

## Changements deja visibles dans le worktree au debut de la passe

Les fichiers ci-dessous etaient deja modifies ou ajoutes quand l analyse a commence. Je ne les ai
pas modifies dans cette passe, mais ils font partie de l etat actuel du projet et sont donc pris en
compte dans la documentation.

| Fichier(s) | Statut | Resume factuel | Note |
| --- | --- | --- | --- |
| `Dockerfile` | modifie | Copie `telemetry.csv` dans l image pour l API `customize`. | Non modifie ici. |
| `backend/server/startup.py` | modifie | Ajout de `GET /api/telemetry.csv` et rattachement du fichier CSV a l API. | Non modifie ici. |
| `backend/startup.sh` | modifie | Script de demarrage du conteneur pour D-Bus, Avahi, SDRplay et GNU Radio. | Non modifie ici. |
| `frontend/package.json` | modifie | Ajout de `recharts` et scripts frontend deja visibles. | Non modifie ici. |
| `frontend/package-lock.json` | modifie | Verrouillage npm mis a jour pour les dependances frontend. | Non modifie ici. |
| `frontend/src/components/common/store.jsx` | modifie | Ajout du reducer `telemetry` au store Redux. | Non modifie ici. |
| `frontend/src/config/navigation.jsx` | modifie | Ajout des entrees de navigation `customize` et `cubesat`. | Non modifie ici. |
| `frontend/src/main.jsx` | modifie | Ajout des routes React `/customize` et `/cubesat`. | Non modifie ici. |
| `telemetry.csv` | ajoute | Source de donnees CSV pour les dashboards telemetry et CubeSat. | Non modifie ici. |
| `frontend/public/telemetry.csv` | ajoute | Copie publique du CSV pour le frontend. | Non modifie ici. |
| `frontend/src/assets/cubesat-annotated-base.svg` | ajoute | Asset graphique pour la vue CubeSat. | Non modifie ici. |
| `frontend/src/components/customize/` | ajoute | Nouveau sous-arbre avec dashboards, slices, helpers et docs de feature. | Non modifie ici. |
| `CONTRIBUTING.md` | modifie | Remplace par un pointeur vers `docs/CONTRIBUTING.md`. | Deja present dans le worktree au debut de la passe, A confirmer sur l auteur exact. |

### Dossiers et fichiers notables dans `frontend/src/components/customize/`

- `cubesat-config.js`
- `cubesat-dashboard.jsx`
- `cubesat-subsystem-panel.jsx`
- `cubesat-annotated-visual.jsx`
- `telemetry-dashboard.jsx`
- `telemetry-dashboard-compact.jsx`
- `telemetry-components.jsx`
- `telemetry-data-source.js`
- `telemetry-slice.jsx`
- `telemetry-utils.js`
- `use-telemetry-stream.jsx`
- `advanced-telemetry-widgets.jsx`
- `README.md`
- `INTEGRATION_GUIDE.md`

## Verification

- Validation de base: documentation only, aucune logique applicative n a ete modifiee dans cette
  passe.
- Tests applicatifs: non lances.
- Verification supplementaire recommandee: `git diff --check` puis, si necessaire, les tests
  backend et frontend usuels.
