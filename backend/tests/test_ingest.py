from datetime import UTC, datetime

from app.iot import ingest
from app.models import Device, IngestedMessage, Vital

V = {"msg_id": 1, "ts": 1759680000, "patient_id": "p-0001", "hr": 80, "spo2": 98, "temp": 36.9}


def _at(db, ts, device="bsu-001"):
    return db.query(Vital).filter_by(device_id=device, ts=datetime.fromtimestamp(ts, UTC))


def test_vitals_stored_with_news2(db, seeded):
    frames = ingest.handle(db, "bsu-001", "vitals", dict(V))
    v = _at(db, V["ts"]).one()
    assert v.hr == 80 and v.news2 == 0 and v.patient_id == "p-0001"
    f = frames[0]
    assert f["type"] == "vital"
    assert f["data"] == {"patient_id": "p-0001", "device_id": "bsu-001", "ts": "2025-10-05T16:00:00Z",
                         "hr": 80, "spo2": 98, "temp": 36.9, "news2": 0}
    assert f["scope"] == {"patient_id": "p-0001", "ward": "Cardiology", "doctor_id": "u-0001"}


def test_duplicate_msg_id_ignored(db, seeded):
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=77, ts=1759681111))
    frames = ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=77, ts=1759681111))
    assert frames == []
    assert _at(db, 1759681111).count() == 1
    assert db.query(IngestedMessage).filter_by(device_id="bsu-001", msg_id=77).count() == 1


def test_same_msg_id_other_device_is_new(db, seeded):
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=78, ts=1759681200))
    assert ingest.handle(db, "bsu-002", "vitals", dict(V, msg_id=78, ts=1759681200, patient_id=None))


def test_same_second_two_messages_no_crash(db, seeded):
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=90, ts=1759689000))
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=91, ts=1759689000, hr=81))
    assert _at(db, 1759689000).count() == 1


def test_vitals_without_patient(db, seeded):
    frames = ingest.handle(db, "bsu-009", "vitals", dict(V, msg_id=5, patient_id=None, hr=150, spo2=85))
    assert all(f["type"] != "alert" for f in frames)
    v = _at(db, V["ts"], "bsu-009").one()
    assert v.patient_id is None and v.news2 is not None
    assert db.get(Device, "bsu-009").online is True  # auto-registered


def test_null_fields_stored(db, seeded):
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=8, ts=1759684444, hr=None, temp=None))
    v = _at(db, 1759684444).one()
    assert v.hr is None and v.temp is None and v.spo2 == 98 and v.news2 == 0


def test_unknown_rfid_kept(db, seeded):
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=6, ts=1759682222, nurse_rfid="DEADBEEF"))
    assert _at(db, 1759682222).one().nurse_id is None


def test_known_rfid_resolves_nurse(db, seeded):
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=7, ts=1759683333, nurse_rfid="04a1b2c3"))
    assert _at(db, 1759683333).one().nurse_id == "u-0002"


def test_simulated_vitals_are_labelled(db, seeded):
    ingest.handle(db, "bsu-001", "vitals", dict(V, msg_id=9, ts=1759685555))
    assert _at(db, 1759685555).one().source == "simulator"


def test_status_updates_device(db, seeded):
    frames = ingest.handle(db, "bsu-001", "status", {"online": False, "fw_version": "0.1.0"})
    d = db.get(Device, "bsu-001")
    assert d.online is False and d.fw_version == "0.1.0" and d.last_seen is not None
    st = next(f for f in frames if f["type"] == "device_status")
    assert st["data"]["device_id"] == "bsu-001" and st["data"]["online"] is False
    assert st["scope"]["ward"] == "Cardiology"


def test_bad_payload_ignored(db, seeded):
    assert ingest.handle(db, "bsu-001", "vitals", {"msg_id": "x"}) == []
    assert ingest.handle(db, "bsu-001", "nonsense", dict(V, msg_id=11)) == []
