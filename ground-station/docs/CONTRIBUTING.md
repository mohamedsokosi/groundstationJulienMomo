# Contributing

## Conventions de code

### Backend Python

- Style principal: `Black` avec une largeur de ligne de 100 caracteres.
- Imports tries avec `isort`.
- Les tests backend utilisent `pytest` et des marqueurs (`unit`, `integration`, `slow`).
- Le code utilise beaucoup d async, de Socket.IO et de SQLAlchemy async; gardez ces patterns
  coherents.
- Les handlers Socket.IO renvoient le plus souvent `{success, data, error}`. Gardez ce contrat
  quand vous ajoutez une nouvelle commande.

### Frontend React

- Le frontend utilise `ESLint`, des function components React, Redux Toolkit et MUI.
- Le store Redux persiste seulement certaines preferences UI.
- Les nouveaux ecrans devraient suivre la navigation existante dans
  `frontend/src/config/navigation.jsx`.
- Les traductions passent par `frontend/src/i18n/`; ajoutez les nouvelles cles dans les locales
  pertinentes.

### Documentation

- Ecrire les chemins de fichiers avec des liens markdown quand c est possible.
- Garder un ton clair et factuel.
- Si une information est incertaine, noter `A confirmer`.

## Lancer les tests

### Backend

```bash
cd backend
pytest
pytest -m unit
pytest -m integration
pytest -m slow
```

### Frontend

```bash
cd frontend
npm test
npm run test:coverage
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:debug
npm run lint
```

### Pre-commit

```bash
pre-commit install
pre-commit run --all-files
```

## Proposer une modification

1. Creez une branche courte et ciblee.
2. Limitez le changement a un seul sujet quand c est possible.
3. Ajoutez ou mettez a jour la documentation quand le comportement visible change.
4. Lancez les tests pertinents pour le backend et ou le frontend.
5. Si la modification touche l API Socket.IO, verifiez aussi le contrat des callbacks et des
   evenements emis.

## Regles de commits et branches

`A confirmer`: aucune convention stricte de nommage de branches ou de commits n est visible dans
le code du depot.

Recommandation pragmatique:

- branches courtes et descriptives;
- commits atomiques;
- message de commit a l imperatif ou au present, de maniere coherente dans la serie.

## Revue de changement

Avant de proposer une PR:

- verifiez que `README.md` et les docs associees restent synchronises avec le code;
- verifiez les routes React si vous ajoutez ou deplacez une page;
- verifiez les handlers Socket.IO si vous ajoutez une nouvelle commande;
- verifiez les migrations Alembic si vous modifiez le schema;
- verifiez les assets statiques si vous ajoutez un nouveau fichier servi par le backend.
