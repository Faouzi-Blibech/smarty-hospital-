"""Auth dependencies and the patient-access check (role matrix in data-model.md)."""

from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import false, or_, select
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.db import get_db
from app.errors import ApiError, forbidden, not_found
from app.models import Appointment, Patient, PatientAccess, Staff, User
from app.services.audit import audit

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def user_from_token(db: Session, token: str | None) -> User | None:
    """The token's user, or None if the token is bad or the account is not active (disable works immediately)."""
    claims = decode_token(token) if token else None
    user = db.get(User, claims["sub"]) if claims and claims.get("sub") else None
    return user if user is not None and user.status == "active" else None


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


def has_grant(db: Session, user_id: str, patient_id: str, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    return db.scalar(select(PatientAccess.id).where(
        PatientAccess.patient_id == patient_id, PatientAccess.user_id == user_id,
        PatientAccess.revoked_at.is_(None), PatientAccess.expires_at > now).limit(1)) is not None


def nurse_scope(db: Session, user: User) -> tuple[str | None, str | None]:
    """(ward, supervisor doctor id) of a nurse; a doctor's team nurse may have no ward."""
    st = db.get(Staff, user.id)
    return (st.ward, st.supervisor_id) if st else (None, None)


def nurse_patient_filter(db: Session, user: User):
    ward, sup = nurse_scope(db, user)
    conds = ([Patient.ward == ward] if ward else []) + ([Patient.attending_doctor_id == sup] if sup else [])
    return or_(*conds) if conds else false()


def doctor_patient_filter(db: Session, user: User):
    granted = select(PatientAccess.patient_id).where(
        PatientAccess.user_id == user.id, PatientAccess.revoked_at.is_(None),
        PatientAccess.expires_at > datetime.now(UTC))
    return or_(Patient.attending_doctor_id == user.id, Patient.id.in_(granted))


def can_access(db: Session, user: User, patient: Patient) -> bool:
    if user.role == "doctor":
        return patient.attending_doctor_id == user.id or has_grant(db, user.id, patient.id)
    if user.role == "nurse":
        ward, sup = nurse_scope(db, user)
        return (ward is not None and patient.ward == ward) or (
            sup is not None and patient.attending_doctor_id == sup)
    if user.role == "patient":
        return user.patient_id == patient.id
    return False  # admin: summary fields only, through GET /patients


def can_see_appointment(db: Session, user: User, a: Appointment) -> bool:
    """Who may see/act on an appointment. A doctor reaches a patient who is not theirs only through a pending
    request (`requested`), plus appointments they are booked on and their own patients' appointments.
    Admin handles scheduling. Nurses have no appointment access."""
    if user.role == "admin":
        return True
    if user.role == "patient":
        return user.patient_id == a.patient_id
    if user.role == "doctor":
        if a.status == "requested" or a.doctor_id == user.id:
            return True
        p = db.get(Patient, a.patient_id)
        return p is not None and (p.attending_doctor_id == user.id or has_grant(db, user.id, p.id))
    return False


def check_appointment_access(db: Session, user: User, a: Appointment, write: bool = False,
                             resource: str = "appointment", ip: str = "") -> None:
    """403 unless `user` may see this appointment; on success writes the audit row (patient_id = its patient)."""
    if not can_see_appointment(db, user, a) or (write and user.role == "patient"):
        raise forbidden("not your appointment")
    audit(db, user, "update" if write else "read", resource, a.id, patient_id=a.patient_id, ip=ip)


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
