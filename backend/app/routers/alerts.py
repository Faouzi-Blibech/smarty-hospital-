from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import check_patient_access, require_roles, staff_ward
from app.db import get_db
from app.errors import forbidden, not_found
from app.iot import publisher
from app.models import Alert, Patient, User
from app.services import alerts as A

router = APIRouter(prefix="/alerts", tags=["alerts"])
MAX_ALERTS = 200


@router.get("")
def list_alerts(status: str | None = None, user: User = Depends(require_roles("doctor", "nurse")),
                db: Session = Depends(get_db)) -> list[dict]:
    if user.role == "nurse":
        mine = select(Patient.id).where(Patient.ward == staff_ward(db, user))
    else:
        mine = select(Patient.id).where(Patient.attending_doctor_id == user.id)
    stmt = select(Alert).where(Alert.patient_id.in_(mine))
    if status == "open":
        stmt = stmt.where(Alert.acked_at.is_(None))
    rows = db.scalars(stmt.order_by(Alert.created_at.desc(), Alert.id.desc()).limit(MAX_ALERTS)).all()
    return [A.to_dict(db, a) for a in rows]


@router.post("/{alert_id}/ack")
def ack(alert_id: str, request: Request, user: User = Depends(require_roles("doctor", "nurse")),
        db: Session = Depends(get_db)) -> dict:
    a = db.get(Alert, alert_id)
    if a is None:
        raise not_found("alert")
    if a.patient_id is None:
        raise forbidden("alert has no patient")
    check_patient_access(db, user, a.patient_id, write=True, resource="alert",
                         ip=request.client.host if request.client else "")
    if a.acked_at is None:  # idempotent: a second ack keeps the first confirmer
        a.acked_by, a.acked_at = user.id, datetime.now(UTC)
        db.flush()
    f = A.frame(db, a)
    db.commit()
    publisher.publish_ws_frame(f)  # other dashboards drop it from their open list
    return f["data"]
