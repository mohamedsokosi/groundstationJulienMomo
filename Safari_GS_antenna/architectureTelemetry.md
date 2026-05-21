# Architecture — Safari GS Antenna / Telemetry Sender

## Overview

`Safari_GS_antenna/telemetrySender` is a Raspberry Pi Pico firmware that replays pre-recorded flight telemetry from the **ICARUS2** high-altitude balloon mission. It wraps each CSV telemetry line in a CFDP (Consultative Committee for Space Data Systems File Delivery Protocol) envelope and streams the data over USB serial to the ground station (Raspberry Pi 4B).

The system acts as a **controlled downlink simulator**: it does not read live sensors. Instead it replays 7,681 records interpolated at 1-second resolution from the ICARUS2 flight on 2025-08-14, providing deterministic test data for ground station receiver development.

---

## Directory Structure

```
Safari_GS_antenna/
├── uart_mqtt_bridge.py         — RPi 4B bridge: USB serial → protobuf → MQTT
└── telemetrySender/
    ├── platformio.ini              — PlatformIO build config (RP2040 / Arduino)
    ├── embed_telemetry_csv.py      — Pre-build: CSV → C header
    ├── src/
    │   ├── main.cpp                — Firmware: CFDP framing + USB/UART transmission
    │   └── telemetry.csv           — Source flight data (7,681 records @ 1 s)
    ├── include/
    │   └── telemetry_csv.h         — Auto-generated: embedded C string array
    ├── lib/                        — (reserved, empty)
    └── test/                       — (reserved, empty)
```

---

## Component Breakdown

### 1. `telemetry.csv` — Source Flight Data

1-second-resolution telemetry interpolated from raw ICARUS2 balloon flight records. 7,681 rows, 19 fields per row:

| Field | Description | Example |
|-------|-------------|---------|
| m-time | Mission timestamp (local) | `8/14/2025 10:15:00` |
| Flight ID | Balloon identifier | `ICARUS2` |
| Ublox UTC | GPS UTC time | `14:15:00` |
| U Lat / U Long | GPS coordinates (°) | `48.56779 / -81.36569` |
| U Alt | GPS altitude (m) | `287.6` → `31653.9` |
| Speed | Horizontal speed (m/s) | — |
| Vert speed | Vertical speed (m/s) | — |
| #Sat | GPS satellite count | — |
| Pressure | Barometric pressure (hPa) | — |
| MIU | Voltage reference (~3.3 V) | — |
| T1–T8 | Temperature sensors (°C) | — |

Flight profile: ground level (287 m) → peak (31 654 m) → descent, over ~2 h 8 min (10:15:00 → 12:23:00 local).

---

### 2. `embed_telemetry_csv.py` — Pre-Build Code Generator

A PlatformIO `pre:` script that runs before compilation.

**What it does:**
1. Reads `src/telemetry.csv` line-by-line.
2. Escapes each line into a C string literal.
3. Writes `include/telemetry_csv.h` containing:
   - `TELEMETRY_LINES[]` — static `const char*` array of all CSV rows.
   - `TELEMETRY_LINE_COUNT` — count of records (7,681).

This embeds the entire dataset in the firmware's read-only flash memory, removing any need for an SD card or external storage.

---

### 3. `main.cpp` — Firmware

Targets the **Raspberry Pi Pico** (RP2040, Arduino framework).

#### Key functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `send_csv_line_as_cfdp(csv_line)` | 15–33 | Wraps one CSV row in a CFDP header and transmits it |
| `send_telemetry_csv()` | 35–40 | Iterates `TELEMETRY_LINES[]`, calls above with 250 ms inter-packet delay |
| `setup()` | 42–54 | Configures GPIO LED, USB serial (debug), and UART serial (transmission) |
| `loop()` | 56–64 | Toggles LED, transmits full CSV, waits 10 s, repeats |

#### CFDP packet structure

Each transmitted line has the format:

```
<version>,<direction>,<mode>,<crc_flag>,<transfer_id>,<spacecraft_id>,<groundstation_id>,<csv_data>\n
```

| Field | Value | Meaning |
|-------|-------|---------|
| version | 1 | CFDP version 1 |
| direction | 0 | Downlink (spacecraft → ground) |
| mode | 0 | Unacknowledged (no ACK required) |
| crc_flag | 1 | CRC enabled |
| transfer_id | 1 | Single transfer session |
| spacecraft_id | 1 | Pico (transmitter) |
| groundstation_id | 2 | Raspberry Pi (receiver) |

#### Serial channels

| Channel | Interface | Baud | Destination |
|---------|-----------|------|-------------|
| `Serial` (USB CDC) | USB cable | 115200 | Raspberry Pi 4B (`/dev/ttyACM0`) |
| `Serial1` (UART) | GPIO 0 TX / GPIO 1 RX | 115200 | (unused in current deployment) |

---

### 4. `uart_mqtt_bridge.py` — RPi 4B Bridge

Runs on the Raspberry Pi 4B. Reads CFDP frames from the Pico over USB serial, strips the 7-field CFDP header, encodes the CSV payload as a protobuf frame, and publishes it to the local MQTT broker.

```
/dev/ttyACM0  →  strip_cfdp()  →  encode_frame()  →  MQTT icarus2/telemetry/frame.pb
```

Protobuf field mapping:

| Protobuf field | CSV column | Type |
|----------------|------------|------|
| 1 sequence_number | (bridge counter) | uint32 |
| 2 mission_time | m-time | string |
| 3 flight_id | Flight ID | string |
| 4 gnss_time_utc | Ublox UTC | string |
| 5 latitude_deg | U Lat | double |
| 6 longitude_deg | U Long | double |
| 7 altitude_m | U Alt | double |
| 8 speed_mps | Speed | double |
| 9 vertical_speed_mps | Vert speed | double |
| 10 satellite_count | #Sat | uint32 |
| 11 pressure_hpa | Pressure | double |
| 12 miu_v | MIU | double |
| 13–20 temperature_N_c | T1–T8 | double |

---

### 5. `platformio.ini` — Build Configuration

```ini
[env:pico]
platform       = raspberrypi
framework      = arduino
board          = pico
monitor_speed  = 115200
monitor_port   = /dev/ttyACM0
extra_scripts  = pre:embed_telemetry_csv.py
```

Flashing is done manually: build with `pio run`, then copy the `.pio/build/pico/firmware.uf2` to the Pico's BOOTSEL mount point (`/run/media/<user>/RPI-RP2/`).

---

## Data Flow

```
telemetry.csv (7,681 rows, 1 s resolution)
      │
      │  (pre-build)
      ▼
embed_telemetry_csv.py  →  telemetry_csv.h  ──┐
                                               │ #include
                                               ▼
                                          main.cpp
                                               │ compile + flash UF2
                                               ▼
                               ┌──────────────────────────┐
                               │   Raspberry Pi Pico       │
                               │   loop():                 │
                               │    for each CSV line      │
                               │     → CFDP-wrap           │
                               │     → Serial USB (ACM0)   │
                               │     → 250 ms delay        │
                               │    wait 10 s, repeat      │
                               └────────────┬─────────────┘
                                            │ USB CDC /dev/ttyACM0
                                            ▼
                               ┌──────────────────────────┐
                               │   Raspberry Pi 4B         │
                               │   uart_mqtt_bridge.py     │
                               │   strip CFDP → protobuf  │
                               └────────────┬─────────────┘
                                            │ MQTT icarus2/telemetry/frame.pb
                                            ▼
                               ┌──────────────────────────┐
                               │   Ground Station          │
                               │   FastAPI + React         │
                               └──────────────────────────┘
```

---

## Timing

| Parameter | Value |
|-----------|-------|
| Inter-packet delay | 250 ms |
| Records per cycle | 7,681 |
| Transmission time per cycle | ~32 min |
| Idle wait after cycle | 10 s |
| Full cycle period | ~32 min 10 s |

---

## Build & Flash Instructions

1. Install [PlatformIO](https://platformio.org/) (VS Code extension or CLI at `~/.platformio/penv/bin/pio`).
2. Open `telemetrySender/` as a PlatformIO project.
3. Build: `~/.platformio/penv/bin/pio run`
4. Put the Pico in bootloader mode (hold BOOTSEL, plug USB) — mounts as `RPI-RP2`.
5. Copy the UF2: `cp .pio/build/pico/firmware.uf2 /run/media/<user>/RPI-RP2/`
6. The Pico reboots automatically and starts transmitting.

---

## Design Notes

**Why embed the CSV in flash?** The Pico has no filesystem by default. Embedding the data as a C array at compile time avoids runtime SD card I/O, keeping the firmware simple and robust.

**Why CFDP?** CFDP is a space-industry standard (CCSDS 727.0-B). Using it here provides a realistic protocol envelope that the ground station receiver is designed to parse, bridging simulation and real mission behaviour.

**Unacknowledged mode:** The firmware transmits without waiting for ACKs. This mirrors a real one-way downlink scenario where the balloon cannot receive ground commands.

**Why USB instead of GPIO UART?** The Pico is physically connected to the Raspberry Pi 4B via USB, which provides both power and a reliable CDC serial interface on `/dev/ttyACM0`. The GPIO UART (Serial1) is wired but not used in the current deployment.

**1-second interpolation:** The original 96 raw records were linearly interpolated to 7,681 rows at 1-second resolution to give smooth real-time display in the ground station charts and globe.
