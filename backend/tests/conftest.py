import os

os.environ.setdefault("BCRYPT_ROUNDS", "4")  # fast hashes in tests; must be set before settings load
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (registers models on Base.metadata)
from app.db import Base

DB_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://ward:ward@localhost:5432/ward")


@pytest.fixture(scope="session")
def engine():
    schema = f"test_{uuid.uuid4().hex[:8]}"
    admin = create_engine(DB_URL)
    with admin.begin() as c:
        c.execute(text(f"CREATE SCHEMA {schema}"))
    eng = create_engine(DB_URL, connect_args={"options": f"-csearch_path={schema},public"})
    # checkfirst=False: the migrated tables in `public` are visible through search_path and would be skipped
    Base.metadata.create_all(eng, checkfirst=False)
    yield eng
    eng.dispose()
    with admin.begin() as c:
        c.execute(text(f"DROP SCHEMA {schema} CASCADE"))
    admin.dispose()


@pytest.fixture()
def db(engine):
    conn = engine.connect()
    tx = conn.begin()
    s = sessionmaker(bind=conn, join_transaction_mode="create_savepoint")()
    yield s
    s.close()
    tx.rollback()
    conn.close()


@pytest.fixture()
def seeded(db):
    from app.seed import seed

    seed(db)
    return db


@pytest.fixture()
def client(db, seeded):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def emitted(monkeypatch):
    """Every n8n event a test triggers, as (event, data); nothing leaves the process."""
    from app.integrations import n8n

    events: list[tuple[str, dict]] = []
    monkeypatch.setattr(n8n, "emit", lambda event, data: events.append((event, data)))
    return events


class _FakeMqtt:
    def __init__(self):
        self.sent: list[tuple[str, dict, int, bool]] = []

    def publish(self, topic, payload, qos=0, retain=False):
        import json

        self.sent.append((topic, json.loads(payload), qos, retain))


@pytest.fixture(autouse=True)
def published(monkeypatch):
    """Everything published to MQTT in a test, as (topic, payload, qos, retain); no broker needed."""
    from app.iot import publisher

    fake = _FakeMqtt()
    monkeypatch.setattr(publisher, "_client", fake)
    return fake.sent


@pytest.fixture(autouse=True)
def no_llm(monkeypatch):
    """Tests never call a real LLM, whatever .env says (LLM_PROVIDER=groq on a dev laptop)."""
    from app.config import get_settings

    monkeypatch.setenv("LLM_PROVIDER", "none")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
