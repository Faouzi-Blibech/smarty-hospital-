"""Patient assistant (plans/FAOUZI.md Task 11): answers from the caller's own record only, never diagnoses."""

from datetime import UTC, datetime
from types import SimpleNamespace as NS

import pytest

from app.ai import assistant as A
from app.ai.llm import LLMUnavailable

NOW = datetime(2026, 10, 8, 10, 30, tzinfo=UTC)  # 11:30 in Tunis


def ctx():
    patient = NS(first_name="Amira", last_name="Ben Salah")
    doses = [NS(time_of_day="08:00", meds=["Paracetamol 500mg"], status="taken"),
             NS(time_of_day="14:00", meds=["Amoxicillin 1g"], status="scheduled"),
             NS(time_of_day="20:00", meds=["Paracetamol 500mg"], status="scheduled")]
    visit = NS(slot_at=datetime(2026, 10, 12, 9, 0, tzinfo=UTC), status="confirmed")
    vital = NS(hr=82, spo2=97, temp=37.1, ts=datetime(2026, 10, 8, 10, 0, tzinfo=UTC))
    return A.assistant_context(patient, doses, visit, vital, now=NOW)


@pytest.fixture()
def llm_down(monkeypatch):
    def boom(*a, **k):
        raise LLMUnavailable("down")
    monkeypatch.setattr(A, "complete_json", boom)


def test_context_picks_next_scheduled_dose_and_formats_tunis_time():
    c = ctx()
    assert c["next_dose"] == {"time": "14:00", "meds": ["Amoxicillin 1g"]}
    assert c["next_visit"] == "Monday 12 Oct at 10:00"
    assert c["latest_vitals"] == {"hr": 82, "spo2": 97, "temp": 37.1, "at": "11:00"}
    assert c["names"] == ["Amira", "Ben Salah"]


def test_red_flag_question_goes_to_staff_without_llm(monkeypatch):
    def must_not_call(*a, **k):
        raise AssertionError("LLM must not be called for a red-flag question")
    monkeypatch.setattr(A, "complete_json", must_not_call)
    out = A.answer("J'ai une douleur thoracique depuis 10 minutes", ctx())
    assert "call-nurse button" in out["answer"] and out["sources"] == ["safety_rules"]


@pytest.mark.parametrize("q", ["When is my next dose?", "C'est quand mon prochain médicament ?", "وقتاش الدواء الجاي"])
def test_fallback_next_dose(llm_down, q):
    out = A.answer(q, ctx())
    assert "14:00" in out["answer"] and "Amoxicillin 1g" in out["answer"] and out["sources"] == ["med_doses"]


@pytest.mark.parametrize("q", ["When is my next appointment?", "mon prochain rendez-vous", "وقتاش الموعد"])
def test_fallback_next_visit(llm_down, q):
    out = A.answer(q, ctx())
    assert "Monday 12 Oct at 10:00" in out["answer"] and out["sources"] == ["appointments"]


def test_fallback_anything_else_points_to_staff(llm_down):
    out = A.answer("Is my illness serious?", ctx())
    assert "nurse" in out["answer"].lower() and out["sources"] == []


def test_llm_path_gets_only_this_patients_context_and_names(monkeypatch):
    seen = {}

    def fake(prompt_name, user_text, schema, **kw):
        seen.update(text=user_text, names=list(kw.get("names", [])))
        return schema(answer="Your next dose is at 14:00.", sources=["med_doses"])

    monkeypatch.setattr(A, "complete_json", fake)
    out = A.answer("next dose?", ctx())
    assert out == {"answer": "Your next dose is at 14:00.", "sources": ["med_doses"]}
    assert "Amoxicillin 1g" in seen["text"] and seen["names"] == ["Amira", "Ben Salah"]


def test_llm_sources_are_restricted_to_known_ones(monkeypatch):
    monkeypatch.setattr(A, "complete_json",
                        lambda *a, **k: k.get("schema", a[2])(answer="ok", sources=["med_doses", "other_patients"]))
    assert A.answer("hi", ctx())["sources"] == ["med_doses"]


def test_context_without_data():
    c = A.assistant_context(NS(first_name="X", last_name="Y"), [], None, None, now=NOW)
    assert c["next_dose"] is None and c["next_visit"] is None and c["latest_vitals"] is None
