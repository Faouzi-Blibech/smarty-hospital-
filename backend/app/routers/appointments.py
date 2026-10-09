"""Appointments and the waitlist (owner: Faouzi). Contract: api.md → Appointments and waitlist; n8n events from
n8n-webhooks.md v1.2. Business rules live in app/services/appointments.py; this router loads rows and commits.
"""

from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.exams import suggest_exams
from app.auth.deps import require_roles
from app.db import get_db
from app.errors import ApiError, forbidden, not_found
from app.ids import new_id
from app.integrations import n8n
from app.models import Appointment, ExamOrder, Patient, User
from app.schemas import iso
from app.services import appointments as A
from app.services import exams as E
from app.services.audit import audit
from app.services.patients import age

router = APIRouter(prefix="/appointments", tags=["appointments"])

# The patient never sees an AI urgency score (api.md 1.5 → Patient role)
_HIDDEN_FROM_PATIENT = ("urgency_ai", "triage", "no_show_prob", "ai_suggested")
_TRIAGE_KEYS = ("urgency", "reasons", "red_flags", "source", "model_urgency", "confidence")


class AppointmentIn(BaseModel):
    patient_id: str
    referral_text: str = Field(min_length=1, max_length=4000)
    symptoms: list[str] = []
    preferred_dates: list[date] = []  # accepted for the contract; slots are picked by staff on confirm


class OverrideIn(BaseModel):
    urgency_final: int = Field(ge=1, le=5)


class ConfirmIn(BaseModel):
    slot_at: datetime
    doctor_id: str
    urgency_final: int | None = Field(default=None, ge=1, le=5)


class CancelIn(BaseModel):
    reason: str | None = None


class ReplyIn(BaseModel):
    reply: Literal["confirm", "cancel"]


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _name(db: Session, user_id: str | None) -> str | None:
    u = db.get(User, user_id) if user_id else None
    return u.name if u else None


def to_out(db: Session, a: Appointment, viewer: User) -> dict:
    """`Appointment` (api.md) plus the additive display fields from the 1.5 proposal."""
    p = db.get(Patient, a.patient_id)
    triage = {k: (a.ai_suggested or {}).get(k) for k in _TRIAGE_KEYS}
    p_age = age(p.date_of_birth) if p else None
    out = {"id": a.id, "patient_id": a.patient_id, "status": a.status, "urgency_ai": a.urgency_ai,
           "urgency_final": a.urgency_final, "triage": triage, "slot_at": iso(a.slot_at), "doctor_id": a.doctor_id,
           "confirmed_by": a.confirmed_by, "patient_confirmed_at": iso(a.patient_confirmed_at),
           "no_show_prob": a.no_show_prob, "created_at": iso(a.created_at), "ai_suggested": a.ai_suggested,
           "human_confirmed_by": a.human_confirmed_by,
           "patient_name": f"{p.first_name} {p.last_name}" if p else None,
           "patient_age": str(p_age) if p_age is not None else None, "specialty": p.ward if p else None,
           "referral_text": a.referral_text, "doctor_name": _name(db, a.doctor_id),
           "confirmed_by_name": _name(db, a.confirmed_by),
           "human_confirmed_by_name": _name(db, a.human_confirmed_by)}
    orders = db.scalars(select(ExamOrder).where(ExamOrder.appointment_id == a.id)).all()
    out.update(E.counts(orders))
    if viewer.role == "patient":
        for k in _HIDDEN_FROM_PATIENT:
            out.pop(k)
    return out


def _load(db: Session, appointment_id: str) -> Appointment:
    a = db.get(Appointment, appointment_id)
    if a is None:
        raise not_found("appointment")
    return a


def _own(user: User, a: Appointment) -> None:
    if user.role == "patient" and user.patient_id != a.patient_id:
        raise forbidden("not your appointment")


def _conflict(e: A.Conflict) -> ApiError:
    return ApiError(409, e.code, str(e))


def cancelled_event(db: Session, a: Appointment) -> dict:
    """`appointment.cancelled` with the best waiting candidate for the freed slot (W2)."""
    waiting = db.execute(select(Appointment, Patient).join(Patient, Patient.id == Appointment.patient_id)
                         .where(Appointment.status == "requested")).all()
    return A.cancelled_event(a, doctor_name=_name(db, a.doctor_id), waiting=[(w, p) for w, p in waiting])


def cancel(db: Session, a: Appointment) -> dict:
    """Cancel flow shared by POST …/cancel, a patient reply and the n8n reply callback. Returns the event."""
    try:
        A.apply_cancel(a)
    except A.Conflict as e:
        raise _conflict(e) from e
    db.flush()
    return cancelled_event(db, a)


@router.post("", status_code=201)
def create(body: AppointmentIn, request: Request, user: User = Depends(require_roles("patient", "admin")),
           db: Session = Depends(get_db)) -> dict:
    if user.role == "patient" and user.patient_id != body.patient_id:
        raise forbidden("patients can only request for themselves")
    p = db.get(Patient, body.patient_id)
    if p is None:
        raise not_found("patient")
    fields = A.new_appointment_fields(p, body.referral_text, body.symptoms, today=datetime.now(UTC).date())
    a = Appointment(id=new_id(db, "a"), **fields)
    db.add(a)
    db.flush()
    suggestion = suggest_exams(" ".join([body.referral_text, *body.symptoms]), a.ai_suggested.get("red_flags", []))
    for fields in E.suggested_fields(p.id, a.id, suggestion):
        db.add(ExamOrder(id=new_id(db, "ex"), **fields))
    audit(db, user, "create", "appointment", a.id, patient_id=p.id, ip=_ip(request))
    db.refresh(a)
    out = to_out(db, a, user)
    db.commit()
    return out


@router.get("/waitlist")
def waitlist(user: User = Depends(require_roles("admin", "doctor")), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Appointment).where(Appointment.status == "requested")).all()
    return [to_out(db, a, user) for a in A.waitlist(rows)]


@router.get("")
def list_appointments(request: Request, patient_id: str | None = None, status: str | None = None,
                      user: User = Depends(require_roles("admin", "doctor", "patient")),
                      db: Session = Depends(get_db)) -> list[dict]:
    if user.role == "patient":
        if patient_id and patient_id != user.patient_id:
            raise forbidden("not your appointments")
        patient_id = user.patient_id
    stmt = select(Appointment)
    if patient_id:
        stmt = stmt.where(Appointment.patient_id == patient_id)
    if status:
        stmt = stmt.where(Appointment.status == status)
    rows = db.scalars(stmt).all()
    # soonest slot first, then unbooked requests newest first
    rows = sorted(rows, key=lambda a: (a.slot_at is None, a.slot_at or datetime.min.replace(tzinfo=UTC),
                                       -a.created_at.timestamp()))
    if patient_id:
        audit(db, user, "read", "appointments", patient_id, patient_id=patient_id, ip=_ip(request))
        db.commit()
    return [to_out(db, a, user) for a in rows]


@router.patch("/{appointment_id}")
def override(appointment_id: str, body: OverrideIn, user: User = Depends(require_roles("admin", "doctor")),
             db: Session = Depends(get_db)) -> dict:
    a = _load(db, appointment_id)
    A.apply_override(a, body.urgency_final, user_id=user.id)
    db.flush()
    out = to_out(db, a, user)
    db.commit()
    return out


@router.post("/{appointment_id}/confirm")
def confirm(appointment_id: str, body: ConfirmIn, user: User = Depends(require_roles("admin", "doctor")),
            db: Session = Depends(get_db)) -> dict:
    a = _load(db, appointment_id)
    doctor = db.get(User, body.doctor_id)
    if doctor is None or doctor.role != "doctor":
        raise ApiError(422, "invalid", "doctor_id: not a doctor")
    taken = db.scalar(select(Appointment.id).where(Appointment.status == "confirmed", Appointment.id != a.id,
                                                   Appointment.doctor_id == body.doctor_id,
                                                   Appointment.slot_at == body.slot_at).limit(1))
    if taken:
        raise ApiError(409, "slot_taken", "this doctor already has an appointment at that time")
    try:
        A.apply_confirm(a, slot_at=body.slot_at, doctor_id=body.doctor_id, user_id=user.id,
                        urgency_final=body.urgency_final)
    except A.Conflict as e:
        raise _conflict(e) from e
    db.flush()
    p = db.get(Patient, a.patient_id)
    event = A.confirmed_event(a, p, doctor_name=doctor.name)
    out = to_out(db, a, user)
    db.commit()
    n8n.emit("appointment.confirmed", event)
    return out


@router.post("/{appointment_id}/cancel")
def cancel_appointment(appointment_id: str, body: CancelIn | None = None,
                       user: User = Depends(require_roles("admin", "patient")),
                       db: Session = Depends(get_db)) -> dict:
    a = _load(db, appointment_id)
    _own(user, a)
    event = cancel(db, a)
    out = to_out(db, a, user)
    db.commit()
    n8n.emit("appointment.cancelled", event)
    return out


@router.post("/{appointment_id}/reply")
def reply(appointment_id: str, body: ReplyIn, user: User = Depends(require_roles("patient")),
          db: Session = Depends(get_db)) -> dict:
    a = _load(db, appointment_id)
    _own(user, a)
    event = None
    if body.reply == "cancel":
        event = cancel(db, a)
    else:
        A.apply_reply(a, "confirm", now=datetime.now(UTC))
        db.flush()
    out = to_out(db, a, user)
    db.commit()
    if event is not None:
        n8n.emit("appointment.cancelled", event)
    return out
