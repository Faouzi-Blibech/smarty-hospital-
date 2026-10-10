from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import AuditLog, Staff, User
from tests.helpers import login, make_user


def _ids(r):
    assert r.status_code == 200, r.text
    return {row["id"] for row in r.json()}


def test_admin_sees_all_pending_doctor_only_his(client, db):
    a = make_user(db, "a.t@ward.tn", role=None, status="pending", requested_doctor_id="u-0001")
    b = make_user(db, "b.t@ward.tn", role=None, status="pending")
    admin, doc = login(client, "admin@ward.tn"), login(client, "doctor@ward.tn")
    assert {a.id, b.id} <= _ids(client.get("/users", headers=admin))
    assert _ids(client.get("/users", headers=doc)) == {a.id}
    assert client.get("/users", headers=login(client, "nurse@ward.tn")).status_code == 403


def test_admin_approves_with_role_and_ward(client, db):
    b = make_user(db, "b.t@ward.tn", role=None, status="pending")
    r = client.post(f"/users/{b.id}/approve", headers=login(client, "admin@ward.tn"),
                    json={"role": "nurse", "ward": "Internal Medicine"})
    assert r.status_code == 200 and r.json()["status"] == "active" and r.json()["ward"] == "Internal Medicine"
    h = login(client, "b.t@ward.tn")
    assert {p["ward"] for p in client.get("/patients", headers=h).json()} <= {"Internal Medicine"}


def test_admin_approving_a_team_request_as_nurse_keeps_the_doctor(client, db):
    a = make_user(db, "a.t@ward.tn", role=None, status="pending", requested_doctor_id="u-0001")
    client.post(f"/users/{a.id}/approve", headers=login(client, "admin@ward.tn"), json={"role": "nurse"})
    assert db.get(Staff, a.id).supervisor_id == "u-0001"


def test_doctor_approves_his_request_into_his_team(client, db):
    a = make_user(db, "a.t@ward.tn", role=None, status="pending", requested_doctor_id="u-0001")
    r = client.post(f"/users/{a.id}/approve", headers=login(client, "doctor@ward.tn"),
                    json={"role": "nurse", "ward": "Imaging"})
    assert r.status_code == 200
    out = r.json()
    assert (out["role"], out["supervisor_id"], out["ward"]) == ("nurse", "u-0001", None)  # ward ignored for doctors


def test_doctor_limits(client, db):
    a = make_user(db, "a.t@ward.tn", role=None, status="pending", requested_doctor_id="u-0001")
    b = make_user(db, "b.t@ward.tn", role=None, status="pending")
    doc = login(client, "doctor@ward.tn")
    assert client.post(f"/users/{b.id}/approve", headers=doc, json={"role": "nurse"}).status_code == 403
    for role in ("doctor", "admin"):
        assert client.post(f"/users/{a.id}/approve", headers=doc, json={"role": role}).status_code == 403


def test_approve_twice_is_409_and_bad_role_is_422(client, db):
    b = make_user(db, "b.t@ward.tn", role=None, status="pending")
    admin = login(client, "admin@ward.tn")
    assert client.post(f"/users/{b.id}/approve", headers=admin, json={"role": "patient"}).status_code == 422
    assert client.post(f"/users/{b.id}/approve", headers=admin, json={"role": "nurse"}).status_code == 200
    assert client.post(f"/users/{b.id}/approve", headers=admin, json={"role": "nurse"}).status_code == 409


def test_reject_then_approve_later(client, db):
    b = make_user(db, "b.t@ward.tn", role=None, status="pending")
    admin = login(client, "admin@ward.tn")
    assert client.post(f"/users/{b.id}/reject", headers=admin).json()["status"] == "rejected"
    assert client.post("/auth/login", json={"email": "b.t@ward.tn", "password": "ward1234"}).json()["code"] == \
        "account_rejected"
    assert client.post(f"/users/{b.id}/approve", headers=admin, json={"role": "nurse"}).status_code == 200


def test_doctor_disables_only_his_team(client, db):
    team = make_user(db, "team.t@ward.tn", role="nurse", supervisor_id="u-0001")
    doc, admin = login(client, "doctor@ward.tn"), login(client, "admin@ward.tn")
    assert client.post(f"/users/{team.id}/disable", headers=doc).json()["status"] == "disabled"
    assert client.post("/users/u-0002/disable", headers=doc).status_code == 403
    assert client.post(f"/users/{team.id}/enable", headers=doc).json()["status"] == "active"
    assert client.post("/users/u-0002/disable", headers=admin).json()["status"] == "disabled"
    assert client.post("/users/u-0004/disable", headers=admin).status_code == 403  # not yourself


def test_team_endpoint(client, db):
    team = make_user(db, "team.t@ward.tn", role="nurse", supervisor_id="u-0001")
    assert _ids(client.get("/doctors/me/team", headers=login(client, "doctor@ward.tn"))) == {team.id}


def test_reset_code_flow(client, db):
    r = client.post("/users/u-0002/reset-code", headers=login(client, "admin@ward.tn"))
    assert r.status_code == 200 and len(r.json()["code"]) == 11
    assert client.post("/users/u-0002/reset-code", headers=login(client, "doctor@ward.tn")).status_code == 403


def test_reset_code_clears_lock(client, db):
    db.get(User, "u-0002").locked_until = datetime.now(UTC) + timedelta(minutes=10)
    db.flush()
    code = client.post("/users/u-0002/reset-code", headers=login(client, "admin@ward.tn")).json()["code"]
    assert client.post("/auth/reset", json={"email": "nurse@ward.tn", "code": code,
                                            "new_password": "correct-horse-battery"}).status_code == 204
    assert client.post("/auth/login", json={"email": "nurse@ward.tn",
                                            "password": "correct-horse-battery"}).status_code == 200


def test_admin_actions_are_audited(client, db):
    b = make_user(db, "b.t@ward.tn", role=None, status="pending")
    admin = login(client, "admin@ward.tn")
    client.post(f"/users/{b.id}/approve", headers=admin, json={"role": "nurse"})
    client.post(f"/users/{b.id}/disable", headers=admin)
    rows = db.scalars(select(AuditLog).where(AuditLog.resource == "user", AuditLog.resource_id == b.id)).all()
    assert len([r for r in rows if r.action == "update"]) >= 2


def test_staff_list_has_status(client):
    rows = client.get("/staff", headers=login(client, "admin@ward.tn")).json()
    assert all("status" in r for r in rows)


def test_admin_sets_ward_on_an_active_team_nurse(client, db):
    team = make_user(db, "team.t@ward.tn", role="nurse", supervisor_id="u-0001")
    r = client.patch(f"/users/{team.id}", headers=login(client, "admin@ward.tn"), json={"ward": "Cardiology"})
    assert r.status_code == 200 and (r.json()["ward"], r.json()["supervisor_id"]) == ("Cardiology", "u-0001")
    assert client.patch(f"/users/{team.id}", headers=login(client, "doctor@ward.tn"),
                        json={"ward": None}).status_code == 403
    assert client.patch("/users/u-0004", headers=login(client, "admin@ward.tn"),
                        json={"ward": "Cardiology"}).status_code == 409  # admins have no ward
