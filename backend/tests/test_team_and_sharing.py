from datetime import UTC, datetime, timedelta

from app.models import PatientAccess
from app.services import alerts as AL
from app.ws.hub import Client, wants
from tests.helpers import login, make_patient, make_user


def _setup(db):
    team = make_user(db, "team.t@ward.tn", role="nurse", supervisor_id="u-0001")
    doc2 = make_user(db, "doc2.t@ward.tn", role="doctor", ward="Cardiology")
    mine = make_patient(db, attending="u-0001", ward="Cardiology")
    theirs = make_patient(db, attending=doc2.id, ward="Cardiology")
    return team, doc2, mine, theirs


def test_team_nurse_sees_only_her_doctors_patients(client, db):
    _, _, mine, theirs = _setup(db)
    h = login(client, "team.t@ward.tn")
    assert client.get(f"/patients/{mine.id}", headers=h).status_code == 200
    assert client.get(f"/patients/{theirs.id}", headers=h).status_code == 403
    ids = {r["id"] for r in client.get("/patients", headers=h).json()}
    assert mine.id in ids and theirs.id not in ids


def test_team_nurse_gets_her_doctors_alerts_only(client, db):
    _, _, mine, theirs = _setup(db)
    a1 = AL.create_alert(db, mine.id, None, "trend", "medium", None, "test mine", None)
    a2 = AL.create_alert(db, theirs.id, None, "trend", "medium", None, "test theirs", None)
    ids = {a["id"] for a in client.get("/alerts", headers=login(client, "team.t@ward.tn")).json()}
    assert a1.id in ids and a2.id not in ids


def test_team_nurse_ward_screens_are_empty_not_errors(client, db):
    _setup(db)
    h = login(client, "team.t@ward.tn")
    assert client.get("/exams", headers=h).json() == []
    r = client.get("/patients?ward=Nowhere", headers=h)
    assert r.status_code == 200 and r.json() == []


def test_ward_nurse_unchanged(client):
    rows = client.get("/patients", headers=login(client, "nurse@ward.tn")).json()
    assert rows and {r["ward"] for r in rows} == {"Cardiology"}


def test_ws_routes_doctor_frames_to_his_team_nurse():
    team = Client(ws=None, user_id="u-x", role="nurse", ward=None, supervisor_id="u-0001")
    assert wants(team, {"type": "alert", "scope": {"ward": "Cardiology", "doctor_id": "u-0001"}})
    assert not wants(team, {"type": "alert", "scope": {"ward": "Cardiology", "doctor_id": "u-0999"}})
    ward_nurse = Client(ws=None, user_id="u-y", role="nurse", ward="Cardiology")
    assert wants(ward_nurse, {"type": "alert", "scope": {"ward": "Cardiology", "doctor_id": "u-0999"}})


def test_share_gives_access_until_revoked(client, db):
    _, doc2, _, _ = _setup(db)
    h2, h1 = login(client, "doc2.t@ward.tn"), login(client, "doctor@ward.tn")
    assert client.get("/patients/p-0001", headers=h2).status_code == 403
    r = client.post("/patients/p-0001/access", headers=h1, json={"doctor_id": doc2.id})
    assert r.status_code == 200 and r.json()["doctor_id"] == doc2.id
    assert client.get("/patients/p-0001", headers=h2).status_code == 200
    assert "p-0001" in {p["id"] for p in client.get("/patients", headers=h2).json()}
    assert [g["doctor_id"] for g in client.get("/patients/p-0001/access", headers=h1).json()] == [doc2.id]
    assert client.delete(f"/patients/p-0001/access/{doc2.id}", headers=h1).status_code == 204
    assert client.get("/patients/p-0001", headers=h2).status_code == 403


def test_expired_grant_gives_nothing(client, db):
    _, doc2, _, _ = _setup(db)
    now = datetime.now(UTC)
    db.add(PatientAccess(id="pa-9001", patient_id="p-0001", user_id=doc2.id, granted_by="u-0001",
                         created_at=now - timedelta(days=31), expires_at=now - timedelta(days=1)))
    db.flush()
    assert client.get("/patients/p-0001", headers=login(client, "doc2.t@ward.tn")).status_code == 403


def test_only_attending_or_admin_can_share(client, db):
    _, doc2, _, _ = _setup(db)
    body = {"doctor_id": doc2.id}
    assert client.post("/patients/p-0001/access", headers=login(client, "doc2.t@ward.tn"), json=body).status_code == 403
    assert client.post("/patients/p-0001/access", headers=login(client, "nurse@ward.tn"), json=body).status_code == 403
    assert client.post("/patients/p-0001/access", headers=login(client, "admin@ward.tn"), json=body).status_code == 200


def test_share_validation(client, db):
    _, doc2, _, _ = _setup(db)
    h1 = login(client, "doctor@ward.tn")
    far = (datetime.now(UTC) + timedelta(days=400)).isoformat()
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    for body in ({"doctor_id": doc2.id, "expires_at": far}, {"doctor_id": doc2.id, "expires_at": past},
                 {"doctor_id": "u-0002"}, {"doctor_id": "u-0001"}):
        assert client.post("/patients/p-0001/access", headers=h1, json=body).status_code == 422, body
