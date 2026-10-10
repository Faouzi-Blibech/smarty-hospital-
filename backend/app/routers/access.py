"""Who may reach a patient beyond the defaults (spec §6.3, §6.6): enrollment codes and doctor-to-doctor sharing."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import codes
from app.auth.deps import require_roles
from app.auth.ratelimit import client_ip
from app.db import get_db
from app.errors import ApiError, forbidden, not_found
from app.models import Patient, User
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
