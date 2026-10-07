import os
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
