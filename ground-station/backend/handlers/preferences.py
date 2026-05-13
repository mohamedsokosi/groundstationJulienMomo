from typing import Any, Dict, Optional, Union

from crud.preferences import fetch_all_preferences, set_preferences
from db import AsyncSessionLocal


async def fetch_preferences(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    async with AsyncSessionLocal() as dbsession:
        logger.debug("Fetching preferences")
        result = await fetch_all_preferences(dbsession)
        return {"success": result["success"], "data": result.get("data", [])}


async def update_preferences(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list, str]]:
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Updating preferences, data: {data}")
        if not data:
            return {"success": False, "data": [], "error": "No data provided"}

        result = await set_preferences(dbsession, list(data))
        return {"success": result["success"], "data": result.get("data", [])}


def register_handlers(registry):
    registry.register_batch(
        {
            "fetch-preferences": (fetch_preferences, "data_request"),
            "update-preferences": (update_preferences, "data_submission"),
        }
    )
