"""Account administration (spec §6.2–6.5, api.md 1.9). Rules: app/services/accounts.py."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import codes
from app.auth.deps import require_roles
from app.auth.ratelimit import client_ip
from app.db import get_db
from app.errors import ApiError, not_found
from app.models import Staff, User
from app.schemas import iso
from app.services import accounts as A
from app.services.audit import audit

router = APIRouter(tags=["users"])


class ApproveIn(BaseModel):
    role: str
    ward: str | None = None
    patient_id: str | None = None  # role patient: link this existing record; omitted = create a record from the name


def _target(db: Session, user_id: str) -> User:
    u = db.get(User, user_id)
    if u is None:
        raise not_found("user")
    return u


def _done(db: Session, actor: User, target: User, request: Request, patient_id: str | None = None) -> dict:
    audit(db, actor, "update", "user", target.id, patient_id=patient_id, ip=client_ip(request))
    db.flush()
    out = A.admin_out(db, target)
    db.commit()
    return out


@router.get("/users")
def list_requests(request: Request, status: Literal["pending", "rejected"] = "pending",
                  user: User = Depends(require_roles("admin", "doctor")), db: Session = Depends(get_db)) -> list:
    stmt = select(User).where(User.status == status).order_by(User.created_at, User.id)
    if user.role == "doctor":
        stmt = stmt.where(User.requested_doctor_id == user.id)
    out = [A.pending_out(db, u) for u in db.scalars(stmt)]
    audit(db, user, "read", "account_requests", status, ip=client_ip(request))
    db.commit()
    return out


@router.post("/users/{user_id}/approve")
def approve(user_id: str, body: ApproveIn, request: Request, user: User = Depends(require_roles("admin", "doctor")),
            db: Session = Depends(get_db)) -> dict:
    target = _target(db, user_id)
    patient, created = A.approve(db, user, target, body.role, body.ward, now=datetime.now(UTC),
                                 patient_id=body.patient_id)
    if created:
        audit(db, user, "create", "patient", patient.id, patient_id=patient.id, ip=client_ip(request))
    return _done(db, user, target, request, patient_id=patient.id if patient else None)


@router.post("/users/{user_id}/reject")
def reject(user_id: str, request: Request, user: User = Depends(require_roles("admin", "doctor")),
           db: Session = Depends(get_db)) -> dict:
    target = _target(db, user_id)
    A.reject(user, target)
    return _done(db, user, target, request)


@router.post("/users/{user_id}/disable")
def disable(user_id: str, request: Request, user: User = Depends(require_roles("admin", "doctor")),
            db: Session = Depends(get_db)) -> dict:
    target = _target(db, user_id)
    A.set_active(db, user, target, False)
    return _done(db, user, target, request)


@router.post("/users/{user_id}/enable")
def enable(user_id: str, request: Request, user: User = Depends(require_roles("admin", "doctor")),
           db: Session = Depends(get_db)) -> dict:
    target = _target(db, user_id)
    A.set_active(db, user, target, True)
    return _done(db, user, target, request)


@router.post("/users/{user_id}/reset-code")
def reset_code(user_id: str, request: Request, user: User = Depends(require_roles("admin")),
               db: Session = Depends(get_db)) -> dict:
    target = _target(db, user_id)
    code, row = codes.issue(db, "reset", issued_by=user.id, user_id=target.id)
    audit(db, user, "create", "access_code", row.id, ip=client_ip(request))
    db.commit()
    return {"code": code, "expires_at": iso(row.expires_at)}


class WardIn(BaseModel):
    ward: str | None


@router.patch("/users/{user_id}")
def set_ward(user_id: str, body: WardIn, request: Request, user: User = Depends(require_roles("admin")),
             db: Session = Depends(get_db)) -> dict:
    """The hospital admin adds (or clears) a ward on an active doctor or nurse, e.g. a doctor's team nurse."""
    target = _target(db, user_id)
    st = db.get(Staff, target.id)
    if target.role not in ("doctor", "nurse") or st is None:
        raise ApiError(409, "bad_status", "only doctors and nurses have a ward")
    st.ward = (body.ward or "").strip() or None
    return _done(db, user, target, request)


@router.get("/doctors/me/team")
def my_team(user: User = Depends(require_roles("doctor")), db: Session = Depends(get_db)) -> list[dict]:
    members = db.scalars(select(User).join(Staff, Staff.user_id == User.id)
                         .where(Staff.supervisor_id == user.id).order_by(User.name)).all()
    return [A.admin_out(db, u) for u in members]
