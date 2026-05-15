import csv
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from common.logger import logger
from pipeline import telemetry_store
from pipeline.mqtt_telemetry_receiver import (
    get_mqtt_config,
    is_mqtt_enabled,
    start_mqtt_receiver_in_background,
)
from server.telemetry_protobuf import csv_row_to_telemetry_frame, encode_telemetry_batch


@asynccontextmanager
async def lifespan(fastapiapp: FastAPI):
    logger.info("Ground Station startup...")
    start_mqtt_receiver_in_background()
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
        raise HTTPException(status_code=500, detail=str(e))


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


@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    if full_path.startswith(("static/", "assets/", "cesiumStatic/", "favicon.ico")):
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, full_path))
    return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))
