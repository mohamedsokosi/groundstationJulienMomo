#!/usr/bin/env python3
import argparse
import csv
import sys
import time
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


def row_to_frame_source(row: dict) -> dict:
    """Rename canonical CSV columns to the snake_case keys the encoder expects."""
    return {CSV_FIELD_ALIASES.get(key, key): value for key, value in row.items()}


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


def publish_rows(client, rows: list[dict], args: argparse.Namespace) -> None:
    sequence_number = 0

    while True:
        for row in rows:
            frame = normalize_telemetry_frame(row_to_frame_source(row), sequence_number=sequence_number)
            payload = encode_telemetry_frame(frame)
            publish_info = client.publish(args.topic, payload=payload, qos=args.qos)
            publish_info.wait_for_publish()

            print(
                "sequence_number={sequence} bytes={size} altitude={altitude:.2f} "
                "speed={speed:.2f} satellite_count={satellites} miu={miu:.3f} "
                "temperatures=[{t1:.2f},{t2:.2f},{t3:.2f},{t4:.2f},"
                "{t5:.2f},{t6:.2f},{t7:.2f},{t8:.2f}]".format(
                    sequence=frame["sequence_number"],
                    size=len(payload),
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

    client = connect_client(args)
    try:
        publish_rows(client, rows, args)
    except KeyboardInterrupt:
        print("\nStopping MQTT CubeSat simulator...")
    finally:
        client.loop_stop()
        client.disconnect()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
