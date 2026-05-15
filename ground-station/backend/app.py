import os
import signal
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn  # noqa: E402

from common.arguments import arguments  # noqa: E402
from common.logger import get_logger_config, logger  # noqa: E402
from server.startup import app  # noqa: E402


def main() -> None:
    signal.signal(signal.SIGINT,  lambda *_: os._exit(0))
    signal.signal(signal.SIGTERM, lambda *_: os._exit(0))

    logger.info(f"Starting Ground Station on {arguments.host}:{arguments.port}")
    try:
        uvicorn.run(
            app,
            host=arguments.host,
            port=arguments.port,
            log_config=get_logger_config(arguments),
        )
    except KeyboardInterrupt:
        os._exit(0)


if __name__ == "__main__":
    main()
