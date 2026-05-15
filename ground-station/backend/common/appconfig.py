import json
import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger("app-config")

DEFAULT_APP_CONFIG: Dict[str, Any] = {
    "host": "0.0.0.0",
    "port": 5000,
    "log_level": "INFO",
    "log_config": "logconfig.yaml",
}


def load_app_config(config_path: Path) -> Dict[str, Any]:
    try:
        if config_path.exists():
            with config_path.open("r") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return {**DEFAULT_APP_CONFIG, **{k: v for k, v in data.items() if not k.startswith("_")}}
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with config_path.open("w") as f:
            json.dump(DEFAULT_APP_CONFIG, f, indent=2)
        return dict(DEFAULT_APP_CONFIG)
    except Exception as e:
        logger.warning("Failed to load app config from %s: %s", config_path, e)
        return dict(DEFAULT_APP_CONFIG)
