"""One-time codes (spec §5 access_codes): `reset` sets a password for one user. There are no enrollment codes since
sign-up v2 (a patient is linked to a record when the account is approved). Only the sha256 is stored; the plain
code is returned once to the issuer."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import AccessCode

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # 31 symbols: no 0/O/1/I/L
LENGTH = 10
LIFETIME = timedelta(hours=48)


def new_code() -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))
    return f"{raw[:5]}-{raw[5:]}"


def normalize(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def code_hash(code: str) -> str:
    return hashlib.sha256(normalize(code).encode()).hexdigest()


def issue(db: Session, purpose: str, *, issued_by: str, user_id: str,
          now: datetime | None = None) -> tuple[str, AccessCode]:
    """New code for one user; the previous unused one for that user stops working."""
    now = now or datetime.now(UTC)
    db.execute(update(AccessCode).where(AccessCode.purpose == purpose, AccessCode.user_id == user_id,
                                        AccessCode.used_at.is_(None), AccessCode.expires_at > now)
               .values(expires_at=now))
    code = new_code()
    row = AccessCode(id=new_id(db, "ac"), purpose=purpose, code_hash=code_hash(code),
                     user_id=user_id, issued_by=issued_by, expires_at=now + LIFETIME)
    db.add(row)
    db.flush()
    return code, row


def find_valid(db: Session, purpose: str, code: str, *, user_id: str,
               now: datetime | None = None) -> AccessCode | None:
    """The unused, unexpired code row of `user_id` (locked until commit), or None."""
    now = now or datetime.now(UTC)
    stmt = select(AccessCode).where(AccessCode.purpose == purpose, AccessCode.code_hash == code_hash(code),
                                    AccessCode.used_at.is_(None), AccessCode.expires_at > now,
                                    AccessCode.user_id == user_id)
    return db.scalar(stmt.with_for_update())


def mark_used(row: AccessCode, *, used_by: str, now: datetime | None = None) -> None:
    row.used_at, row.used_by = now or datetime.now(UTC), used_by
