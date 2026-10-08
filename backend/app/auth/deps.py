"""Auth dependencies and the patient-access check (role matrix in data-model.md)."""

from collections.abc import Callable

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.db import get_db
from app.errors import ApiError, forbidden, not_found
from app.models import Patient, Staff, User
from app.services.audit import audit

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def user_from_token(db: Session, token: str | None) -> User | None:
    claims = decode_token(token) if token else None
    return db.get(User, claims["sub"]) if claims and claims.get("sub") else None


def get_current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = user_from_token(db, token)
    if user is None:
        raise ApiError(401, "unauthorized", "missing or invalid token")
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise forbidden(f"role {user.role} cannot do this")
        return user

    return dep


def staff_ward(db: Session, user: User) -> str | None:
    staff = db.get(Staff, user.id)
    return staff.ward if staff else None


def can_access(db: Session, user: User, patient: Patient) -> bool:
    if user.role == "doctor":
        return patient.attending_doctor_id == user.id
    if user.role == "nurse":
        ward = staff_ward(db, user)
        return ward is not None and patient.ward == ward
    if user.role == "patient":
        return user.patient_id == patient.id
    return False  # admin: summary fields only, through GET /patients


def check_patient_access(db: Session, user: User, patient_id: str, write: bool = False,
                         resource: str = "patient", ip: str = "") -> Patient:
    """403/404 unless `user` may see this patient; on success writes the audit row. Call it in every
    /patients/{id}* route. Patients never write their own record."""
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise not_found("patient")
    if not can_access(db, user, patient) or (write and user.role == "patient"):
        raise forbidden("not your patient")
    audit(db, user, "update" if write else "read", resource, patient_id, patient_id=patient_id, ip=ip)
    return patient
