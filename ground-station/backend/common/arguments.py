import argparse

parser = argparse.ArgumentParser(description="Start the Ground Station server.")
parser.add_argument("--host",      type=str, default="0.0.0.0")
parser.add_argument("--port",      type=int, default=5000)
parser.add_argument("--log-level", type=str, default="INFO",
                    choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])

_raw = parser.parse_args()

arguments = argparse.Namespace(
    host=_raw.host,
    port=_raw.port,
    log_level=_raw.log_level,
)
