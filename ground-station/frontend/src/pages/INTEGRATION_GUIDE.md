# Guide d'Intégration - Onglet Personnaliser

## Architecture

```
customize/
├── telemetry-dashboard.jsx           # Page principale [Point d'entrée]
├── telemetry-slice.jsx               # Redux store pour télémétrie
├── telemetry-components.jsx          # Composants réutilisables basiques
├── advanced-telemetry-widgets.jsx    # Composants avancés (Jauges, Tableaux)
└── README.md                         # Documentation
```

## Flux de Données

```
[CSV File] 
    ↓
[parseCSV()] 
    ↓
[chartData State]
    ↓
[Redux: setTelemetryData()]
    ↓
[Tous les composants reçoivent les données]
```

## Comment Réutiliser les Composants Existants

### 1. Ajouter les Jauges Avancées dans le Dashboard

```jsx
import { TelemetryGauges, TelemetryDataTable } from './advanced-telemetry-widgets.jsx';

// Dans le JSX du dashboard, après les graphiques:
<Grid item xs={12} lg={6}>
    <TelemetryGauges data={chartData} />
</Grid>

<Grid item xs={12}>
    <TelemetryDataTable data={chartData} maxRows={30} />
</Grid>
```

### 2. Intégrer dans la Page Overview

```jsx
// Dans overview/main-layout.jsx ou autre page
import { ChartCard, StatisticCard, TelemetrySummary } from '../customize/telemetry-components.jsx';

// Utiliser dans la grille existante
<ChartCard title="Altitude">
    <YourChart />
</ChartCard>
```

### 3. Accéder aux Données Redux

```jsx
import { useSelector, useDispatch } from 'react-redux';
import { setTelemetryData } from './telemetry-slice.jsx';

function MyComponent() {
    const dispatch = useDispatch();
    const telemetryData = useSelector(state => state.telemetry.telemetryData);
    
    // Mettre à jour les données
    dispatch(setTelemetryData(parsedData));
    
    return <div>{telemetryData.length} points</div>;
}
```

## Exemples d'Utilisation

### Exemple 1: Afficher une Statistique Simple

```jsx
import { StatisticCard } from './telemetry-components.jsx';
import HeightIcon from '@mui/icons-material/Height';

<StatisticCard
    label="Altitude Maximale"
    value="31,653 m"
    color="#4CAF50"
    icon={HeightIcon}
/>
```

### Exemple 2: Créer une Page avec Graphiques Recharts

```jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartCard } from './telemetry-components.jsx';

<ChartCard title="Altitude vs Temps">
    <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="Time Index" />
            <YAxis />
            <Line type="monotone" dataKey="U Alt" stroke="#81c784" />
        </LineChart>
    </ResponsiveContainer>
</ChartCard>
```

### Exemple 3: Utiliser les Jauges MUI

```jsx
import { TelemetryGauges } from './advanced-telemetry-widgets.jsx';

<Grid item xs={12}>
    <TelemetryGauges data={chartData} />
</Grid>
```

### Exemple 4: Afficher un Tableau de Données

```jsx
import { TelemetryDataTable } from './advanced-telemetry-widgets.jsx';

<Grid item xs={12}>
    <TelemetryDataTable data={chartData} maxRows={50} />
</Grid>
```

## Composants Disponibles par Module

### `telemetry-components.jsx` (Basiques)
- `StatisticCard` - Affiche une statistique
- `ChartCard` - Wrapper pour graphiques
- `TelemetrySummary` - Résumé de 5 statistiques clés

### `advanced-telemetry-widgets.jsx` (Avancés)
- `TelemetryGauges` - Jauges avec MUI X-Charts
- `TelemetryDataTable` - Tableau des derniers points

### `telemetry-dashboard.jsx` (Page Complète)
- Tous les graphiques Recharts
- Cartographie Leaflet
- Intégration complète

## Configuration Redux

Pour ajouter le slice au store, modifiez `store.jsx` :

```jsx
import telemetryReducer from '../customize/telemetry-slice.jsx';

const store = configureStore({
    reducer: {
        // ... autres reducers
        telemetry: telemetryReducer,
    },
});
```

## Importer le Réducteur dans le Store

```jsx
import telemetryReducer from '../customize/telemetry-slice.jsx';

// Dans configureStore
redurcers: {
    // ... autres reducers
    telemetry: telemetryReducer,
}
```

## Notes Importantes

1. **Recharts** : Bibliothèque définie dans package.json. Installer avec `npm install recharts`

2. **Leaflet** : Déjà disponible dans le projet

3. **MUI X-Charts** : Déjà disponible (jauges, graphiques)

4. **Theming** : Tous les composants respectent le thème clair/sombre

5. **Responsive** : Tous les graphiques s'adaptent à la taille de l'écran

## Bonnes Pratiques

✅ **À faire** :
- Utiliser les composants réutilisables
- Respecter le thème du projet
- Valider les données entrantes
- Utiliser Redux pour l'état global

❌ **À éviter** :
- Dupliquer le code de parsing CSV
- Créer de nouveaux styles plutôt que réutiliser Material-UI
- Ignorer la validation des données nulles
- Hardcoder les couleurs

## Débogage

### Vérifier si les données sont chargées

```jsx
console.log('Datos telemetría:', chartData);
console.log('Premiers points:', chartData.slice(0, 5));
console.log('Derniers points:', chartData.slice(-5));
```

### Vérifier le Redux

```jsx
import { useSelector } from 'react-redux';

function DebugComponent() {
    const telemetry = useSelector(state => state.telemetry);
    console.log('Redux Telemetry:', telemetry);
    return null;
}
```

---

**Version**: 1.0  
**Date**: 2025-03-06  
**Maintenir par**: Ground Station Team
