#!/bin/bash

MQTT=false
SIMULATOR=false
RESTART=false
BACKEND_PORT=5000
FRONTEND_PORT=5173

while [[ $# -gt 0 ]]; do
    case "$1" in
        -Mqtt|-mqtt|--mqtt) MQTT=true ;;
        -Simulator|-simulator|--simulator) SIMULATOR=true ;;
        -Restart|-restart|--restart) RESTART=true ;;
        -BackendPort|-backend-port|--backend-port) BACKEND_PORT="$2"; shift ;;
        -FrontendPort|-frontend-port|--frontend-port) FRONTEND_PORT="$2"; shift ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
    shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
PYTHON_EXE="$BACKEND_DIR/venv/bin/python"

if [[ ! -f "$PYTHON_EXE" ]]; then
    echo "Error: Backend venv not found: $PYTHON_EXE" >&2
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

    mkdir -p "$REPO_ROOT/logs"
    local logfile="$REPO_ROOT/logs/${title// /_}.log"
    bash -c "$cmd" >"$logfile" 2>&1 &
    echo "Started '$title' (PID $!) — logs: $logfile"
}

if $RESTART; then
    stop_listeners_on_port "$BACKEND_PORT"
    stop_listeners_on_port "$FRONTEND_PORT"
    sleep 1
fi

MQTT_READY=false

if $MQTT; then
    if test_port_open 127.0.0.1 1883; then
        MQTT_READY=true
    elif command -v mosquitto &>/dev/null; then
        launch_in_terminal "MQTT Broker" "mosquitto -v"
        sleep 2
        if test_port_open 127.0.0.1 1883; then
            MQTT_READY=true
        fi
    else
        echo "Warning: MQTT requested, but localhost:1883 is closed and mosquitto is not in PATH." >&2
        echo "Install with: sudo apt install mosquitto" >&2
    fi

    if ! $MQTT_READY; then
        echo "Warning: MQTT broker not available on 127.0.0.1:1883. Backend will use CSV fallback." >&2
    fi
fi

MQTT_ENABLED="0"
$MQTT && $MQTT_READY && MQTT_ENABLED="1"

if test_port_open 127.0.0.1 "$BACKEND_PORT"; then
    echo "Warning: Backend port $BACKEND_PORT already in use. Use -Restart to stop it first." >&2
else
    launch_in_terminal "Ground Station Backend" \
        "cd '$BACKEND_DIR' && MQTT_TELEMETRY_ENABLED=$MQTT_ENABLED MQTT_BROKER_HOST=127.0.0.1 MQTT_BROKER_PORT=1883 '$PYTHON_EXE' app.py --host 0.0.0.0 --port $BACKEND_PORT"
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
