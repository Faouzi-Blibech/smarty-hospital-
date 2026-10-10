from datetime import UTC, datetime, timedelta
from functools import lru_cache

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.ratelimit import LOGIN_LIMITS, check, client_ip, record
from app.auth.security import create_token, hash_password, verify_password
from app.db import get_db
from app.errors import ApiError
from app.models import User
from app.schemas import LoginIn, LoginOut, LoginUser, Me
from app.services.audit import audit

router = APIRouter(tags=["auth"])


MAX_FAILED = 5
LOCK_FOR = timedelta(minutes=15)
_INACTIVE = {"pending": ("account_pending", "your account is waiting for approval"),
             "disabled": ("account_disabled", "this account is disabled; contact the hospital"),
             "rejected": ("account_rejected", "this sign-up request was not approved; contact the hospital")}


@lru_cache
def _dummy_hash() -> str:
    """Checked against when the email is unknown, so both paths take the same time."""
    return hash_password("not-a-real-password")


@router.post("/auth/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> LoginOut:
    check(request, "login_failed", LOGIN_LIMITS)  # only failures count; checked before the password
    ip, now = client_ip(request), datetime.now(UTC)
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else _dummy_hash())
    if user is None or not ok:
        record(request, "login_failed", LOGIN_LIMITS)
        if user is not None:
            user.failed_logins = (user.failed_logins or 0) + 1
            if user.failed_logins >= MAX_FAILED:
                user.locked_until, user.failed_logins = now + LOCK_FOR, 0
                audit(db, user, "lockout", "user", user.id, ip=ip)
        audit(db, user, "login_failed", "user", user.id if user else "", ip=ip)
        db.commit()
        raise ApiError(401, "bad_credentials", "wrong email or password")
    # the specific reasons below are only revealed to someone who knows the password
    if user.locked_until and user.locked_until > now:
        raise ApiError(423, "account_locked", "too many failed attempts; try again in 15 minutes")
    if user.status != "active":
        code, detail = _INACTIVE.get(user.status, ("account_disabled", "this account is not active"))
        raise ApiError(403, code, detail)
    user.failed_logins, user.locked_until = 0, None
    audit(db, user, "login", "user", user.id, ip=ip)
    db.commit()
    return LoginOut(access_token=create_token(user),
                    user=LoginUser(id=user.id, name=user.name, role=user.role, patient_id=user.patient_id))


@router.get("/me", response_model=Me)
def me(user: User = Depends(get_current_user)) -> User:
    return user
