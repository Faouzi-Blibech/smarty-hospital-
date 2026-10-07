from sqlalchemy import select

from app.ids import new_id
from app.models import Admission, Appointment, Patient, Prescription, Staff, User, Vital
from app.seed import seed


def test_seed_matches_contract(db):
    seed(db)
    users = {u.email: u for u in db.scalars(select(User))}
    assert users["doctor@ward.tn"].id == "u-0001" and users["doctor@ward.tn"].role == "doctor"
    assert users["patient@ward.tn"].patient_id == "p-0001"
    assert db.get(Staff, "u-0002").rfid_uid == "04A1B2C3"
    assert db.query(Patient).count() == 12
    cardio = db.scalars(select(Patient).where(Patient.ward == "Cardiology")).all()
    assert {p.id for p in cardio} == {f"p-000{i}" for i in range(1, 7)}
    assert all(p.attending_doctor_id == "u-0001" for p in cardio)
    adm = db.scalars(select(Admission).where(Admission.discharged_at.is_(None))).one()
    assert (adm.patient_id, adm.device_id, adm.bed) == ("p-0001", "bsu-001", "C-12")
    assert db.query(Vital).filter_by(patient_id="p-0001").count() == 48 * 4
    assert db.query(Prescription).filter_by(patient_id="p-0001", active=True).count() == 1
    appts = db.scalars(select(Appointment)).all()
    assert len(appts) == 10 and len({a.urgency_ai for a in appts}) >= 3
    assert all(a.ai_suggested["source"] in ("model", "rules") for a in appts)


def test_seed_is_idempotent(db):
    seed(db)
    seed(db)
    assert db.query(Patient).count() == 12


def test_seed_advances_sequences(db):
    seed(db)
    assert int(new_id(db, "p")[2:]) > 12


def test_seed_generates_doses(db):
    from app.models import MedDose

    seed(db)
    # rx-0001: Amlodipine 08:00 × 5 days + Paracetamol 08:00/20:00 × 5 days
    assert db.query(MedDose).filter_by(prescription_id="rx-0001").count() == 15
