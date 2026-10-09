import asyncio
import socket
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import errors
from app.ai import laya_intent
from app.config import get_settings
from app.db import engine
from app.iot import publisher
from app.routers import ai, alerts, appointments, auth, devices, doses, exams, integrations, patients, prescriptions, staff
from app.ws import relay
from app.ws import router as ws_router
from app.ws.hub import hub



@asynccontextmanager
async def lifespan(_: FastAPI):
    hub.loop = asyncio.get_running_loop()
    client = relay.start()
    publisher.use(client)  # publish on the client that connected at startup
    # Laya takes ~50 s to load: warm it in the background so the API answers at once (rules/model until then)
    threading.Thread(target=laya_intent.preload, daemon=True).start()
    yield
    client.loop_stop()
    client.disconnect()


app = FastAPI(title="Ward API", version="0.1.0", lifespan=lifespan)

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
app.include_router(alerts.router)
app.include_router(prescriptions.router)
app.include_router(devices.router)
app.include_router(doses.router)
app.include_router(staff.router)
app.include_router(appointments.router)
app.include_router(integrations.router)
app.include_router(ai.router)
app.include_router(exams.router)
app.include_router(ws_router.router)


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
