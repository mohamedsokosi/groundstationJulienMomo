import asyncio
import multiprocessing
import os
import signal
import sys
import threading

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn  # noqa: E402

from common.arguments import arguments  # noqa: E402
from common.logger import get_logger_config, logger  # noqa: E402
from handlers.socket import register_socketio_handlers  # noqa: E402
from server.shutdown import cleanup_everything, signal_handler  # noqa: E402
from server.startup import app, init_db, sio, socket_app  # noqa: E402
from server.version import get_version_base  # noqa: E402

try:
    import setproctitle

    HAS_SETPROCTITLE = True
except ImportError:
    HAS_SETPROCTITLE = False


def print_banner():
    version = get_version_base()
    print(f"\n  Ground Station v{version}\n")


def configure_process_names():
    if HAS_SETPROCTITLE:
        setproctitle.setproctitle("Ground Station - Main Thread")
    multiprocessing.current_process().name = "Ground Station - Main"
    threading.current_thread().name = "Ground Station - Main Thread"


def main() -> None:
    print_banner()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    configure_process_names()
    register_socketio_handlers(sio)

    logger.info("Configuring database connection...")
    if arguments.temp_db:
        logger.info(f"Temporary database enabled, using {arguments.db}")
    asyncio.run(init_db())

    logger.info(f"Starting Ground Station server with parameters {arguments}")
    try:
        uvicorn.run(
            socket_app,
            host=arguments.host,
            port=arguments.port,
            log_config=get_logger_config(arguments),
        )
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt in main")
        cleanup_everything()
        os._exit(0)
    except Exception as e:
        logger.error(f"Error starting Ground Station server: {str(e)}")
        logger.exception(e)
        cleanup_everything()
        os._exit(1)


if __name__ == "__main__":
    main()
