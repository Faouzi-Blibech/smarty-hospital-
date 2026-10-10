from sqlalchemy import func, select

from app.auth import codes
from app.models import AccessCode, User
from tests.helpers import login

GOOD = "correct-horse-battery"


def _reg(client, **body):
    base = {"name": "Amira Test", "email": "amira.t@ward.tn", "password": GOOD, "role": "nurse"}
    return client.post("/auth/register", json={**base, **body})


def _user(db, email):
    return db.scalar(select(User).where(User.email == email))


def test_register_creates_pending_account_without_role(client, db):
    r = _reg(client, note="nurse, Cardiology")
    assert r.status_code == 202 and r.json()["status"] == "received"
    u = _user(db, "amira.t@ward.tn")
    assert u.status == "pending" and u.role is None and u.requested_note == "nurse, Cardiology"
    assert client.post("/auth/login", json={"email": "amira.t@ward.tn", "password": GOOD}).json()["code"] == \
        "account_pending"


def test_email_is_normalised(client, db):
    assert _reg(client, email="  Amira.T@Ward.TN ").status_code == 202
    assert _user(db, "amira.t@ward.tn") is not None


def test_ward_in_body_is_refused(client):
    assert _reg(client, ward="Cardiology").status_code == 422


def test_enrollment_code_field_is_gone(client):
    assert _reg(client, enrollment_code="AAAAA-BBBBB").status_code == 422


def test_each_role_is_recorded_as_a_request(client, db):
    for role in ("patient", "nurse", "doctor"):
        email = f"{role}.t@ward.tn"
        assert _reg(client, email=email, role=role).status_code == 202
        u = _user(db, email)
        assert (u.requested_role, u.role, u.status) == (role, None, "pending")


def test_role_is_required_and_admin_cannot_be_requested(client):
    body = {"name": "Amira Test", "email": "amira.t@ward.tn", "password": GOOD}
    assert client.post("/auth/register", json=body).status_code == 422  # no role
    for bad in ("admin", "", "Nurse", None):
        assert _reg(client, role=bad).status_code == 422


def test_a_doctor_request_cannot_name_a_doctor(client, db):
    r = _reg(client, role="doctor", requested_doctor_id="u-0001")
    assert r.status_code == 422 and r.json()["code"] == "invalid"
    assert _user(db, "amira.t@ward.tn") is None
    assert _reg(client, role="doctor", requested_doctor_id=None).status_code == 202


def test_patient_and_nurse_may_pick_a_doctor(client, db):
    for role in ("patient", "nurse"):
        assert _reg(client, email=f"{role}.t@ward.tn", role=role, requested_doctor_id="u-0001").status_code == 202
        assert _user(db, f"{role}.t@ward.tn").requested_doctor_id == "u-0001"


def test_hospital_name_is_public_and_comes_from_the_setting(client, monkeypatch):
    from app.config import get_settings

    assert client.get("/hospital").json() == {"name": "Ward Hospital"}
    monkeypatch.setenv("HOSPITAL_NAME", "Hopital Habib Bourguiba")
    get_settings.cache_clear()
    assert client.get("/hospital").json() == {"name": "Hopital Habib Bourguiba"}


def test_hospital_shares_the_directory_limit(client):
    assert [client.get("/hospital").status_code for _ in range(30)] == [200] * 30
    assert client.get("/hospital").status_code == 429


def test_existing_email_same_answer_no_duplicate(client, db):
    r = _reg(client, email="doctor@ward.tn")
    assert r.status_code == 202 and r.json() == _reg(client, email="other.t@ward.tn").json()
    assert db.scalar(select(func.count()).select_from(User).where(User.email == "doctor@ward.tn")) == 1


def test_weak_and_too_long_passwords(client):
    for pw in ("short", "é" * 40):
        r = _reg(client, password=pw)
        assert r.status_code == 422 and r.json()["code"] == "weak_password"


def test_requested_doctor_recorded_only_if_active_doctor(client, db):
    _reg(client, email="a1@ward.tn", requested_doctor_id="u-0001")
    _reg(client, email="a2@ward.tn", requested_doctor_id="u-0002")  # a nurse, ignored
    assert _user(db, "a1@ward.tn").requested_doctor_id == "u-0001"
    assert _user(db, "a2@ward.tn").requested_doctor_id is None


def test_register_rate_limit(client):
    statuses = [_reg(client, email=f"rl{i}@ward.tn", password="short").status_code for i in range(6)]
    assert statuses[:5] == [422] * 5 and statuses[5] == 429


def test_reset_with_code(client, db):
    code, _ = codes.issue(db, "reset", issued_by="u-0004", user_id="u-0002")
    r = client.post("/auth/reset", json={"email": "nurse@ward.tn", "code": code, "new_password": GOOD})
    assert r.status_code == 204
    assert client.post("/auth/login", json={"email": "nurse@ward.tn", "password": GOOD}).status_code == 200
    again = client.post("/auth/reset", json={"email": "nurse@ward.tn", "code": code, "new_password": GOOD + "x"})
    assert again.status_code == 400 and again.json()["code"] == "invalid_code"


def test_reset_weak_password_does_not_burn_the_code(client, db):
    code, row = codes.issue(db, "reset", issued_by="u-0004", user_id="u-0002")
    r = client.post("/auth/reset", json={"email": "nurse@ward.tn", "code": code, "new_password": "short"})
    assert r.status_code == 422 and db.get(AccessCode, row.id).used_at is None


def test_change_password(client):
    h = login(client, "nurse@ward.tn")
    bad = client.post("/auth/change-password", headers=h, json={"current_password": "nope-nope-1", "new_password": GOOD})
    assert bad.status_code == 401
    ok = client.post("/auth/change-password", headers=h, json={"current_password": "ward1234", "new_password": GOOD})
    assert ok.status_code == 204
    assert client.post("/auth/login", json={"email": "nurse@ward.tn", "password": GOOD}).status_code == 200


def test_doctor_directory_lists_active_doctors_names_only(client):
    rows = client.get("/doctors/directory").json()
    assert {"id": "u-0001", "name": "Dr Trabelsi"} in rows
    assert all(set(r) == {"id", "name"} for r in rows)


def test_change_password_is_rate_limited(client):
    h = login(client, "nurse@ward.tn")
    bad = {"current_password": "nope-nope-1", "new_password": GOOD}
    assert [client.post("/auth/change-password", headers=h, json=bad).status_code for _ in range(10)] == [401] * 10
    assert client.post("/auth/change-password", headers=h, json=bad).status_code == 429


def test_reset_unknown_email_is_invalid_code(client):
    r = client.post("/auth/reset", json={"email": "nobody@ward.tn", "code": "AAAAA-BBBBB", "new_password": GOOD})
    assert r.status_code == 400 and r.json()["code"] == "invalid_code"


def test_reset_code_for_another_user_is_refused(client, db):
    code, row = codes.issue(db, "reset", issued_by="u-0004", user_id="u-0002")
    r = client.post("/auth/reset", json={"email": "doctor@ward.tn", "code": code, "new_password": GOOD})
    assert r.status_code == 400 and r.json()["code"] == "invalid_code"
    assert db.get(AccessCode, row.id).used_at is None
