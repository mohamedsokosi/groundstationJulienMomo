# Ground Station - ICARUS2

**Real-time** ground station for tracking the ICARUS2 CubeSat: **MQTT** telemetry
→ **Cesium** 3D globe + charts, archived to **local CSV** and the **cloud**.

> Quick-start manual. For the full documentation (architecture, API, environment
> variables, backup, Docker…) see **[Documentation.md](Documentation.md)**.

---

## Install (once)

```bash
cd backend && poetry install && cd ..        # creates backend/.venv
cd frontend && npm install && cd ..
ln -sf "$PWD/tools/dev/gss" ~/.local/bin/gss  # ~/.local/bin must be on the PATH
```

---

## Start

```bash
gss start            # hardware: the Pi's broker (default 10.180.97.23)
gss start <ip>       # broker on another IP
gss simulation       # WITHOUT hardware: replays the ICARUS2 flight CSV (needs mosquitto)
gss simulation corrupt  # same + injects faults (corrupted/missing/out-of-range frames) to rehearse failures
gss startoffline     # local, no cloud upload
gss kill             # stop everything (from another terminal)
```

Then open **http://localhost:5173**

After `start` / `startoffline` / `simulation`, the terminal **stays attached to the
backend log**: **`Ctrl+C` stops everything** (backend + frontend + simulator). To
return to the prompt immediately while leaving the station running: `GS_FOLLOW=0 gss start`.

---

## See what's happening

```bash
gss verbose          # live backend log (verbose all = + frontend)
gss debug            # recent errors / warnings
```

---

## Quick troubleshooting

- **No telemetry** → broker unreachable; check the Pi's IP (it changes over DHCP)
  with `gss debug`, and that `mosquitto` is listening on `1883`.
- **Black Cesium map** → set `VITE_CESIUM_ION_TOKEN` in `frontend/.env.local`.
- **Stop the station** → after `gss start` / `startoffline` / `simulation`, the
  terminal stays attached to the log: **`Ctrl+C` stops everything**. From another
  terminal (or if launched with `GS_FOLLOW=0`), use `gss kill`.

---

→ **Full documentation: [Documentation.md](Documentation.md)**



So to be clear: in the source code right now nothing GENERATES fictional zones; all
the "zones" are simply in the telemetry CSV that the ground station also receives.
