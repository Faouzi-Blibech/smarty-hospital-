from datetime import UTC, datetime, timedelta

import pytest

from app.auth import codes, passwords
from app.auth.ratelimit import SlidingWindow
from app.errors import ApiError
from tests.helpers import make_patient


def test_sliding_window_allows_up_to_limit_then_blocks_then_recovers():
    w = SlidingWindow()
    assert all(w.allow("k", 3, 60, now=t) for t in (0, 1, 2))
    assert not w.allow("k", 3, 60, now=3)
    assert w.allow("k", 3, 60, now=61)  # the first hit left the window


def test_keys_are_independent():
    w = SlidingWindow()
    assert w.allow("a", 1, 60, now=0) and w.allow("b", 1, 60, now=0)
    assert not w.allow("a", 1, 60, now=1)


def test_full_peeks_without_counting():
    w = SlidingWindow()
    assert not w.full("k", 2, 60, now=0)
    w.allow("k", 2, 60, now=0)
    assert not w.full("k", 2, 60, now=1)  # peeking did not add a hit
    w.allow("k", 2, 60, now=1)
    assert w.full("k", 2, 60, now=2) and not w.full("k", 2, 60, now=61)


@pytest.mark.parametrize("pw", ["short", "x" * 9])
def test_too_short(pw):
    assert "at least 10" in passwords.password_problem(pw)


def test_over_72_bytes_is_rejected_not_a_crash():
    assert "72" in passwords.password_problem("é" * 40)  # 80 bytes in UTF-8
    with pytest.raises(ApiError) as e:
        passwords.check_password("é" * 40)
    assert e.value.status_code == 422 and e.value.code == "weak_password"


def test_common_password(monkeypatch):
    monkeypatch.setattr(passwords, "_common", lambda: frozenset({"letmein12345"}))
    assert "common" in passwords.password_problem("LetMeIn12345")


def test_email_and_name_are_not_passwords():
    assert passwords.password_problem("amira.bensalah", email="amira.bensalah@ward.tn")
    assert passwords.password_problem("amira.bensalah@ward.tn", email="amira.bensalah@ward.tn")
    assert passwords.password_problem("Amira Ben Salah", name="Amira Ben Salah")
    assert passwords.password_problem("correct-horse-battery", email="a@b.tn", name="A") is None


def test_shipped_list_is_loaded():
    assert len(passwords._common()) >= 900 and "123456" in passwords._common()


def test_code_shape():
    c = codes.new_code()
    assert len(c) == 11 and c[5] == "-" and all(ch in codes.ALPHABET for ch in c.replace("-", ""))


def test_code_normalisation():
    assert codes.code_hash("abcde-fghjk") == codes.code_hash(" ABCDE FGHJK ") == codes.code_hash("ABCDEFGHJK")


def test_issue_find_and_use_once(seeded):
    p = make_patient(seeded, attending="u-0001")
    code, row = codes.issue(seeded, "enrollment", issued_by="u-0004", patient_id=p.id)
    assert row.code_hash != code and row.expires_at > datetime.now(UTC)
    found = codes.find_valid(seeded, "enrollment", code.lower())
    assert found.id == row.id
    codes.mark_used(found, used_by="u-0004")
    seeded.flush()
    assert codes.find_valid(seeded, "enrollment", code) is None


def test_new_code_revokes_previous(seeded):
    p = make_patient(seeded, attending="u-0001")
    first, _ = codes.issue(seeded, "enrollment", issued_by="u-0004", patient_id=p.id)
    second, _ = codes.issue(seeded, "enrollment", issued_by="u-0004", patient_id=p.id)
    assert codes.find_valid(seeded, "enrollment", first) is None
    assert codes.find_valid(seeded, "enrollment", second) is not None


def test_expired_and_wrong_purpose(seeded):
    p = make_patient(seeded, attending="u-0001")
    old, _ = codes.issue(seeded, "enrollment", issued_by="u-0004", patient_id=p.id,
                         now=datetime.now(UTC) - timedelta(hours=49))
    assert codes.find_valid(seeded, "enrollment", old) is None
    fresh, _ = codes.issue(seeded, "enrollment", issued_by="u-0004", patient_id=p.id)
    assert codes.find_valid(seeded, "reset", fresh) is None


def test_reset_code_is_bound_to_its_user(seeded):
    code, _ = codes.issue(seeded, "reset", issued_by="u-0004", user_id="u-0002")
    assert codes.find_valid(seeded, "reset", code, user_id="u-0003") is None
    assert codes.find_valid(seeded, "reset", code, user_id="u-0002") is not None
