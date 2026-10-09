from datetime import UTC, datetime
from types import SimpleNamespace as NS

import pytest

from app.services import exams as E

NOW = datetime(2026, 10, 9, 9, 0, tzinfo=UTC)


def row(status="suggested", **kw):
    return NS(status=status, human_confirmed_by=None, ordered_at=None, done_at=None, **kw)


def test_status_machine():
    o = row()
    E.order(o, user_id="u-0001", now=NOW)
    assert (o.status, o.human_confirmed_by, o.ordered_at) == ("ordered", "u-0001", NOW)
    E.mark_done(o, now=NOW)
    assert o.status == "done" and o.done_at == NOW
    for bad in (lambda: E.order(o, user_id="u", now=NOW), lambda: E.cancel(o), lambda: E.mark_done(o, now=NOW)):
        with pytest.raises(E.BadStatus):
            bad()
    with pytest.raises(E.BadStatus):
        E.mark_done(row("suggested"), now=NOW)
    c = row("ordered")
    E.cancel(c)
    assert c.status == "cancelled"


def test_counts_ignore_cancelled():
    rows = [row("suggested"), row("ordered"), row("done"), row("done"), row("cancelled")]
    assert E.counts(rows) == {"exams_total": 3, "exams_done": 2, "exams_suggested": 1}


def test_suggested_fields():
    sug = {"exams": [{"code": "ecg", "label": "ECG (12-lead)", "department": "Cardiology"}], "bundles": ["chest_pain"],
           "source": "rules"}
    [f] = E.suggested_fields("p-0003", "a-0001", sug)
    assert f["status"] == "suggested" and f["code"] == "ecg" and f["appointment_id"] == "a-0001"
    assert f["ai_suggested"] == {"source": "rules", "bundles": ["chest_pain"],
                                 "reason": "Suggested by the exam rules for: chest_pain"}


def test_safe_name():
    assert E.safe_name("../../etc/passwd") == "passwd"
    assert E.safe_name("ECG résultat 1.pdf") == "ECG_r_sultat_1.pdf"
    assert E.safe_name("") == "file"


def test_ordered_event_has_first_name_only():
    p = NS(first_name="Amira", last_name="Ben Salah", telegram_chat_id="42", email="a@x.tn")
    ev = E.ordered_event(p, "a-0001", [NS(label="Chest X-ray", department="Imaging")])
    assert ev == {"appointment_id": "a-0001", "patient_first_name": "Amira", "patient_telegram_chat_id": "42",
                  "patient_email": "a@x.tn", "exams": [{"label": "Chest X-ray", "department": "Imaging"}]}
