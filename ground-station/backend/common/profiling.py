import io
import os
import pstats
import time

PROFILE_ENABLED = os.getenv("PROFILE", "0") == "1"

_boot_profiler = None


def start_boot_profile() -> None:
    """Begin profiling as early as possible so module imports are captured."""
    global _boot_profiler
    if not PROFILE_ENABLED or _boot_profiler is not None:
        return
    import cProfile

    _boot_profiler = cProfile.Profile()
    _boot_profiler.enable()


def stop_boot_profile_and_report(top: int = 20) -> None:
    """Stop the boot profiler and print the slowest functions to the terminal."""
    global _boot_profiler
    if _boot_profiler is None:
        return

    _boot_profiler.disable()
    profiler, _boot_profiler = _boot_profiler, None

    from common.logger import logger

    buffer = io.StringIO()
    stats = pstats.Stats(profiler, stream=buffer).sort_stats("cumulative")
    stats.print_stats(top)
    logger.info(
        "[PERF] Boot profile (top %d by cumulative time)\n%s",
        top,
        buffer.getvalue(),
    )


def install_request_timing(app) -> None:
    """Log the wall-clock duration of every HTTP request to the terminal."""
    if not PROFILE_ENABLED:
        return

    from common.logger import logger

    @app.middleware("http")
    async def _timing_middleware(request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        logger.info(
            "[PERF] %s %s %.2fms",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        return response
