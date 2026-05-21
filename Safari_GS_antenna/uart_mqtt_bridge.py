import serial
import paho.mqtt.client as mqtt
import struct
import time

SERIAL_PORT = "/dev/ttyACM0"   # Pico USB CDC
BAUD_RATE = 115200

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "icarus2/telemetry/frame.pb"

# ── Protobuf helpers ──────────────────────────────────────────────────────────

def _enc_varint(v):
    v = max(0, min(int(v), 0xFFFFFFFF))
    out = bytearray()
    while v > 0x7F:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v)
    return bytes(out)

def _enc_key(field, wire):
    return _enc_varint((field << 3) | wire)

def _enc_uint32(field, v):
    return _enc_key(field, 0) + _enc_varint(v)

def _enc_double(field, v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        f = 0.0
    return _enc_key(field, 1) + struct.pack("<d", f)

def _enc_string(field, s):
    b = str(s).strip().encode("utf-8")
    if not b:
        return b""
    return _enc_key(field, 2) + _enc_varint(len(b)) + b

# ── Frame encoder ─────────────────────────────────────────────────────────────
# CSV columns (after CFDP strip):
#  0 m-time   1 Flight_ID  2 Ublox_UTC  3 Lat    4 Long    5 U_Alt
#  6 Speed    7 Vert_speed 8 #_Sat      9 Pressure  10 MIU
#  11 T1 … 18 T8

def encode_frame(csv_line, seq):
    parts = [p.strip() for p in csv_line.split(",")]
    if len(parts) < 11:
        return None
    out = bytearray()
    out += _enc_uint32(1,  seq)
    out += _enc_string(2,  parts[0])           # mission_time
    out += _enc_string(3,  parts[1])           # flight_id
    out += _enc_string(4,  parts[2])           # gnss_time_utc
    out += _enc_double(5,  parts[3])           # latitude_deg
    out += _enc_double(6,  parts[4])           # longitude_deg
    out += _enc_double(7,  parts[5])           # altitude_m
    out += _enc_double(8,  parts[6])           # speed_mps
    out += _enc_double(9,  parts[7])           # vertical_speed_mps
    out += _enc_uint32(10, int(float(parts[8])) if parts[8] else 0)  # satellite_count
    out += _enc_double(11, parts[9])           # pressure_hpa
    out += _enc_double(12, parts[10])          # miu_v
    for t in range(min(8, len(parts) - 11)):
        out += _enc_double(13 + t, parts[11 + t])  # temperature_1_c … temperature_8_c
    return bytes(out)

# ── CFDP strip ────────────────────────────────────────────────────────────────
# Format: 1,0,0,1,1,1,2,<csv_payload>
# Split at most 7 commas → parts[7] is the full CSV payload.

def strip_cfdp(line):
    parts = line.split(",", 7)
    if len(parts) < 8:
        return None
    return parts[7]

def is_valid_cfdp_line(line):
    return bool(line) and line[0].isdigit() and line.isprintable()

# ── MQTT client ───────────────────────────────────────────────────────────────

client = mqtt.Client()
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_start()

print(f"Bridge started — UART={SERIAL_PORT}  topic={MQTT_TOPIC}")

seq = 0

while True:
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
            print("Serial port open")
            while True:
                raw = ser.readline().decode(errors="ignore").strip()
                if not raw:
                    continue
                if not is_valid_cfdp_line(raw):
                    continue
                if raw.startswith("m-time"):   # header row
                    continue

                payload = strip_cfdp(raw)
                if not payload:
                    continue

                pb = encode_frame(payload, seq)
                if pb is None:
                    print(f"Skipped (too few fields): {payload[:60]}")
                    continue

                client.publish(MQTT_TOPIC, pb)
                seq += 1
                print(f"#{seq} {payload}")

    except serial.SerialException as e:
        print(f"Serial error: {e} — reconnecting in 3s")
        time.sleep(3)
