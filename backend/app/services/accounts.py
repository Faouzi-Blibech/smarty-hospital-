"""Who may approve, reject, disable and enable whom (spec §6.2–6.5).

Hospital admin: any account. Doctor: only requests that name him (approve as nurse only, into his team) and only his
team members afterwards. Routers call these and then audit + commit."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.errors import ApiError, forbidden
from app.models import Staff, User
from app.schemas import iso

STAFF_ROLES = ("doctor", "nurse", "admin")


def can_review(approver: User, target: User) -> bool:
    if approver.role == "admin":
        return True
    return approver.role == "doctor" and target.requested_doctor_id == approver.id


def approve(db: Session, approver: User, target: User, role: str, ward: str | None, *, now: datetime) -> None:
    if not can_review(approver, target):
        raise forbidden("this request is not addressed to you")
    if role not in STAFF_ROLES:
        raise ApiError(422, "invalid", "role: doctor, nurse or admin")
    if target.status not in ("pending", "rejected"):
        raise ApiError(409, "bad_status", f"account is {target.status}")
    if approver.role == "doctor":
        if role != "nurse":
            raise forbidden("a doctor can only add nurses to his team")
        ward, supervisor = None, approver.id
    else:
        supervisor = target.requested_doctor_id if role == "nurse" else None
    target.role, target.status, target.approved_by, target.approved_at = role, "active", approver.id, now
    if role != "admin":
        st = db.get(Staff, target.id)
        if st is None:
            st = Staff(user_id=target.id)
            db.add(st)
        st.ward, st.supervisor_id = ward, supervisor
    db.flush()


def reject(approver: User, target: User) -> None:
    if not can_review(approver, target):
        raise forbidden("this request is not addressed to you")
    if target.status != "pending":
        raise ApiError(409, "bad_status", f"account is {target.status}")
    target.status = "rejected"


def can_manage(db: Session, actor: User, target: User) -> bool:
    if actor.id == target.id:
        return False
    if actor.role == "admin":
        return True
    st = db.get(Staff, target.id)
    return actor.role == "doctor" and st is not None and st.supervisor_id == actor.id


def set_active(db: Session, actor: User, target: User, active: bool) -> None:
    if not can_manage(db, actor, target):
        raise forbidden("you cannot manage this account")
    if active:
        if target.status != "disabled" or target.role is None:
            raise ApiError(409, "bad_status", f"account is {target.status}")
        target.status = "active"
    else:
        if target.status == "disabled":
            raise ApiError(409, "bad_status", "account is already disabled")
        target.status = "disabled"


def admin_out(db: Session, u: User) -> dict:
    st = db.get(Staff, u.id)
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "status": u.status,
            "ward": st.ward if st else None, "supervisor_id": st.supervisor_id if st else None}


def pending_out(db: Session, u: User) -> dict:
    doc = db.get(User, u.requested_doctor_id) if u.requested_doctor_id else None
    return {"id": u.id, "name": u.name, "email": u.email, "note": u.requested_note,
            "requested_doctor_id": u.requested_doctor_id, "requested_doctor_name": doc.name if doc else None,
            "status": u.status, "created_at": iso(u.created_at)}
