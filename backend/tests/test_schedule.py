import json
from datetime import timedelta

from app.models import Device, MedDose, Prescription
from app.services import schedule


def make_rx(db, rx_id="rx-9001", items=None):
    rx = Prescription(id=rx_id, patient_id="p-0001", doctor_id="u-0001", active=True, care_plan="",
                      items=items or [{"med": "Paracetamol 500mg", "times": ["08:00", "20:00"], "slot": 1,
                                       "days": 2}])
    db.add(rx)
    db.flush()
    return rx


def test_rebuild_doses_days_times(db, seeded):
    doses = schedule.rebuild_doses(db, make_rx(db))
    assert len(doses) == 4 and {d.time_of_day for d in doses} == {"08:00", "20:00"}
    first = min(doses, key=lambda d: d.scheduled_at)
    local = first.scheduled_at.astimezone(schedule.TUNIS)
    assert local.date() == schedule.today_local() and local.strftime("%H:%M") == "08:00"
    assert all(d.id.startswith("d-") and len(d.id) == 8 and d.status == "scheduled" for d in doses)


def test_rebuild_is_idempotent(db, seeded):
    rx = make_rx(db)
    schedule.rebuild_doses(db, rx)
    schedule.rebuild_doses(db, rx)
    assert db.query(MedDose).filter_by(prescription_id="rx-9001").count() == 4


def test_deactivate_drops_future_scheduled(db, seeded):
    rx = make_rx(db)
    schedule.rebuild_doses(db, rx)
    rx.active = False
    schedule.rebuild_doses(db, rx)
    left = db.query(MedDose).filter_by(prescription_id="rx-9001").all()
    assert all(d.scheduled_at <= schedule.now_utc() for d in left)


def test_payload_shape(db, seeded):
    schedule.rebuild_doses(db, make_rx(db))
    p = schedule.build_schedule_payload(db, "p-0001")
    assert p["patient_id"] == "p-0001" and p["patient_first_name"] == "Amira"
    assert all({"dose_id", "time", "meds", "slot"} <= set(d) for d in p["doses"])
    assert [d["time"] for d in p["doses"]] == sorted(d["time"] for d in p["doses"])
    assert len(p["doses"]) <= 8


def test_payload_merges_same_time_and_slot(db, seeded):
    make_rx(db, "rx-9002", [{"med": "A", "times": ["09:00"], "slot": 3, "days": 1},
                            {"med": "B", "times": ["09:00"], "slot": 3, "days": 1}])
    schedule.rebuild_doses(db, db.get(Prescription, "rx-9002"))
    entry = next(d for d in schedule.build_schedule_payload(db, "p-0001")["doses"] if d["time"] == "09:00")
    assert entry["meds"] == ["A", "B"] and entry["slot"] == 3


def test_payload_fits_mqtt_limit(db, seeded):
    make_rx(db, "rx-9003", [{"med": f"Medicine number {i} 500mg", "times": [f"{8 + i:02d}:00"], "slot": None,
                             "days": 1} for i in range(12)])
    schedule.rebuild_doses(db, db.get(Prescription, "rx-9003"))
    p = schedule.build_schedule_payload(db, "p-0001")
    assert len(p["doses"]) == 8
    assert len(json.dumps(dict(p, schedule_version=99999), ensure_ascii=False).encode()) <= 1024


def test_unassigned_payload(db):
    p = schedule.build_schedule_payload(db, None)
    assert p["patient_id"] is None and p["doses"] == []


def test_push_bumps_version_and_publishes_retained(db, seeded, published):
    schedule.rebuild_doses(db, make_rx(db))
    assert schedule.push_schedule(db, "p-0001") is True
    topic, payload, qos, retain = published[-1]
    assert topic == "hospital/device/bsu-001/schedule" and qos == 1 and retain is True
    assert payload["schedule_version"] == db.get(Device, "bsu-001").schedule_version == 1


def test_push_without_device(db, seeded, published):
    assert schedule.push_schedule(db, "p-0002") is False and published == []


def test_today_local_is_tunis():
    assert schedule.TUNIS.utcoffset(None) == timedelta(hours=1)
