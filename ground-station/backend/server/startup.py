import asyncio
import concurrent.futures
import csv
import os
from contextlib import asynccontextmanager
from pathlib import Path

import socketio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from common.logger import logger
from db import AsyncSessionLocal, engine, run_migrations  # noqa: F401
from pipeline import telemetry_store
from pipeline.mqtt_telemetry_receiver import (
    get_mqtt_config,
    is_mqtt_enabled,
    start_mqtt_receiver_in_background,
)
from server.telemetry_protobuf import csv_row_to_telemetry_frame, encode_telemetry_batch
from server.version import get_full_version_info, get_update_check


@asynccontextmanager
async def lifespan(fastapiapp: FastAPI):
    logger.info("FastAPI lifespan startup...")
    start_mqtt_receiver_in_background()
    try:
        yield
    finally:
        logger.info("FastAPI lifespan cleanup...")


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True,
    binary=True,
    max_http_buffer_size=10 * 1024 * 1024,
)

app = FastAPI(
    lifespan=lifespan,
    title="Ground Station API",
    description="API for satellite tracking and telemetry",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/api/version")
async def get_version():
    try:
        return get_full_version_info()
    except Exception as e:
        logger.error(f"Error retrieving version information: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve version information: {str(e)}")


@app.get("/api/update-check")
async def update_check():
    try:
        return get_update_check()
    except Exception as e:
        logger.error(f"Error retrieving update information: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve update information: {str(e)}")


TELEMETRY_PROTOBUF_MEDIA_TYPE = "application/x-protobuf"
TELEMETRY_PROTOBUF_SCHEMA = "groundstation.telemetry.v1.TelemetryBatch"


def _get_telemetry_csv_path() -> Path:
    return Path(__file__).parent.parent.parent / "telemetry.csv"


def _read_telemetry_csv_frames(csv_path: Path) -> list[dict]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return [
            csv_row_to_telemetry_frame(row, sequence_number=i)
            for i, row in enumerate(reader)
        ]


@app.get("/api/telemetry.csv")
async def get_telemetry_csv():
    try:
        csv_path = _get_telemetry_csv_path()
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="Telemetry file not found")
        return FileResponse(
            csv_path,
            media_type="text/csv",
            filename="telemetry.csv",
            headers={"Cache-Control": "no-store"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving telemetry file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to serve telemetry file: {str(e)}")


@app.get("/api/telemetry.pb")
async def get_telemetry_protobuf():
    try:
        if telemetry_store.has_frames():
            frames = telemetry_store.get_frames()
        else:
            csv_path = _get_telemetry_csv_path()
            if not csv_path.exists():
                raise HTTPException(status_code=404, detail="Telemetry file not found")
            frames = _read_telemetry_csv_frames(csv_path)

        return Response(
            content=encode_telemetry_batch(frames),
            media_type=TELEMETRY_PROTOBUF_MEDIA_TYPE,
            headers={
                "Cache-Control": "no-store",
                "X-Protobuf-Schema": TELEMETRY_PROTOBUF_SCHEMA,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving telemetry protobuf: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to serve telemetry protobuf: {str(e)}")


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
    return {
        "cleared": True,
        "stored_frames": telemetry_store.get_count(),
    }


@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    if full_path.startswith(("static/", "assets/", "cesiumStatic/", "favicon.ico")):
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, full_path))
    return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))


async def init_db():
    logger.info("Initializing database...")

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for directory in [
        os.path.join(backend_dir, "data", "db"),
        os.path.join(backend_dir, "data", "configs"),
    ]:
        os.makedirs(directory, exist_ok=True)

    try:
        loop = asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as executor:
            await loop.run_in_executor(executor, run_migrations)
    except Exception as e:
        logger.error(f"Error running database migrations: {e}")
        raise

    logger.info("Database initialized")
