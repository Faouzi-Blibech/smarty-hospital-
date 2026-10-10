"""Alerts (owner: Wali): NEWS2 and trend alerts from vitals, plus the shared create/serialize helpers used
by device events. Every alert keeps the early-warning output in `ai_suggested` (source "rules"); a nurse or
doctor confirms it by acking (`acked_by` is the confirmer column).
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.ai.early_warning import News2Result, trend_z
from app.ids import new_id
from app.integrations import n8n
from app.models import Admission, Alert, Patient, Staff, User, Vital
from app.schemas import iso

DEDUPE_WINDOW = timedelta(minutes=10)
TREND_WINDOW = 30
TREND_Z = 3.0
ALERTING = {"medium", "high", "critical"}
EMITTING = {"high", "critical"}
LABELS = {"hr": ("HR", "{:d}"), "spo2": ("SpO2", "{:d}%"), "temp": ("Temp", "{:.1f}°C")}


def _bed(db: Session, patient_id: str | None) -> str | None:
    if not patient_id:
        return None
    return db.scalar(select(Admission.bed).where(Admission.patient_id == patient_id,
                                                 Admission.discharged_at.is_(None)))


def to_dict(db: Session, a: Alert) -> dict:
    """api.md Alert, plus the additive 1.5 fields bed, patient_first_name, acked_by_name, source."""
    p = db.get(Patient, a.patient_id) if a.patient_id else None
    acker = db.get(User, a.acked_by) if a.acked_by else None
    return {"id": a.id, "patient_id": a.patient_id, "device_id": a.device_id, "kind": a.kind,
            "severity": a.severity, "news2": a.news2, "message": a.message, "created_at": iso(a.created_at),
            "acked_by": a.acked_by, "acked_at": iso(a.acked_at), "bed": _bed(db, a.patient_id),
            "patient_first_name": p.first_name if p else None, "acked_by_name": acker.name if acker else None,
            "source": (a.ai_suggested or {}).get("source")}


def frame(db: Session, a: Alert) -> dict:
    from app.iot.ingest import scope_for  # late import: ingest imports this module

    return {"type": "alert", "data": to_dict(db, a), "scope": scope_for(db, a.patient_id)}


def chat_ids(db: Session, p: Patient | None) -> tuple[list[str], str | None]:
    """(nurse chat ids of the patient's ward, attending doctor chat id) for n8n."""
    if p is None:
        return [], None
    team = [Staff.supervisor_id == p.attending_doctor_id] if p.attending_doctor_id else []
    nurses = db.scalars(select(Staff.telegram_chat_id).join(User, User.id == Staff.user_id)
                        .where(User.role == "nurse", User.status == "active", or_(Staff.ward == p.ward, *team),
                               Staff.telegram_chat_id.is_not(None))).all()
    doc = db.get(Staff, p.attending_doctor_id) if p.attending_doctor_id else None
    return list(dict.fromkeys(nurses)), doc.telegram_chat_id if doc else None


def _recent(db: Session, patient_id: str, kind: str, severity: str | None = None) -> bool:
    """An alert of this kind (acked or not) in the last 10 min: an ack must not be undone seconds later
    by the same ongoing deterioration (and a second Telegram message)."""
    stmt = select(Alert.id).where(Alert.patient_id == patient_id, Alert.kind == kind,
                                  Alert.created_at >= datetime.now(UTC) - DEDUPE_WINDOW)
    if severity:
        stmt = stmt.where(Alert.severity == severity)
    return db.scalar(stmt.limit(1)) is not None


def create_alert(db: Session, patient_id: str | None, device_id: str | None, kind: str, severity: str,
                 news2: int | None, message: str, ai_suggested: dict | None) -> Alert:
    """Store the alert; `high`/`critical` also emit `alert.critical` to n8n (W4)."""
    a = Alert(id=new_id(db, "al"), patient_id=patient_id, device_id=device_id, kind=kind, severity=severity,
              news2=news2, message=message, ai_suggested=ai_suggested, created_at=datetime.now(UTC))
    db.add(a)
    db.flush()
    if severity in EMITTING:
        p = db.get(Patient, patient_id) if patient_id else None
        nurses, doctor = chat_ids(db, p)
        n8n.emit_after_commit(db, "alert.critical", {"alert_id": a.id, "patient_first_name": p.first_name if p else None,
                                    "bed": _bed(db, patient_id), "kind": kind, "news2": news2,
                                    "message": message, "nurse_chat_ids": nurses, "doctor_chat_id": doctor})
    return a


def _message(news: News2Result, values: dict) -> str:
    shown = [k for k in ("spo2", "hr", "temp") if news.parts.get(k)] or list(news.parts)
    bits = [f"{LABELS[k][0]} {LABELS[k][1].format(values[k])}" for k in shown if values.get(k) is not None]
    return f"NEWS2 {news.score} ({news.severity}): " + ", ".join(bits)


def _trend(db: Session, patient_id: str, device_id: str, values: dict) -> Alert | None:
    if _recent(db, patient_id, "trend"):
        return None
    for param in ("hr", "spo2"):
        value = values.get(param)
        if value is None:
            continue
        col = getattr(Vital, param)
        hist = db.scalars(select(col).where(Vital.patient_id == patient_id, col.is_not(None))
                          .order_by(Vital.ts.desc()).offset(1).limit(TREND_WINDOW)).all()
        z = trend_z([float(h) for h in hist], float(value))
        if z is not None and abs(z) >= TREND_Z:
            label, fmt = LABELS[param]
            direction = "above" if z > 0 else "below"
            msg = f"{label} {fmt.format(value)} is {abs(z):.1f} SD {direction} this patient's recent baseline"
            return create_alert(db, patient_id, device_id, "trend", "medium", None, msg,
                                {"source": "rules", "method": "z-score", "param": param, "z": round(z, 2),
                                 "window": len(hist), "value": value})
    return None


def on_vital(db: Session, patient_id: str, device_id: str, news: News2Result, hr: int | None,
             spo2: int | None, temp: float | None) -> list[dict]:
    """Alerts for one stored vital: NEWS2 ≥ medium, else a trend alert on HR/SpO2 (|z| ≥ 3)."""
    values = {"hr": hr, "spo2": spo2, "temp": temp}
    created: list[Alert] = []
    if news.severity in ALERTING:
        if not _recent(db, patient_id, "news2", news.severity):
            created.append(create_alert(db, patient_id, device_id, "news2", news.severity, news.score,
                                        _message(news, values),
                                        {"source": "rules", "score": news.score, "severity": news.severity,
                                         "parts": news.parts}))
    else:  # NEWS2 is quiet: the trend catches a drift away from this patient's own baseline
        t = _trend(db, patient_id, device_id, values)
        if t:
            created.append(t)
    return [frame(db, a) for a in created]
