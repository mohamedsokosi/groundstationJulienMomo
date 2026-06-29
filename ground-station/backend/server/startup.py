import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from common.logger import logger
from common.profiling import install_request_timing, stop_boot_profile_and_report
from pipeline import bridge_log_store, telemetry_store
from pipeline.mqtt_telemetry_receiver import (
    get_mqtt_config,
    is_mqtt_enabled,
    start_mqtt_receiver_in_background,
)
from server.telemetry_protobuf import encode_telemetry_batch


@asynccontextmanager
async def lifespan(fastapiapp: FastAPI):
    logger.info("Ground Station startup...")
    start_mqtt_receiver_in_background()
    stop_boot_profile_and_report()
    try:
        yield
    finally:
        logger.info("Ground Station shutdown...")


app = FastAPI(
    lifespan=lifespan,
    title="Ground Station API",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

install_request_timing(app)

_HERE = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST_DIR = os.environ.get(
    "STATIC_FILES_DIR",
    os.path.normpath(os.path.join(_HERE, "..", "..", "frontend", "dist")),
)

app.mount(
    "/cesiumStatic",
    StaticFiles(
        directory=os.path.join(FRONTEND_DIST_DIR, "cesiumStatic"),
        html=False,
        check_dir=False,
    ),
    name="cesiumStatic",
)

TELEMETRY_PROTOBUF_MEDIA_TYPE = "application/x-protobuf"
TELEMETRY_PROTOBUF_SCHEMA = "groundstation.telemetry.v1.TelemetryBatch"


@app.get("/api/telemetry/mqtt/frames")
async def get_mqtt_only_frames():
    """Returns only MQTT-received frames as protobuf. Empty batch if no MQTT data yet."""
    try:
        frames = telemetry_store.get_frames()
        return Response(
            content=encode_telemetry_batch(frames),
            media_type=TELEMETRY_PROTOBUF_MEDIA_TYPE,
            headers={
                "Cache-Control": "no-store",
                "X-Protobuf-Schema": TELEMETRY_PROTOBUF_SCHEMA,
            },
        )
    except Exception as e:
        logger.error(f"Error serving MQTT frames: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/telemetry/mqtt/status")
async def get_telemetry_mqtt_status():
    config = get_mqtt_config()
    stored_frames = telemetry_store.get_count()
    return {
        "enabled": is_mqtt_enabled(),
        "broker_host": config["broker_host"],
        "broker_port": config["broker_port"],
        "topic": config["topic"],
        "stored_frames": stored_frames,
        "using_mqtt_store": stored_frames > 0,
    }


@app.post("/api/telemetry/mqtt/clear")
async def clear_telemetry_mqtt_store():
    telemetry_store.clear_frames()
    return {"cleared": True, "stored_frames": telemetry_store.get_count()}


@app.get("/api/bridge/logs")
async def get_bridge_logs(after: int = 0):
    """Error/warning lines forwarded by the Pi bridge over MQTT. The frontend
    errors terminal polls this with the last seen id to fetch only new lines."""
    return {"logs": bridge_log_store.get_logs(after)}


@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    if full_path.startswith(("static/", "assets/", "cesiumStatic/", "favicon.ico")):
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, full_path))
    return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))
