# Onglet Personnaliser - Tableau de Bord de Télémétrie

## Vue d'ensemble

L'onglet **Personnaliser** permet de visualiser et d'analyser les données de télémétrie du CubeSat. Il offre plusieurs graphiques interactifs et une cartographie de la trajectoire du satellite.

## Fonctionnalités

### 📊 Graphiques Disponibles

1. **Cartographie de Trajectoire** 🗺️
   - Affiche la trajectoire GPS du satellite sur une carte interactive
   - Marque le point de départ (vert) et d'arrivée (rouge)
   - Utilise OpenStreetMap pour la couche cartographique
   - Zoom et pan disponibles

2. **Altitude vs Temps** 📈
   - Graphique en aires montrant l'évolution de l'altitude
   - Utile pour analyser le profil de vol du satellite
   - Code couleur vert dégradé

3. **Vitesse vs Temps** ⚡
   - Affiche deux courbes :
     - Vitesse horizontale (ligne continue)
     - Vitesse verticale (ligne pointillée)
   - Permet de comparer les deux types de vitesse

4. **Pression vs Altitude** 💨
   - Diagramme de dispersion montrant la relation pression/altitude
   - Chaque point représente une mesure
   - Utile pour valider les capteurs

5. **Satellites Visibles vs Temps** 🛰️
   - Nombre de satellites GPS détectés au fil du temps
   - Indicateur de la qualité du signal

### 📈 Statistiques

Affichage en temps réel des statistiques clés :
- Altitude maximale atteinte
- Vitesse maximale
- Pression minimale
- Nombre moyen de satellites GPS
- Total de points de données

## Utilisation

### Chargement Automatique
Les données sont automatiquement chargées depuis le fichier `/public/telemetry.csv` s'il existe.

### Upload Manuel
Cliquez sur le bouton **"Charger un fichier CSV"** pour importer vos propres données.

### Format de Fichier CSV Requis

```csv
m-time,Flight ID, Ublox UTC,U Lat,U Long,U Alt,Speed,Vert speed,#Sat,Pressure
8/14/2025 10:15,ICARUS2 ,8/14/2025 14:14,48.56779,-81.36569,287.6,0.06,0.07,12,985.29
...
```

**Colonnes requises :**
- `U Lat` : Latitude (degrés)
- `U Long` : Longitude (degrés)
- `U Alt` : Altitude (mètres)
- `Speed` : Vitesse (m/s)
- `Vert speed` : Vitesse verticale (m/s)
- `Pressure` : Pression atmosphérique (hPa)
- `#Sat` : Nombre de satellites GPS

## Composants Réutilisables

### `StatisticCard`
Affiche une statistique avec label, valeur et couleur.

```jsx
import { StatisticCard } from './telemetry-components.jsx';

<StatisticCard 
    label="Altitude Max"
    value="31650 m"
    color="#4CAF50"
/>
```

### `ChartCard`
Enveloppe pour afficher un graphique avec titre.

```jsx
import { ChartCard } from './telemetry-components.jsx';

<ChartCard title="Mon Graphique">
    <YourChartComponent />
</ChartCard>
```

### `TelemetrySummary`
Affiche un résumé visual des statistiques clés.

```jsx
import { TelemetrySummary } from './telemetry-components.jsx';

<TelemetrySummary data={parsedData} />
```

## Intégration avec Redux

Un slice Redux `telemetrySlice` est disponible pour stocker les données de télémétrie globalement :

```jsx
import { setTelemetryData, setLoading } from './telemetry-slice.jsx';

dispatch(setLoading(true));
dispatch(setTelemetryData(parsed data));
```

## Fichiers Principaux

```
frontend/src/components/customize/
├── telemetry-dashboard.jsx      # Page principale
├── telemetry-slice.jsx           # Store Redux
├── telemetry-components.jsx      # Composants réutilisables
└── README.md                      # Cette documentation
```

## Dépendances Externes

- `recharts` : Bibliothèque de graphiques réactifs
- `react-leaflet` : Intégration Leaflet pour les cartes
- `leaflet` : Bibliothèque cartographique

## Personnalisation

### Modifier les Couleurs

Les couleurs sont définies en haut du composant `telemetryDashboard.jsx` :

```javascript
const altitudeColor = isDark ? '#81c784' : '#388e3c';
const speedColor = isDark ? '#ffb74d' : '#f57c00';
```

### Ajouter Nouveaux Graphiques

1. Créer un nouveau composant graphique utilisant `recharts`
2. Importer dans `telemetry-dashboard.jsx`
3. Ajouter une Grid item avec le nouveau graphique

```jsx
<Grid item xs={12} md={6}>
    <ChartCard title="Nouveau Graphique">
        <ResponsiveContainer width="100%" height={400}>
            {/* Votre graphique recharts */}
        </ResponsiveContainer>
    </ChartCard>
</Grid>
```

## Notes Techniques

- L'interface s'adapte automatiquement au mode clair/sombre
- Les graphiques sont entièrement réactifs et responsive
- Les données sont parsées et validées au chargement
- Les points de données invalides sont filtrés automatiquement

---

**Licence :** GNU General Public License v3.0
