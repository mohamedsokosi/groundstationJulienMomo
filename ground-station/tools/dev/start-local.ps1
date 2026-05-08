param(
    [switch]$Mqtt,
    [switch]$Simulator,
    [switch]$Restart,
    [int]$BackendPort = 5000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "Backend venv not found: $PythonExe"
}

function Test-PortOpen {
    param([string]$HostName, [int]$Port)

    try {
        $result = Test-NetConnection $HostName -Port $Port -WarningAction SilentlyContinue
        return [bool]$result.TcpTestSucceeded
    } catch {
        return $false
    }
}

function ConvertTo-EncodedCommand {
    param([string]$Command)

    return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
}

function Stop-ListenersOnPort {
    param([int]$Port)

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $processIds) {
        if ($processId -and $processId -ne $PID) {
            Write-Host "Stopping process $processId listening on port $Port..."
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($Restart) {
    Stop-ListenersOnPort -Port $BackendPort
    Stop-ListenersOnPort -Port $FrontendPort
    Start-Sleep -Seconds 1
}

$mqttReady = $false

if ($Mqtt) {
    $mqttIsOpen = Test-PortOpen -HostName "127.0.0.1" -Port 1883

    if (-not $mqttIsOpen) {
        $mosquitto = Get-Command mosquitto -ErrorAction SilentlyContinue

        if ($mosquitto) {
            Start-Process powershell -ArgumentList @(
                "-NoExit",
                "-Command",
                "mosquitto -v"
            )
            Start-Sleep -Seconds 2
        } else {
            Write-Warning "MQTT requested, but localhost:1883 is closed and mosquitto.exe is not in PATH."
            Write-Warning "Install/start Mosquitto locally, or run without -Mqtt to use CSV fallback."
        }
    }

    $mqttReady = Test-PortOpen -HostName "127.0.0.1" -Port 1883
    if (-not $mqttReady) {
        Write-Warning "MQTT broker is not available on localhost:1883. Backend will use CSV fallback."
    }
}

$mqttEnabled = if ($Mqtt -and $mqttReady) { "1" } else { "0" }
$backendIsOpen = Test-PortOpen -HostName "127.0.0.1" -Port $BackendPort
$frontendIsOpen = Test-PortOpen -HostName "127.0.0.1" -Port $FrontendPort

if ($backendIsOpen) {
    Write-Warning "Backend port $BackendPort is already in use. Use -Restart to stop the old backend first."
} else {
$backendCommand = @"
cd "$BackendDir"
`$env:MQTT_TELEMETRY_ENABLED="$mqttEnabled"
`$env:MQTT_BROKER_HOST="127.0.0.1"
`$env:MQTT_BROKER_PORT="1883"
& "$PythonExe" app.py --host 0.0.0.0 --port $BackendPort
"@

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-EncodedCommand",
        (ConvertTo-EncodedCommand $backendCommand)
    )
}

if ($frontendIsOpen) {
    Write-Warning "Frontend port $FrontendPort is already in use. Use -Restart to stop the old frontend first."
} else {
$frontendCommand = @"
cd "$FrontendDir"
`$env:GS_BACKEND_HOST="127.0.0.1"
`$env:GS_BACKEND_PORT="$BackendPort"
npm run dev -- --port $FrontendPort
"@

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-EncodedCommand",
        (ConvertTo-EncodedCommand $frontendCommand)
    )
}

if ($Mqtt -and $Simulator -and $mqttReady) {
    $simulatorCommand = @"
cd "$RepoRoot"
& "$PythonExe" tools\simulators\mqtt_cubesat_simulator.py --csv telemetry.csv --broker 127.0.0.1 --delay 0.2 --loop
"@

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-EncodedCommand",
        (ConvertTo-EncodedCommand $simulatorCommand)
    )
} elseif ($Mqtt -and $Simulator) {
    Write-Warning "Simulator was requested, but it was not started because MQTT is unavailable."
}

Write-Host "Local Ground Station started."
Write-Host "Frontend: http://localhost:$FrontendPort/vueGlobe3d"
Write-Host "Backend:  http://localhost:$BackendPort"
if ($Mqtt) {
    Write-Host "MQTT status: http://localhost:$BackendPort/api/telemetry/mqtt/status"
}
