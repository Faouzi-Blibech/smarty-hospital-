"""Who may reach a patient beyond the defaults (spec §6.3, §6.6): enrollment codes and doctor-to-doctor sharing."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import codes
from app.auth.deps import require_roles
from app.auth.ratelimit import client_ip
from app.db import get_db
from app.errors import ApiError, forbidden, not_found
from app.ids import new_id
from app.models import Patient, PatientAccess, User
from app.schemas import iso
from app.services.audit import audit

router = APIRouter(prefix="/patients", tags=["access"])


def owner_or_admin(db: Session, user: User, patient_id: str) -> Patient:
    p = db.get(Patient, patient_id)
    if p is None:
        raise not_found("patient")
    if user.role == "admin" or (user.role == "doctor" and p.attending_doctor_id == user.id):
        return p
    raise forbidden("only the hospital admin or the attending doctor")


@router.post("/{patient_id}/enrollment-code")
def enrollment_code(patient_id: str, request: Request, user: User = Depends(require_roles("admin", "doctor")),
                    db: Session = Depends(get_db)) -> dict:
    p = owner_or_admin(db, user, patient_id)
    if db.scalar(select(User.id).where(User.patient_id == p.id, User.status != "disabled")):
        raise ApiError(409, "already_enrolled", "this patient already has an account")
    code, row = codes.issue(db, "enrollment", issued_by=user.id, patient_id=p.id)
    audit(db, user, "create", "access_code", row.id, patient_id=p.id, ip=client_ip(request))
    db.commit()
    return {"code": code, "expires_at": iso(row.expires_at)}


@router.post("/{patient_id}/reset-code")
def patient_reset_code(patient_id: str, request: Request, user: User = Depends(require_roles("admin", "doctor")),
                       db: Session = Depends(get_db)) -> dict:
    """A patient forgot their password: the admin or attending doctor issues a reset code for the patient's account."""
    p = owner_or_admin(db, user, patient_id)
    account = db.scalar(select(User).where(User.patient_id == p.id, User.status != "disabled"))
    if account is None:
        raise not_found("patient account")
    code, row = codes.issue(db, "reset", issued_by=user.id, user_id=account.id)
    audit(db, user, "create", "access_code", row.id, patient_id=p.id, ip=client_ip(request))
    db.commit()
    return {"code": code, "expires_at": iso(row.expires_at)}


DEFAULT_SHARE = timedelta(days=30)
MAX_SHARE = timedelta(days=365)


class ShareIn(BaseModel):
    doctor_id: str
    expires_at: datetime | None = None


def _active_grants(db: Session, patient_id: str, now: datetime, doctor_id: str | None = None):
    stmt = select(PatientAccess).where(PatientAccess.patient_id == patient_id, PatientAccess.revoked_at.is_(None),
                                       PatientAccess.expires_at > now)
    if doctor_id:
        stmt = stmt.where(PatientAccess.user_id == doctor_id)
    return db.scalars(stmt.order_by(PatientAccess.created_at)).all()


def _grant_out(db: Session, g: PatientAccess) -> dict:
    doc = db.get(User, g.user_id)
    return {"patient_id": g.patient_id, "doctor_id": g.user_id, "doctor_name": doc.name if doc else None,
            "expires_at": iso(g.expires_at)}


@router.get("/{patient_id}/access")
def list_access(patient_id: str, request: Request, user: User = Depends(require_roles("admin", "doctor")),
                db: Session = Depends(get_db)) -> list[dict]:
    p = owner_or_admin(db, user, patient_id)
    out = [_grant_out(db, g) for g in _active_grants(db, p.id, datetime.now(UTC))]
    audit(db, user, "read", "patient_access", p.id, patient_id=p.id, ip=client_ip(request))
    db.commit()
    return out


@router.post("/{patient_id}/access")
def share(patient_id: str, body: ShareIn, request: Request, user: User = Depends(require_roles("admin", "doctor")),
          db: Session = Depends(get_db)) -> dict:
    p = owner_or_admin(db, user, patient_id)
    now = datetime.now(UTC)
    doc = db.get(User, body.doctor_id)
    if doc is None or doc.role != "doctor" or doc.status != "active" or doc.id == p.attending_doctor_id:
        raise ApiError(422, "invalid", "doctor_id: an active doctor other than the attending doctor")
    exp = body.expires_at or now + DEFAULT_SHARE
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp <= now or exp > now + MAX_SHARE:
        raise ApiError(422, "invalid", "expires_at: in the future and within one year")
    for old in _active_grants(db, p.id, now, doc.id):  # one live grant per doctor: the new one replaces it
        old.revoked_at = now
    g = PatientAccess(id=new_id(db, "pa"), patient_id=p.id, user_id=doc.id, granted_by=user.id, expires_at=exp)
    db.add(g)
    db.flush()
    audit(db, user, "create", "patient_access", g.id, patient_id=p.id, ip=client_ip(request))
    out = _grant_out(db, g)
    db.commit()
    return out


@router.delete("/{patient_id}/access/{doctor_id}", status_code=204)
def revoke(patient_id: str, doctor_id: str, request: Request, user: User = Depends(require_roles("admin", "doctor")),
           db: Session = Depends(get_db)) -> Response:
    p = owner_or_admin(db, user, patient_id)
    now = datetime.now(UTC)
    grants = _active_grants(db, p.id, now, doctor_id)
    if not grants:
        raise not_found("grant")
    for g in grants:
        g.revoked_at = now
        audit(db, user, "delete", "patient_access", g.id, patient_id=p.id, ip=client_ip(request))
    db.commit()
    return Response(status_code=204)
