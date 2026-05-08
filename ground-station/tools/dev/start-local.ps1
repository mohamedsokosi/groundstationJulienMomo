param(
    [switch]$Mqtt,
    [switch]$Simulator,
    [int]$BackendPort = 5000
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

$mqttReady = $false

if ($Mqtt) {
    $mqttIsOpen = Test-PortOpen -HostName "localhost" -Port 1883

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

    $mqttReady = Test-PortOpen -HostName "localhost" -Port 1883
    if (-not $mqttReady) {
        Write-Warning "MQTT broker is not available on localhost:1883. Backend will use CSV fallback."
    }
}

$mqttEnabled = if ($Mqtt -and $mqttReady) { "1" } else { "0" }
$backendCommand = @"
cd "$BackendDir"
`$env:MQTT_TELEMETRY_ENABLED="$mqttEnabled"
`$env:MQTT_BROKER_HOST="localhost"
`$env:MQTT_BROKER_PORT="1883"
& "$PythonExe" app.py --host 0.0.0.0 --port $BackendPort
"@

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-EncodedCommand",
    (ConvertTo-EncodedCommand $backendCommand)
)

$frontendCommand = @"
cd "$FrontendDir"
`$env:GS_BACKEND_HOST="localhost"
`$env:GS_BACKEND_PORT="$BackendPort"
npm run dev
"@

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-EncodedCommand",
    (ConvertTo-EncodedCommand $frontendCommand)
)

if ($Mqtt -and $Simulator -and $mqttReady) {
    $simulatorCommand = @"
cd "$RepoRoot"
& "$PythonExe" tools\simulators\mqtt_cubesat_simulator.py --csv telemetry.csv --broker localhost --delay 0.2 --loop
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
Write-Host "Frontend: http://localhost:5173/vueGlobe3d"
Write-Host "Backend:  http://localhost:$BackendPort"
if ($Mqtt) {
    Write-Host "MQTT status: http://localhost:$BackendPort/api/telemetry/mqtt/status"
}
