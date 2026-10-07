from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.iot import ingest
from app.models import Alert, AuditLog, Device, MedDose
from app.services import schedule

NOW = int(datetime.now(UTC).timestamp())


def ev(msg_id, type_, **kw):
    return dict({"msg_id": msg_id, "ts": NOW, "type": type_}, **kw)


def today_dose(db, time_="20:00", slot=2):
    return next(d for d in schedule.todays_doses(db, "p-0001") if d.time_of_day == time_ and d.slot == slot)


def test_dose_taken_updates_and_frames(db, seeded):
    d = today_dose(db)
    ingest.handle(db, "bsu-001", "events", ev(1, "dose_dispensed", dose_id=d.id))
    assert db.get(MedDose, d.id).status == "dispensed"
    frames = ingest.handle(db, "bsu-001", "events", ev(2, "dose_taken", dose_id=d.id, method="button"))
    d = db.get(MedDose, d.id)
    assert (d.status, d.taken_method) == ("taken", "button")
    f = frames[0]
    assert f["type"] == "dose_event" and f["scope"]["ward"] == "Cardiology"
    assert f["data"] == {"patient_id": "p-0001", "dose_id": d.id, "status": "taken", "method": "button",
                         "ts": f["data"]["ts"]}


def test_late_missed_does_not_override_taken(db, seeded):
    d = today_dose(db)
    ingest.handle(db, "bsu-001", "events", ev(3, "dose_taken", dose_id=d.id, method="button"))
    assert ingest.handle(db, "bsu-001", "events", ev(4, "dose_missed", dose_id=d.id)) == []
    assert db.get(MedDose, d.id).status == "taken"


def test_dose_missed_alert_and_emit(db, seeded, emitted):
    d = today_dose(db, "08:00", 1)
    frames = ingest.handle(db, "bsu-001", "events", ev(5, "dose_missed", dose_id=d.id))
    assert db.get(MedDose, d.id).status == "missed"
    a = db.scalars(select(Alert).where(Alert.kind == "dose_missed")).one()
    assert a.severity == "medium" and a.patient_id == "p-0001"
    assert {f["type"] for f in frames} == {"dose_event", "alert"}
    event, data = emitted[-1]
    assert event == "dose.missed"
    assert data["dose_id"] == d.id and data["patient_first_name"] == "Amira" and data["bed"] == "C-12"
    assert data["meds"] == ["Amlodipine 5mg"] and data["scheduled_at"].endswith("Z")
    assert {"nurse_chat_ids", "doctor_chat_id", "doctor_email"} <= set(data)


def test_yesterdays_dose_id_maps_to_today(db, seeded):
    d = today_dose(db)
    tomorrow = d.scheduled_at + timedelta(days=1)
    ingest.handle(db, "bsu-001", "events", ev(6, "dose_taken", dose_id=d.id, method="button",
                                              ts=int(tomorrow.timestamp()) + 60))
    later = db.scalars(select(MedDose).where(MedDose.prescription_id == d.prescription_id,
                                             MedDose.scheduled_at == tomorrow, MedDose.slot == d.slot)).one()
    assert later.status == "taken" and db.get(MedDose, d.id).status == "scheduled"


def test_unknown_dose_ignored(db, seeded):
    assert ingest.handle(db, "bsu-001", "events", ev(7, "dose_taken", dose_id="d-999999")) == []


def test_dose_from_wrong_device_ignored(db, seeded):
    d = today_dose(db)
    assert ingest.handle(db, "bsu-002", "events", ev(8, "dose_taken", dose_id=d.id)) == []
    assert db.get(MedDose, d.id).status == "scheduled"


def test_call_nurse(db, seeded, emitted):
    frames = ingest.handle(db, "bsu-001", "events", ev(9, "call_nurse"))
    a = db.scalars(select(Alert).where(Alert.kind == "call_nurse")).one()
    assert a.severity == "high" and a.device_id == "bsu-001"
    cn = next(f for f in frames if f["type"] == "call_nurse")
    assert cn["data"]["bed"] == "C-12" and cn["data"]["patient_id"] == "p-0001"
    assert any(f["type"] == "alert" for f in frames)
    assert emitted[-1][0] == "alert.critical"


def test_nurse_tap_audited(db, seeded):
    ingest.handle(db, "bsu-001", "events", ev(10, "nurse_tap", rfid_uid="04A1B2C3"))
    row = db.scalars(select(AuditLog).order_by(AuditLog.id.desc())).first()
    assert (row.user_id, row.action, row.patient_id, row.resource) == ("u-0002", "read", "p-0001", "nurse_tap")


def test_schedule_ack(db, seeded):
    ingest.handle(db, "bsu-001", "events", ev(11, "schedule_ack", schedule_version=3))
    assert db.get(Device, "bsu-001").schedule_acked_version == 3
    ingest.handle(db, "bsu-001", "events", ev(12, "schedule_ack", schedule_version=2))
    assert db.get(Device, "bsu-001").schedule_acked_version == 3
