from typing import Dict

from common.logger import logger
from handlers import preferences
from handlers.routing import dispatch_request, handler_registry

SESSIONS: Dict[str, Dict] = {}


def _register_all_handlers():
    preferences.register_handlers(handler_registry)


_register_all_handlers()


def register_socketio_handlers(sio):
    @sio.on("connect")
    async def connect(sid, environ, auth=None):
        xff = environ.get("HTTP_X_FORWARDED_FOR") or environ.get("X-Forwarded-For")
        client_ip = xff.split(",")[0].strip() if xff else environ.get("REMOTE_ADDR")
        logger.info(f"Client {sid} from {client_ip} connected")
        SESSIONS[sid] = environ

    @sio.on("disconnect")
    async def disconnect(sid, environ):
        logger.info(f"Client {sid} disconnected")
        SESSIONS.pop(sid, None)

    @sio.on("data_request")
    async def handle_frontend_data_requests(sid, cmd, data=None):
        logger.debug(f"Received event from: {sid}, with cmd: {cmd}")
        return await dispatch_request(sio, cmd, data, logger, sid, handler_registry)

    @sio.on("data_submission")
    async def handle_frontend_data_submissions(sid, cmd, data=None):
        logger.debug(f"Received event from: {sid}, with cmd: {cmd}, and data: {data}")
        return await dispatch_request(sio, cmd, data, logger, sid, handler_registry)

    return SESSIONS
