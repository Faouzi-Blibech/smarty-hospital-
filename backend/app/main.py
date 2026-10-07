import socket

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import errors
from app.config import get_settings
from app.db import engine
from app.routers import auth, patients

app = FastAPI(title="Ward API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
errors.install(app)
app.include_router(auth.router)
app.include_router(patients.router)


def _db_ok() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def _mqtt_ok() -> bool:
    s = get_settings()
    try:
        with socket.create_connection((s.mqtt_host, s.mqtt_port), timeout=1):
            return True
    except OSError:
        return False


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "db": _db_ok(), "mqtt": _mqtt_ok()}
