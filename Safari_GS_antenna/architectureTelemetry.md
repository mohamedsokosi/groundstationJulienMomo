# Architecture — Safari GS Antenna / Telemetry Sender

## Overview

`Safari_GS_antenna/telemetrySender` is a Raspberry Pi Pico firmware that replays pre-recorded flight telemetry from the **ICARUS2** high-altitude balloon mission. It wraps each CSV telemetry line in a CFDP (Consultative Committee for Space Data Systems File Delivery Protocol) envelope and streams the data over UART to the ground station (Raspberry Pi).

The system acts as a **controlled downlink simulator**: it does not read live sensors. Instead it replays 96 real records captured during the ICARUS2 flight on 2025-08-14, providing deterministic test data for ground station receiver development.

---

## Directory Structure

```
Safari_GS_antenna/
└── telemetrySender/
    ├── platformio.ini              — PlatformIO build config (RP2040 / Arduino)
    ├── embed_telemetry_csv.py      — Pre-build: CSV → C header
    ├── src/
    │   ├── main.cpp                — Firmware: CFDP framing + UART transmission
    │   └── telemetry.csv           — Source flight data (96 records)
    ├── include/
    │   └── telemetry_csv.h         — Auto-generated: embedded C string array
    ├── lib/                        — (reserved, empty)
    ├── test/                       — (reserved, empty)
    └── .vscode/
        └── extensions.json         — Recommended IDE extensions
```

---

## Component Breakdown

### 1. `telemetry.csv` — Source Flight Data

Raw telemetry recorded during the ICARUS2 balloon flight. 96 rows, 19 fields per row:

| Field | Description | Example |
|-------|-------------|---------|
| m-time | Mission timestamp | `8/14/2025 10:15` |
| Flight ID | Balloon identifier | `ICARUS2` |
| Ublox UTC | GPS UTC time | `09:15:32` |
| U Lat / U Long | GPS coordinates (°) | `45.12345 / 6.78901` |
| U Alt | GPS altitude (m) | `287.6` → `31653.9` |
| Speed | Horizontal speed (m/s) | — |
| Vert speed | Vertical speed (m/s) | — |
| #Sat | GPS satellite count | — |
| Pressure | Barometric pressure (hPa) | — |
| MIU | Voltage reference (~3.3 V) | — |
| T1–T8 | Temperature sensors (°C) | — |

Flight profile: ground level (287 m) → peak (31 654 m) → descent, over ~2 h 8 min.

---

### 2. `embed_telemetry_csv.py` — Pre-Build Code Generator

A PlatformIO `pre:` script that runs before compilation.

**What it does:**
1. Reads `src/telemetry.csv` line-by-line.
2. Escapes each line into a C string literal.
3. Writes `include/telemetry_csv.h` containing:
   - `TELEMETRY_LINES[]` — static `const char*` array of all CSV rows.
   - `TELEMETRY_LINE_COUNT` — count of records (96).

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

| Channel | Pin | Baud | Destination |
|---------|-----|------|-------------|
| `Serial` (USB) | — | 115200 | PC debug monitor |
| `Serial1` (UART) | GPIO 0 (TX) / GPIO 1 (RX) | 115200 | Raspberry Pi ground station |

---

### 4. `platformio.ini` — Build Configuration

```ini
[env:pico]
platform       = raspberrypi
framework      = arduino
board          = pico
monitor_speed  = 115200
monitor_port   = COM5           ; USB debug (Windows)
upload_port    = E:             ; UF2 bootloader mount point (Windows)
extra_scripts  = pre:embed_telemetry_csv.py
```

---

## Data Flow

```
telemetry.csv
      │
      │  (pre-build)
      ▼
embed_telemetry_csv.py
      │
      │  generates
      ▼
telemetry_csv.h  ──────────────────────────────┐
                                               │ #include
                                               ▼
                                          main.cpp
                                               │
                                         compile + flash
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │  Raspberry Pi Pico   │
                                    │  (firmware running)  │
                                    │                      │
                                    │  loop():             │
                                    │   for each CSV line  │
                                    │    → CFDP-wrap       │
                                    │    → Serial1 (UART)  │
                                    │    → 250 ms delay    │
                                    │   wait 10 s, repeat  │
                                    └──────────────────────┘
                                               │
                           ┌───────────────────┴────────────────────┐
                           ▼                                         ▼
                    USB Serial (Serial)                    UART GPIO 0/1 (Serial1)
                           │                                         │
                           ▼                                         ▼
                     PC debug monitor                      Raspberry Pi
                                                           Ground Station
```

---

## Timing

| Parameter | Value |
|-----------|-------|
| Inter-packet delay | 250 ms |
| Records per cycle | 96 |
| Transmission time per cycle | ~24 s |
| Idle wait after cycle | 10 s |
| Full cycle period | ~34 s |

---

## Build & Flash Instructions

1. Install [PlatformIO](https://platformio.org/).
2. Open `telemetrySender/` as a PlatformIO project.
3. Put the Pico in bootloader mode (hold BOOTSEL, plug USB) — mounts as drive `E:`.
4. Run `pio run --target upload`. The pre-build script runs automatically.
5. Open the serial monitor at 115200 baud on `COM5` to observe debug output.

---

## Design Notes

**Why embed the CSV in flash?** The Pico has no filesystem by default. Embedding the data as a C array at compile time avoids runtime SD card I/O, keeping the firmware simple and robust.

**Why CFDP?** CFDP is a space-industry standard (CCSDS 727.0-B). Using it here provides a realistic protocol envelope that the ground station receiver is designed to parse, bridging simulation and real mission behaviour.

**Unacknowledged mode:** The firmware transmits without waiting for ACKs. This mirrors a real one-way downlink scenario where the balloon cannot receive ground commands.

**Replay design:** Because data is pre-recorded, the system is deterministic and safe for integration testing — the same 96 packets are sent every ~34 seconds, allowing the ground station team to validate parsing, display, and logging independently of live hardware.
