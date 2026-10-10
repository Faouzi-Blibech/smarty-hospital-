from tests.helpers import login, make_patient, make_user

GOOD = "correct-horse-battery"


def _issue(client, h, pid):
    return client.post(f"/patients/{pid}/enrollment-code", headers=h)


def _register(client, email, code):
    return client.post("/auth/register", json={"name": "Pat", "email": email, "password": GOOD,
                                               "enrollment_code": code})


def test_attending_doctor_issues_and_patient_enrolls(client, db):
    p = make_patient(db, attending="u-0001")
    r = _issue(client, login(client, "doctor@ward.tn"), p.id)
    assert r.status_code == 200 and "expires_at" in r.json()
    assert _register(client, "pat1.t@ward.tn", r.json()["code"]).status_code == 202


def test_other_doctor_nurse_and_patient_cannot_issue(client, db):
    p = make_patient(db, attending="u-0001")
    make_user(db, "doc2.t@ward.tn", role="doctor", ward="Cardiology")
    for email in ("doc2.t@ward.tn", "nurse@ward.tn", "patient@ward.tn"):
        assert _issue(client, login(client, email), p.id).status_code == 403


def test_admin_new_code_revokes_old(client, db):
    p = make_patient(db, attending="u-0001")
    admin = login(client, "admin@ward.tn")
    first, second = _issue(client, admin, p.id).json()["code"], _issue(client, admin, p.id).json()["code"]
    assert _register(client, "pat2.t@ward.tn", first).json()["code"] == "invalid_code"
    assert _register(client, "pat3.t@ward.tn", second).status_code == 202


def test_enrolled_patient_gets_409(client):
    r = _issue(client, login(client, "admin@ward.tn"), "p-0001")
    assert r.status_code == 409 and r.json()["code"] == "already_enrolled"


def test_unknown_patient_404(client):
    assert _issue(client, login(client, "admin@ward.tn"), "p-9999").status_code == 404


def test_patient_password_reset_code_from_attending_or_admin(client, db):
    # patient@ward.tn owns p-0001, whose attending doctor is u-0001
    r = client.post("/patients/p-0001/reset-code", headers=login(client, "doctor@ward.tn"))
    assert r.status_code == 200
    assert client.post("/auth/reset", json={"email": "patient@ward.tn", "code": r.json()["code"],
                                            "new_password": GOOD}).status_code == 204
    assert client.post("/patients/p-0001/reset-code", headers=login(client, "nurse@ward.tn")).status_code == 403
    p = make_patient(db, attending="u-0001")  # no account yet
    assert client.post(f"/patients/{p.id}/reset-code", headers=login(client, "admin@ward.tn")).status_code == 404
