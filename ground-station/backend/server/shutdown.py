import os

from common.logger import logger


def cleanup_everything():
    logger.info("Cleanup complete")


def signal_handler(signum, frame):
    logger.info(f"Received signal {signum}, initiating shutdown...")
    cleanup_everything()
    os._exit(0)
