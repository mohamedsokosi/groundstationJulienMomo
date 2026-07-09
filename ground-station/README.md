# Ground Station — ICARUS2

Station sol **temps réel** pour le suivi du CubeSat ICARUS2 : télémétrie **MQTT**
→ globe 3D **Cesium** + graphes, archivée en **CSV local** et dans le **cloud**.

> Manuel de démarrage rapide. Pour la documentation complète (architecture,
> API, variables d'environnement, sauvegarde, Docker…) voir
> **[Documentation.md](Documentation.md)**.

---

## Installer (une seule fois)

```bash
cd backend && poetry install && cd ..        # crée backend/.venv
cd frontend && npm install && cd ..
ln -sf "$PWD/tools/dev/gss" ~/.local/bin/gss  # ~/.local/bin doit être dans le PATH
```

---

## Démarrer

```bash
gss start            # matériel : broker du Pi (défaut 10.180.97.23)
gss start <ip>       # broker sur une autre IP
gss simulation       # SANS matériel : rejoue le CSV de vol ICARUS2 (nécessite mosquitto)
gss startoffline     # local, sans upload cloud
gss kill             # tout arrêter (depuis un autre terminal)
```

Puis ouvrir **http://localhost:5173**

Après `start` / `startoffline` / `simulation`, le terminal **reste attaché au log
backend** : **`Ctrl+C` arrête tout** (backend + frontend + simulateur). Pour rendre
la main tout de suite en laissant la station tourner : `GS_FOLLOW=0 gss start`.

---

## Voir ce qui se passe

```bash
gss verbose          # log backend en direct (verbose all = + frontend)
gss debug            # erreurs / warnings récents
```

---

## Dépannage express

- **Pas de télémétrie** → broker injoignable ; vérifier l'IP du Pi (elle change
  en DHCP) avec `gss debug`, et que `mosquitto` écoute sur `1883`.
- **Carte Cesium noire** → renseigner `VITE_CESIUM_ION_TOKEN` dans
  `frontend/.env.local`.
- **Arrêter la station** → après `gss start` / `startoffline` / `simulation`, le
  terminal reste attaché au log : **`Ctrl+C` arrête tout**. Depuis un autre
  terminal (ou si lancé avec `GS_FOLLOW=0`), utiliser `gss kill`.

---

→ **Documentation complète : [Documentation.md](Documentation.md)**



donc on s<entend bien que dans le code source presentement rien ne GENERE des zones fictives, toutes les "zones" dont simplement dans la telemetry csv que la groundstation recoit aussi
