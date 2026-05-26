import math
import os
import serial
import socket
import struct
import threading
import time
import paho.mqtt.client as mqtt

SERIAL_PORT = "/dev/ttyACM0"   # Pico USB CDC
BAUD_RATE = 115200

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "icarus2/telemetry/frame.pb"

# ── Antenna-pointing TCP broadcaster ──────────────────────────────────────────
# Another device on the LAN switch (e.g. antenna tracker) connects to this
# TCP port and receives one `azimuth_deg,elevation_deg\n` line per telemetry
# frame. Azimuth: 0–360, north=0, east=90. Elevation: -90–+90, horizon=0.
# Both are computed from the ground-station position (constants below) and the
# balloon's GPS fix in each frame.
TCP_HOST = "0.0.0.0"  # listen on all interfaces (LAN + loopback)
TCP_PORT = int(os.environ.get("AZEL_TCP_PORT", "9000"))
GS_LAT_DEG = float(os.environ.get("GS_LAT_DEG", "48.55"))     # ICARUS2 launch site
GS_LON_DEG = float(os.environ.get("GS_LON_DEG", "-81.35"))
GS_ALT_M   = float(os.environ.get("GS_ALT_M",   "287.0"))     # ground elevation
EARTH_R_M = 6_371_000.0

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

# ── Azimuth / elevation computation ───────────────────────────────────────────

def _to_ecef(lat_deg, lon_deg, alt_m):
    """Spherical-Earth ECEF — accurate enough for antenna pointing at HAB
    ranges (<200 km). Drop the WGS84 ellipsoid for simplicity."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    r = EARTH_R_M + alt_m
    return (
        r * math.cos(lat) * math.cos(lon),
        r * math.cos(lat) * math.sin(lon),
        r * math.sin(lat),
    )

def az_el_from_gs(lat_deg, lon_deg, alt_m):
    """Returns (azimuth_deg, elevation_deg) from GS to (lat, lon, alt)."""
    gx, gy, gz = _to_ecef(GS_LAT_DEG, GS_LON_DEG, GS_ALT_M)
    bx, by, bz = _to_ecef(lat_deg, lon_deg, alt_m)
    dx, dy, dz = bx - gx, by - gy, bz - gz
    # ECEF → ENU at GS
    lat = math.radians(GS_LAT_DEG)
    lon = math.radians(GS_LON_DEG)
    sl, cl = math.sin(lat), math.cos(lat)
    so, co = math.sin(lon), math.cos(lon)
    e = -so * dx + co * dy
    n = -sl * co * dx - sl * so * dy + cl * dz
    u =  cl * co * dx + cl * so * dy + sl * dz
    horiz = math.hypot(e, n)
    az = math.degrees(math.atan2(e, n)) % 360.0
    el = math.degrees(math.atan2(u, horiz))
    return az, el

# ── TCP broadcaster ───────────────────────────────────────────────────────────

_tcp_clients = []           # list of (socket, addr_str)
_tcp_lock = threading.Lock()

def _serve_tcp():
    """Background thread: accepts incoming TCP clients and adds them to the
    broadcast list. Each client receives one az,el line per telemetry frame
    until it disconnects."""
    while True:
        try:
            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            srv.bind((TCP_HOST, TCP_PORT))
            srv.listen(8)
            print(f"TCP az/el server listening on {TCP_HOST}:{TCP_PORT}")
            while True:
                conn, addr = srv.accept()
                # Disable Nagle so each broadcast goes out promptly.
                conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                addr_str = f"{addr[0]}:{addr[1]}"
                with _tcp_lock:
                    _tcp_clients.append((conn, addr_str))
                print(f"TCP client connected: {addr_str}  ({len(_tcp_clients)} total)")
        except OSError as e:
            print(f"TCP server error: {e} — restarting in 3s")
            time.sleep(3)

def broadcast_az_el(az_deg, el_deg):
    """Send `az,el\\n` (ASCII, 3 decimals) to every connected TCP client.
    Drops any client whose socket has died — never blocks the bridge."""
    line = f"AZ:{az_deg:.2f},EL:{el_deg:.2f}\n".encode("ascii")
    dead = []
    with _tcp_lock:
        for entry in _tcp_clients:
            conn, addr_str = entry
            try:
                conn.sendall(line)
            except (BrokenPipeError, ConnectionResetError, OSError):
                dead.append(entry)
        for entry in dead:
            conn, addr_str = entry
            try:
                conn.close()
            except OSError:
                pass
            _tcp_clients.remove(entry)
            print(f"TCP client disconnected: {addr_str}  ({len(_tcp_clients)} remaining)")

threading.Thread(target=_serve_tcp, name="tcp-azel-server", daemon=True).start()

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

                # After a Pico reset (USB/RFD900x unplug → reconnect) the firmware
                # replays its CSV from line 1, which is the header row
                # `m-time,Flight ID,Ublox UTC,U Lat,U Long,U Alt,Speed,Vert speed,#Sat,...`.
                # The raw-line check above doesn't catch it because raw starts
                # with the CFDP prefix `1,0,0,1,1,1,2,...`. The header has to be
                # filtered after CFDP strip.
                if payload.startswith("m-time"):
                    continue

                try:
                    pb = encode_frame(payload, seq)
                    if pb is None:
                        print(f"Skipped (too few fields): {payload[:60]}")
                        continue
                    client.publish(MQTT_TOPIC, pb)
                except (ValueError, TypeError, struct.error) as e:
                    # Defensive: any other malformed/partial frame (truncated
                    # serial buffer mid-transmission, non-numeric where a number
                    # is expected, etc.) is logged and skipped so a single bad
                    # line never kills the bridge — the reconnect loop only
                    # catches serial-level errors, not parsing crashes.
                    print(f"Skipped (parse error: {e}): {payload[:60]}")
                    continue

                # Broadcast az/el to TCP clients (antenna trackers on the LAN
                # switch). Parsing failures here only skip THIS frame — they
                # never abort the bridge or the MQTT publish above.
                try:
                    fields = [p.strip() for p in payload.split(",")]
                    lat = float(fields[3]); lon = float(fields[4]); alt = float(fields[5])
                    az, el = az_el_from_gs(lat, lon, alt)
                    broadcast_az_el(az, el)
                except (ValueError, IndexError):
                    pass

                seq += 1
                print(f"#{seq} {payload}")

    except serial.SerialException as e:
        print(f"Serial error: {e} — reconnecting in 3s")
        time.sleep(3)
