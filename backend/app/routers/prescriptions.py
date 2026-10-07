from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.deps import check_patient_access, require_roles
from app.db import get_db
from app.errors import not_found
from app.ids import new_id
from app.models import Prescription, User
from app.schemas import PrescriptionIn, PrescriptionPatch, PrescriptionPublished
from app.services import schedule
from app.services.audit import audit

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _published(db: Session, rx: Prescription) -> PrescriptionPublished:
    """Regenerate doses, push the schedule, and shape the api.md Prescription response."""
    schedule.rebuild_doses(db, rx)
    sent = schedule.push_schedule(db, rx.patient_id)
    dev = schedule.device_of(db, rx.patient_id)
    out = PrescriptionPublished.model_validate(
        {**{k: getattr(rx, k) for k in ("id", "patient_id", "doctor_id", "items", "care_plan", "active",
                                        "created_at")},
         "schedule_version": dev.schedule_version if dev else None, "published_to_device": sent})
    db.commit()
    return out


@router.post("", status_code=201, response_model=PrescriptionPublished)
def create(body: PrescriptionIn, request: Request, user: User = Depends(require_roles("doctor")),
           db: Session = Depends(get_db)):
    check_patient_access(db, user, body.patient_id, write=True, resource="prescription", ip=_ip(request))
    rx = Prescription(id=new_id(db, "rx"), patient_id=body.patient_id, doctor_id=user.id,
                      items=[i.model_dump() for i in body.items], care_plan=body.care_plan, active=True)
    db.add(rx)
    db.flush()
    db.refresh(rx)
    audit(db, user, "create", "prescription", rx.id, patient_id=rx.patient_id, ip=_ip(request))
    return _published(db, rx)


@router.patch("/{rx_id}", response_model=PrescriptionPublished)
def patch(rx_id: str, body: PrescriptionPatch, request: Request, user: User = Depends(require_roles("doctor")),
          db: Session = Depends(get_db)):
    rx = db.get(Prescription, rx_id)
    if rx is None:
        raise not_found("prescription")
    # the attending doctor may stop or restart any prescription of their own patient
    check_patient_access(db, user, rx.patient_id, write=True, resource="prescription", ip=_ip(request))
    rx.active = body.active
    db.flush()
    return _published(db, rx)
