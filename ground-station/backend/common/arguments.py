import argparse
import os
from pathlib import Path

from common.appconfig import load_app_config

parser = argparse.ArgumentParser(description="Start the Ground Station server.")
parser.add_argument("--config",    type=str, default=None)
parser.add_argument("--host",      type=str, default=None)
parser.add_argument("--port",      type=int, default=None)
parser.add_argument("--log-level", type=str, default=None,
                    choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])
parser.add_argument("--log-config", type=str, default=None)

_raw = parser.parse_args()

if _raw.config:
    _config_path = Path(_raw.config)
elif Path("data").is_dir():
    _config_path = Path("data/configs/app_config.json")
elif Path("backend/data").is_dir():
    _config_path = Path("backend/data/configs/app_config.json")
else:
    _config_path = Path("data/configs/app_config.json")

_cfg = load_app_config(_config_path)

def _pick(cli, key):
    return cli if cli is not None else _cfg.get(key)

arguments = argparse.Namespace(
    host=_pick(_raw.host, "host"),
    port=_pick(_raw.port, "port"),
    log_level=_pick(_raw.log_level, "log_level"),
    log_config=_pick(_raw.log_config, "log_config"),
)
