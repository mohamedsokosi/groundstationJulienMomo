#!/bin/bash

MQTT=true
SIMULATOR=false
RESTART=false
OFFLINE=false
BACKEND_PORT=5000
FRONTEND_PORT=5173
MQTT_HOST="127.0.0.1"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -Mqtt|-mqtt|--mqtt) MQTT=true ;;
        -Simulator|-simulator|--simulator) SIMULATOR=true ;;
        -Restart|-restart|--restart) RESTART=true ;;
        -Offline|-offline|--offline) OFFLINE=true ;;
        -BackendPort|-backend-port|--backend-port) BACKEND_PORT="$2"; shift ;;
        -FrontendPort|-frontend-port|--frontend-port) FRONTEND_PORT="$2"; shift ;;
        -BrokerHost|-broker-host|--broker-host) MQTT_HOST="$2"; shift ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
    shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

# Load optional local overrides (secrets like SHEETS_WEBAPP_URL) so they don't
# have to be exported by hand each run. This file is git-ignored — keep
# credentials out of the repo. `set -a` exports every assignment it contains.
LOCAL_ENV="$SCRIPT_DIR/local.env"
if [[ -f "$LOCAL_ENV" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$LOCAL_ENV"
    set +a
fi

# -Offline forces the cloud Google Sheet sync off for this run, overriding
# whatever local.env set. The local CSV capture is unaffected.
if $OFFLINE; then
    SHEETS_SYNC_ENABLED=0
fi
# Poetry creates an in-project virtualenv at backend/.venv (virtualenvs.in-project
# = true). Use its interpreter directly — deterministic, and avoids depending on
# `poetry` being on PATH at runtime or a stray VIRTUAL_ENV confusing resolution.
PYTHON_EXE="$BACKEND_DIR/.venv/bin/python"
# Logs live as .txt in a dedicated folder on the Desktop (visible, openable).
# Override with GS_LOG_DIR. Keep in sync with tools/dev/gss.
LOG_DIR="${GS_LOG_DIR:-$HOME/Desktop/ground-station-logs}"
mkdir -p "$LOG_DIR"

if [[ ! -f "$PYTHON_EXE" ]]; then
    echo "Error: Poetry venv not found at $PYTHON_EXE. Run 'poetry install' in $BACKEND_DIR first." >&2
    exit 1
fi

test_port_open() {
    nc -z -w1 "$1" "$2" 2>/dev/null
}

stop_listeners_on_port() {
    local port="$1"
    local pids
    pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
    for pid in $pids; do
        if [[ -n "$pid" ]] && [[ "$pid" != "$$" ]]; then
            echo "Stopping process $pid listening on port $port..."
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
}

launch_in_terminal() {
    local title="$1"
    shift
    local cmd="$*"

    local slug
    slug=$(echo "$title" | tr '[:upper:] ' '[:lower:]-')
    local logfile="$LOG_DIR/$slug.txt"

    # Redirect output to a log file and detach (nohup + disown) so the launched
    # process doesn't spam the interactive terminal and survives this script
    # exiting. Without this, uvicorn/vite logs flood the prompt and it looks
    # like you can't type (you can — the keystrokes are just buried).
    nohup bash -c "$cmd" > "$logfile" 2>&1 &
    local pid=$!
    disown "$pid" 2>/dev/null || true
    echo "Started '$title' (PID $pid)"
}

if $RESTART; then
    stop_listeners_on_port "$BACKEND_PORT"
    stop_listeners_on_port "$FRONTEND_PORT"
    sleep 1
fi

MQTT_READY=false

if $MQTT; then
    if test_port_open "$MQTT_HOST" 1883; then
        MQTT_READY=true
    elif [[ "$MQTT_HOST" == "127.0.0.1" ]] && command -v mosquitto &>/dev/null; then
        launch_in_terminal "MQTT Broker" "mosquitto -v"
        sleep 2
        if test_port_open 127.0.0.1 1883; then
            MQTT_READY=true
        fi
    else
        # External broker — enable MQTT and let the backend's retry loop handle connectivity.
        echo "Warning: $MQTT_HOST:1883 is not reachable right now; backend will retry automatically." >&2
        MQTT_READY=true
    fi

    if ! $MQTT_READY; then
        echo "Warning: MQTT broker not available on $MQTT_HOST:1883. Backend will use CSV fallback." >&2
    fi
fi

MQTT_ENABLED="0"
$MQTT && $MQTT_READY && MQTT_ENABLED="1"

if test_port_open 127.0.0.1 "$BACKEND_PORT"; then
    echo "Warning: Backend port $BACKEND_PORT already in use. Use -Restart to stop it first." >&2
else
    launch_in_terminal "Ground Station Backend" \
        "cd '$BACKEND_DIR' && MQTT_TELEMETRY_ENABLED=$MQTT_ENABLED MQTT_BROKER_HOST=$MQTT_HOST MQTT_BROKER_PORT=1883 SHEETS_SYNC_ENABLED=${SHEETS_SYNC_ENABLED:-0} SHEETS_WEBAPP_URL='${SHEETS_WEBAPP_URL:-}' '$PYTHON_EXE' app.py --host 0.0.0.0 --port $BACKEND_PORT"
fi

if test_port_open 127.0.0.1 "$FRONTEND_PORT"; then
    echo "Warning: Frontend port $FRONTEND_PORT already in use. Use -Restart to stop it first." >&2
else
    launch_in_terminal "Ground Station Frontend" \
        "cd '$FRONTEND_DIR' && GS_BACKEND_HOST=127.0.0.1 GS_BACKEND_PORT=$BACKEND_PORT npm run dev -- --port $FRONTEND_PORT"
fi

if $MQTT && $SIMULATOR; then
    if $MQTT_READY; then
        launch_in_terminal "CubeSat Simulator" \
            "cd '$REPO_ROOT' && '$PYTHON_EXE' tools/simulators/mqtt_cubesat_simulator.py --csv telemetry.csv --broker 127.0.0.1 --delay 0.2"
    else
        echo "Warning: Simulator was requested but not started because MQTT is unavailable." >&2
    fi
fi

echo ""
echo "Local Ground Station started."
echo "Frontend: http://localhost:$FRONTEND_PORT/vueGlobe3d"
echo "Backend:  http://localhost:$BACKEND_PORT"
if $MQTT; then
    echo "MQTT status: http://localhost:$BACKEND_PORT/api/telemetry/mqtt/status"
fi

# Surface ONLY the Vite bootup time line, nothing else.
FRONTEND_LOG="$LOG_DIR/ground-station-frontend.txt"
for _ in $(seq 1 20); do
    vite_ready=$(grep -m1 "ready in" "$FRONTEND_LOG" 2>/dev/null || true)
    [[ -n "$vite_ready" ]] && { echo "$vite_ready"; break; }
    sleep 0.3
done
