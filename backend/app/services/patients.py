"""Patient read models: the summary fields joined from admissions, devices, vitals and alerts."""

from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Admission, Alert, Device, Patient, User, Vital


def age(dob: date | None, today: date | None = None) -> int | None:
    if dob is None:
        return None
    today = today or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def active_admission(db: Session, patient_id: str) -> Admission | None:
    return db.scalar(select(Admission).where(Admission.patient_id == patient_id,
                                             Admission.discharged_at.is_(None)))


def latest_vital(db: Session, patient_id: str) -> Vital | None:
    return db.scalar(select(Vital).where(Vital.patient_id == patient_id).order_by(Vital.ts.desc()).limit(1))


def open_alert_count(db: Session, patient_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Alert)
                     .where(Alert.patient_id == patient_id, Alert.acked_at.is_(None))) or 0


def list_item(db: Session, p: Patient) -> dict:
    adm = active_admission(db, p.id)
    return {"id": p.id, "first_name": p.first_name, "last_name": p.last_name, "ward": p.ward,
            "bed": adm.bed if adm else None, "device_id": adm.device_id if adm else None,
            "admission_id": adm.id if adm else None}


def summary(db: Session, p: Patient) -> dict:
    out = list_item(db, p)
    v = latest_vital(db, p.id)
    dev = db.get(Device, out["device_id"]) if out["device_id"] else None
    out.update(age=age(p.date_of_birth), sex=p.sex, latest_news2=v.news2 if v else None,
               open_alerts=open_alert_count(db, p.id), last_vital_at=v.ts if v else None,
               device_online=dev.online if dev else None)
    return out


def detail(db: Session, p: Patient) -> dict:
    out = summary(db, p)
    adm = active_admission(db, p.id)
    doc = db.get(User, p.attending_doctor_id) if p.attending_doctor_id else None
    out.update(date_of_birth=p.date_of_birth, allergies=p.allergies or [], history=p.history or "",
               attending_doctor_id=p.attending_doctor_id, attending_doctor_name=doc.name if doc else None,
               admitted_at=adm.admitted_at if adm else None)
    return out


def search(db: Session, *, doctor_id: str | None = None, ward: str | None = None,
           q: str | None = None) -> list[Patient]:
    stmt = select(Patient)
    if doctor_id is not None:
        stmt = stmt.where(Patient.attending_doctor_id == doctor_id)
    if ward:
        stmt = stmt.where(Patient.ward == ward)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Patient.first_name.ilike(like), Patient.last_name.ilike(like),
                              Patient.id.ilike(like)))
    return list(db.scalars(stmt.order_by(Patient.id)))
