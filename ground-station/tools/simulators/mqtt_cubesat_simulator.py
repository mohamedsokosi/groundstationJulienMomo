#!/usr/bin/env python3
import argparse
import csv
import math
import random
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from server.telemetry_protobuf import encode_telemetry_frame, normalize_telemetry_frame  # noqa: E402

DEFAULT_TOPIC = "icarus2/telemetry/frame.pb"

# Canonical ICARUS2 recording headers (telemetrySender/src/telemetry.csv, i.e.
# telemetry_csv_logger.CSV_HEADER) -> normalized snake_case keys understood by
# normalize_telemetry_frame(). read_csv_rows() strips surrounding whitespace from
# the headers, so match the trimmed text here (e.g. "Ublox UTC", not " Ublox UTC").
CSV_FIELD_ALIASES = {
    "m-time": "mission_time",
    "Flight ID": "flight_id",
    "Ublox UTC": "gnss_time_utc",
    "U Lat": "latitude_deg",
    "U Long": "longitude_deg",
    "U Alt": "altitude_m",
    "Speed": "speed_mps",
    "Vert speed": "vertical_speed_mps",
    "#Sat": "satellite_count",
    "Pressure": "pressure_hpa",
    "MIU": "miu_v",
    "T1": "temperature_1_c",
    "T2": "temperature_2_c",
    "T3": "temperature_3_c",
    "T4": "temperature_4_c",
    "T5": "temperature_5_c",
    "T6": "temperature_6_c",
    "T7": "temperature_7_c",
    "T8": "temperature_8_c",
}


# The flight CSV now carries baked fire zones (tools/simulators/generate_fire_zones.py):
# map their columns to the encoder keys so they flow through unchanged. No runtime
# generation — the ground station simply draws the GeoJSON it receives.
CSV_FIELD_ALIASES.update({
    "Fire Level": "fire_zone_level",
    "Fire GeoJSON": "fire_zone_geojson",
})


def row_to_frame_source(row: dict) -> dict:
    """Rename canonical CSV columns to the snake_case keys the encoder expects."""
    return {CSV_FIELD_ALIASES.get(key, key): value for key, value in row.items()}


# ---------------------------------------------------------------------------
# Fault injection (--faults / `gss simulation corrupt`)
#
# Deliberately mangles the outgoing MQTT stream so the ground station's failure
# handling can be exercised without hardware: corrupted / truncated / missing /
# duplicated / out-of-range frames, on a fixed cadence. Each injection prints a
# banner with WHAT was sent and what the station is EXPECTED to do, so the
# operator can tick off reactions against the frontend + `gss debug`.
# ---------------------------------------------------------------------------

# Cycle order for `--faults all`: decode failures first, then the outage, then
# the semantic (silently-wrong) cases.
FAULT_TYPES = (
    "corrupt",      # random bit flips in the encoded payload
    "truncate",     # payload cut mid-message
    "garbage",      # random bytes, not protobuf at all
    "empty",        # 0-byte payload (decodes to an all-defaults frame)
    "drop",         # ~4.5 s of silence -> outage watchdogs (3 s) must fire
    "duplicate",    # same frame published twice (QoS-1 redelivery)
    "outoforder",   # two consecutive frames swapped
    "outofrange",   # decodes fine but physically wrong (GPS 0,0, temp -999...)
    "badgeojson",   # fire-zone GeoJSON invalid / wrong type / huge
)

# Seconds of silence for the `drop` fault - comfortably past the 3 s
# MQTT_FRAME_TIMEOUT_SEC watchdog on both backend and frontend.
DROP_SILENCE_SEC = 4.5


def parse_fault_names(spec: str) -> list[str]:
    names = [name.strip().lower() for name in spec.split(",") if name.strip()]
    if "all" in names:
        return list(FAULT_TYPES)
    unknown = [name for name in names if name not in FAULT_TYPES]
    if unknown:
        raise SystemExit(
            f"Unknown fault type(s): {', '.join(unknown)}. "
            f"Valid: {', '.join(FAULT_TYPES)}, all"
        )
    return names


def _shift_datetime(value: str, hours: float) -> tuple[str, bool]:
    """Shift an m-time string ('8/14/2025 10:15:00') by N hours; (value, ok)."""
    for fmt in ("%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(value, fmt)
        except ValueError:
            continue
        return (parsed + timedelta(hours=hours)).strftime(fmt), True
    return value, False


class FaultInjector:
    """Injects one fault every `fault_every` frames, cycling through `faults`.

    Seeded RNG -> a given run is reproducible (same faults, same bytes flipped).
    `process(frame)` returns the list of payloads to publish for that frame:
    usually one, two for duplicate/out-of-order, none while dropping.
    """

    def __init__(self, faults: list[str], fault_every: int, seed: int, delay: float):
        self.faults = faults
        self.fault_every = max(1, fault_every)
        self.delay = max(delay, 1e-6)
        self.random = random.Random(seed)
        self.slot = 0            # frames seen (published or not)
        self.fault_index = 0     # position in the fault cycle
        self.fault_count = 0     # banners printed
        self.drop_remaining = 0  # frames left to silence for `drop`
        self.held_payload = None  # older frame held back for `outoforder`
        self.out_of_range_index = 0
        self.bad_geojson_index = 0

    def describe(self) -> str:
        cycle_sec = self.fault_every * self.delay
        return (
            "FAULT INJECTION ENABLED\n"
            f"  faults : {', '.join(self.faults)}\n"
            f"  cadence: 1 fault every {self.fault_every} frames"
            f" (~{cycle_sec:.1f}s at {self.delay}s/frame)\n"
            "  banners below say what was injected and how the station should react"
        )

    def process(self, frame: dict) -> list[bytes]:
        slot = self.slot
        self.slot += 1

        if self.drop_remaining > 0:
            self.drop_remaining -= 1
            print(
                f"  ... frame seq={frame['sequence_number']} dropped"
                f" ({self.drop_remaining} more to drop)",
                flush=True,
            )
            return []

        # Release the frame held for the out-of-order swap: newer one first,
        # then the older held one.
        if self.held_payload is not None:
            held, self.held_payload = self.held_payload, None
            return [encode_telemetry_frame(frame), held]

        if slot == 0 or slot % self.fault_every:
            return [encode_telemetry_frame(frame)]

        name = self.faults[self.fault_index % len(self.faults)]
        self.fault_index += 1
        return self._inject(name, frame)

    def flush(self) -> list[bytes]:
        """Payload still held when the replay ends (out-of-order on last row)."""
        held, self.held_payload = self.held_payload, None
        return [held] if held is not None else []

    def _banner(self, name: str, seq: int, detail: str, expect: str) -> None:
        self.fault_count += 1
        line = "=" * 62
        print(
            f"\n{line}\nFAULT #{self.fault_count} [{name}] at frame seq={seq}\n"
            f"  action: {detail}\n  expect: {expect}\n{line}",
            flush=True,
        )

    def _inject(self, name: str, frame: dict) -> list[bytes]:
        seq = frame["sequence_number"]

        if name == "drop":
            count = max(1, math.ceil(DROP_SILENCE_SEC / self.delay))
            self.drop_remaining = count - 1
            self._banner(
                name, seq,
                f"dropping {count} consecutive frames (~{count * self.delay:.1f}s of silence)",
                "gap > 3s -> backend [RPI_DISCONNECTED] (gss debug) + red ghost line "
                "on the charts, then [TELEMETRY_RESUMED] when frames return",
            )
            return []

        if name == "outoforder":
            self.held_payload = encode_telemetry_frame(frame)
            self._banner(
                name, seq,
                f"holding seq={seq}; the NEXT frame will be published first",
                "a newer frame arrives before an older one - X axis must not zigzag",
            )
            return []

        if name == "duplicate":
            payload = encode_telemetry_frame(frame)
            self._banner(
                name, seq,
                "publishing the exact same frame twice (QoS-1 redelivery)",
                "charts / local CSV / Google Sheet should not double-count the frame",
            )
            return [payload, payload]

        if name == "corrupt":
            payload = bytearray(encode_telemetry_frame(frame))
            flips = self.random.randint(1, 3)
            for _ in range(flips):
                index = self.random.randrange(len(payload))
                payload[index] ^= 1 << self.random.randrange(8)
            self._banner(
                name, seq,
                f"flipped {flips} random bit(s) in the {len(payload)}-byte payload",
                "backend logs 'Failed to decode...' OR the frame decodes with silently "
                "wrong values - check the charts for a spike",
            )
            return [bytes(payload)]

        if name == "truncate":
            payload = encode_telemetry_frame(frame)
            cut = self.random.randint(len(payload) // 4, (3 * len(payload)) // 4)
            self._banner(
                name, seq,
                f"payload cut to {cut}/{len(payload)} bytes",
                "backend logs 'Failed to decode MQTT telemetry payload' and skips the "
                "frame - the station must keep running",
            )
            return [payload[:cut]]

        if name == "garbage":
            size = self.random.randint(40, 120)
            payload = self.random.randbytes(size)
            self._banner(
                name, seq,
                f"published {size} random bytes instead of a protobuf frame",
                "backend logs 'Failed to decode...' (or decodes junk) - no crash, the "
                "next real frame displays normally",
            )
            return [payload]

        if name == "empty":
            self._banner(
                name, seq,
                "published a 0-byte payload",
                "decodes to an all-defaults frame (GPS 0,0, empty mission_time) - "
                "globe and charts must not break",
            )
            return [b""]

        if name == "outofrange":
            detail, expect = self._mutate_out_of_range(frame)
            self._banner(name, seq, detail, expect)
            return [encode_telemetry_frame(frame)]

        if name == "badgeojson":
            detail, expect = self._mutate_bad_geojson(frame)
            self._banner(name, seq, detail, expect)
            return [encode_telemetry_frame(frame)]

        return [encode_telemetry_frame(frame)]  # unknown name - defensive

    # Semantic faults: the frame decodes FINE but the values are physically
    # wrong. Often more dangerous than corruption because nothing errors.
    _OUT_OF_RANGE_CASES = (
        "gps_zero", "gps_jump", "alt_negative", "alt_absurd",
        "temp_sentinel", "quat_zero", "pressure_zero", "time_backward",
    )

    def _mutate_out_of_range(self, frame: dict) -> tuple[str, str]:
        case = self._OUT_OF_RANGE_CASES[self.out_of_range_index % len(self._OUT_OF_RANGE_CASES)]
        self.out_of_range_index += 1

        if case == "gps_zero":
            frame["latitude_deg"] = 0.0
            frame["longitude_deg"] = 0.0
            frame["satellite_count"] = 0
            return ("GPS fix lost: lat=0 lon=0 #Sat=0",
                    "globe must NOT teleport to (0,0) off Africa; errors terminal "
                    "should flag the GPS / satellite count")
        if case == "gps_jump":
            frame["latitude_deg"] = frame["latitude_deg"] + 40.0
            frame["longitude_deg"] = frame["longitude_deg"] + 90.0
            return ("single-frame GPS glitch: position teleported ~5000 km",
                    "trajectory should not draw a line across the planet")
        if case == "alt_negative":
            frame["altitude_m"] = -500.0
            return ("altitude = -500 m",
                    "ALTITUDE card + charts show the bad value without breaking axes")
        if case == "alt_absurd":
            frame["altitude_m"] = 99999.0
            return ("altitude = 99999 m (~100 km, absurd for a balloon)",
                    "charts / follow-camera must survive the spike")
        if case == "temp_sentinel":
            for i in range(1, 9):
                frame[f"temperature_{i}_c"] = -999.0
            return ("all 8 temperatures = -999 (sensor sentinel)",
                    "the All Temp chart axis must stay readable after the spike")
        if case == "quat_zero":
            for axis in ("w", "x", "y", "z"):
                frame[f"quaternion_{axis}"] = 0.0
            return ("invalid IMU quaternion (all components 0, norm 0)",
                    "the 3D attitude cube must not disappear / NaN out")
        if case == "pressure_zero":
            frame["pressure_hpa"] = 0.0
            return ("pressure = 0 hPa",
                    "PRESSURE card shows 0; errors terminal may flag missing pressure")
        # time_backward - the Pico CSV-loop boundary, ~2 h jump back.
        shifted, ok = _shift_datetime(frame["mission_time"], hours=-2)
        if ok:
            frame["mission_time"] = shifted
            return ("mission_time jumped 2 h BACKWARD (Pico CSV-loop boundary)",
                    "X axis must not zigzag live; keepMonotonicSuffix trims on refresh")
        return ("mission_time format not recognized - frame sent unchanged",
                "nothing (mutation skipped)")

    _BAD_GEOJSON_CASES = ("not_json", "wrong_type", "huge")

    def _mutate_bad_geojson(self, frame: dict) -> tuple[str, str]:
        case = self._BAD_GEOJSON_CASES[self.bad_geojson_index % len(self._BAD_GEOJSON_CASES)]
        self.bad_geojson_index += 1
        frame["fire_zone_level"] = 3

        if case == "not_json":
            frame["fire_zone_geojson"] = '{"type":"Polygon","coordinates":[[['
            return ("fire zone level=3 with TRUNCATED (unparseable) GeoJSON",
                    "Cesium must not crash; the zone is silently skipped")
        if case == "wrong_type":
            frame["fire_zone_geojson"] = '{"type":"Point","coordinates":[-81.35,48.55]}'
            return ("fire zone level=3 with a Point instead of a Polygon",
                    "fireGeojsonPositions must reject it; no polygon drawn, no crash")
        # huge - a REALISTIC-SIZE polygon (real zones span ~0.01-0.03 deg) padded
        # to ~200 KB: the stress here is the PAYLOAD SIZE (pipeline, sessionStorage,
        # CSV/Sheet columns), not the zone geometry - a giant polygon would just be
        # (correctly) rejected by the ground station's plausibility caps.
        pad = "x" * 200_000
        frame["fire_zone_geojson"] = (
            '{"type":"Polygon","coordinates":[[[-81.355,48.548],[-81.345,48.548],'
            '[-81.345,48.556],[-81.355,48.556],[-81.355,48.548]]],"pad":"' + pad + '"}'
        )
        return ("fire zone with a ~200 KB GeoJSON payload (normal-size polygon)",
                "pipeline + sessionStorage + CSV/Sheet must absorb the oversized frame; "
                "the zone itself draws at normal size")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish CubeSat telemetry.csv rows as binary protobuf MQTT frames."
    )
    parser.add_argument("--csv", default="telemetry.csv", help="CSV file path.")
    parser.add_argument("--broker", default="localhost", help="MQTT broker host.")
    parser.add_argument("--port", default=1883, type=int, help="MQTT broker port.")
    parser.add_argument("--topic", default=DEFAULT_TOPIC, help="MQTT topic.")
    parser.add_argument("--delay", default=0.2, type=float, help="Delay between frames in seconds.")
    parser.add_argument("--loop", action="store_true", help="Replay the CSV continuously.")
    parser.add_argument("--qos", default=1, type=int, choices=(0, 1, 2), help="MQTT QoS level.")
    parser.add_argument(
        "--faults",
        default="",
        help="Comma-separated fault types to inject, or 'all'. Empty = no injection. "
             f"Types: {', '.join(FAULT_TYPES)}.",
    )
    parser.add_argument(
        "--fault-every", default=50, type=int,
        help="Inject one fault every N frames (default 50).",
    )
    parser.add_argument(
        "--fault-seed", default=42, type=int,
        help="RNG seed so a fault run is reproducible (default 42).",
    )
    return parser.parse_args()


def read_csv_rows(csv_path: Path) -> list[dict]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return [
            {
                key.strip(): (value.strip() if isinstance(value, str) else value)
                for key, value in row.items()
                if key
            }
            for row in reader
        ]


def connect_client(args: argparse.Namespace):
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        print("paho-mqtt is required. Install it with: pip install paho-mqtt", file=sys.stderr)
        raise SystemExit(1)

    def on_connect(client, userdata, flags, reason_code, properties):
        is_success = reason_code == 0 or getattr(reason_code, "value", None) == 0
        if is_success or str(reason_code).lower() == "success":
            print(f"Connected to MQTT broker {args.broker}:{args.port}")
        else:
            print(f"MQTT connection returned: {reason_code}", file=sys.stderr)

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    try:
        client.connect(args.broker, args.port, keepalive=60)
    except OSError as exc:
        print(
            f"Cannot connect to MQTT broker {args.broker}:{args.port}: {exc}",
            file=sys.stderr,
        )
        print(
            "Start a local Mosquitto broker first, or run the app without MQTT.",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc
    client.loop_start()
    return client


def publish_rows(
    client, rows: list[dict], args: argparse.Namespace, injector: "FaultInjector | None" = None
) -> None:
    sequence_number = 0
    zones_seen = 0

    while True:
        for row in rows:
            frame = normalize_telemetry_frame(row_to_frame_source(row), sequence_number=sequence_number)
            # Fire zones are baked into the CSV — just report the ones we replay.
            if frame["fire_zone_level"] and frame["fire_zone_geojson"]:
                zones_seen += 1
                print(f"  FIRE ZONE #{zones_seen} (depuis le CSV) level={frame['fire_zone_level']}")

            # With fault injection the frame may become 0, 1 or 2 payloads
            # (dropped / normal or mangled / duplicated + out-of-order pair).
            if injector is None:
                payloads = [encode_telemetry_frame(frame)]
            else:
                payloads = injector.process(frame)
            for payload in payloads:
                publish_info = client.publish(args.topic, payload=payload, qos=args.qos)
                publish_info.wait_for_publish()

            if payloads:
                print(
                    "sequence_number={sequence} bytes={size} altitude={altitude:.2f} "
                    "speed={speed:.2f} satellite_count={satellites} miu={miu:.3f} "
                    "temperatures=[{t1:.2f},{t2:.2f},{t3:.2f},{t4:.2f},"
                    "{t5:.2f},{t6:.2f},{t7:.2f},{t8:.2f}]".format(
                        sequence=frame["sequence_number"],
                        size=len(payloads[0]),
                        altitude=frame["altitude_m"],
                        speed=frame["speed_mps"],
                        satellites=frame["satellite_count"],
                        miu=frame["miu_v"],
                        t1=frame["temperature_1_c"],
                        t2=frame["temperature_2_c"],
                        t3=frame["temperature_3_c"],
                        t4=frame["temperature_4_c"],
                        t5=frame["temperature_5_c"],
                        t6=frame["temperature_6_c"],
                        t7=frame["temperature_7_c"],
                        t8=frame["temperature_8_c"],
                    )
                )

            sequence_number += 1
            time.sleep(max(0.0, args.delay))

        if not args.loop:
            break

    # Don't strand a frame held for the out-of-order swap on the last row.
    if injector is not None:
        for payload in injector.flush():
            client.publish(args.topic, payload=payload, qos=args.qos).wait_for_publish()


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.is_absolute():
        csv_path = REPO_ROOT / csv_path

    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}", file=sys.stderr)
        return 1

    rows = read_csv_rows(csv_path)
    if not rows:
        print(f"No telemetry rows found in {csv_path}", file=sys.stderr)
        return 1

    injector = None
    if args.faults.strip():
        injector = FaultInjector(
            parse_fault_names(args.faults), args.fault_every, args.fault_seed, args.delay
        )
        print(injector.describe(), flush=True)

    client = connect_client(args)
    try:
        publish_rows(client, rows, args, injector)
    except KeyboardInterrupt:
        print("\nStopping MQTT CubeSat simulator...")
    finally:
        client.loop_stop()
        client.disconnect()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
