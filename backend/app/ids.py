"""Prefixed text IDs (`p-0001`, `d-000001`) from one Postgres sequence per prefix (data-model.md)."""

import re

from sqlalchemy import text
from sqlalchemy.orm import Session

_PREFIX = re.compile(r"^[a-z]{1,4}$")


def _seq(db: Session, prefix: str) -> str:
    if not _PREFIX.match(prefix):  # the prefix is interpolated into SQL, so only allow short lowercase tags
        raise ValueError(f"bad id prefix: {prefix!r}")
    seq = f"seq_{prefix}"
    db.execute(text(f"CREATE SEQUENCE IF NOT EXISTS {seq}"))
    return seq


def new_id(db: Session, prefix: str, width: int = 4) -> str:
    n = db.execute(text(f"SELECT nextval('{_seq(db, prefix)}')")).scalar_one()
    return f"{prefix}-{n:0{width}d}"


def reserve_upto(db: Session, prefix: str, n: int) -> None:
    """After inserting explicit IDs up to `n` (the seed), make the next `new_id` return n+1 or more."""
    seq = _seq(db, prefix)
    db.execute(text(f"SELECT setval('{seq}', GREATEST(:n, (SELECT last_value FROM {seq})))"), {"n": n})
