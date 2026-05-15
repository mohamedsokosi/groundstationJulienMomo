import logging

from .arguments import arguments


def get_logger(args):
    logging.basicConfig(
        level=args.log_level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    return logging.getLogger("ground-station")


logger = get_logger(arguments)
