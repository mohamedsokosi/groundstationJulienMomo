from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Union


@dataclass
class HandlerRoute:
    handler: Callable
    event_type: str


class HandlerRegistry:
    def __init__(self):
        self._routes: Dict[str, HandlerRoute] = {}

    def register(self, command: str, handler: Callable, event_type: str):
        self._routes[command] = HandlerRoute(handler, event_type)

    def register_batch(self, routes: Dict[str, tuple]):
        for cmd, (handler, event_type) in routes.items():
            self.register(cmd, handler, event_type)

    def get_handler(self, command: str) -> Optional[HandlerRoute]:
        return self._routes.get(command)


handler_registry = HandlerRegistry()


async def dispatch_request(
    sio: Any,
    cmd: str,
    data: Optional[Dict],
    logger: Any,
    sid: str,
    registry: HandlerRegistry,
) -> Dict[str, Union[bool, None, dict, list, str]]:
    route = registry.get_handler(cmd)
    if not route:
        logger.error(f"Unknown command: {cmd}")
        return {"success": False, "error": f"Unknown command: {cmd}"}
    try:
        return await route.handler(sio, data, logger, sid)
    except Exception as e:
        logger.error(f"Error handling command '{cmd}': {str(e)}")
        logger.exception(e)
        return {"success": False, "error": str(e)}
