"""Safety probes from the 2026-10-10 review: emergencies the rules must catch, LLM output checks, PII."""

import pytest

from app.ai import assistant, copilot, llm
from app.ai.triage import match_red_flags, triage

CTX = {"next_dose": {"time": "20:00", "meds": ["Paracetamol 1g"]}, "next_visit": None, "latest_vitals": None,
       "names": ["Amira", "Ben Salah"]}


@pytest.mark.parametrize("text, flag", [
    ("patient a fait une tentative de suicide hier", "suicide_self_harm"),
    ("I want to kill myself, I have pills ready", "suicide_self_harm"),
    ("بدي ننتحر", "suicide_self_harm"),
    ("nheb nmout, ma 3adch najjam", "suicide_self_harm"),
    ("crise convulsive ce matin", "seizure"),
    ("he had a seizure at school", "seizure"),
    ("took 30 paracetamol tablets", "overdose"),
    ("a avalé 20 comprimés de doliprane", "overdose"),
    ("my throat is swelling after the medication", "anaphylaxis"),
    ("lèvres gonflées et gorge serrée après l'injection", "anaphylaxis"),
    ("I took double my dose by mistake", "medication_error"),
])
def test_emergencies_raise_a_red_flag(text, flag):
    assert flag in [f["id"] for f in match_red_flags(text)]
    assert triage(text, [], age=40).urgency >= 4


@pytest.mark.parametrize("text", ["I took my tablets this morning", "renouvellement d'ordonnance", "visite de contrôle"])
def test_routine_text_has_no_emergency_flag(text):
    assert not {"suicide_self_harm", "overdose", "seizure", "anaphylaxis"} & {f["id"] for f in match_red_flags(text)}


def test_assistant_suicide_gets_the_crisis_answer():
    out = assistant.answer("I want to kill myself", CTX)
    assert out["intent"] == "urgent"
    assert "190" in out["answer"] and out["answer"] == assistant.CRISIS


@pytest.mark.parametrize("q", ["I took double my dose by mistake", "my throat is swelling after the medication"])
def test_assistant_emergencies_get_the_urgent_answer(q):
    out = assistant.answer(q, CTX)
    assert out["intent"] == "urgent" and out["answer"] == assistant.URGENT


def test_low_model_confidence_is_raised_for_review(monkeypatch):
    monkeypatch.setattr("app.ai.textclf.load", lambda name: object())
    monkeypatch.setattr("app.ai.textclf.predict_proba", lambda m, t: {1: 0.3, 2: 0.25, 3: 0.25, 4: 0.2})
    r = triage("vague text", [], age=40)
    assert r.urgency == 3
    assert any("unsure" in x for x in r.reasons)


def test_llm_summary_with_a_changed_number_falls_back_to_the_template(monkeypatch):
    vitals = [{"hr": 80, "spo2": 96, "temp": 37.0, "news2": 1}, {"hr": 90, "spo2": 93, "temp": 37.2, "news2": 3}]
    monkeypatch.setattr(copilot, "get_settings", lambda: type("S", (), {"llm_provider": "groq"})())
    monkeypatch.setattr(copilot, "complete_json",
                        lambda *a, **k: copilot._LlmSummary(summary="SpO2 fell to 83% overnight."))
    out = copilot.summarize(vitals, [], [], ["Amira"])
    assert out["source"] == "rules" and "83" not in out["summary"]


def test_llm_summary_that_keeps_the_numbers_is_used(monkeypatch):
    vitals = [{"hr": 80, "spo2": 96, "temp": 37.0, "news2": 1}, {"hr": 90, "spo2": 93, "temp": 37.2, "news2": 3}]
    template = copilot.template_summary(vitals, [], [], [])
    monkeypatch.setattr(copilot, "get_settings", lambda: type("S", (), {"llm_provider": "groq"})())
    monkeypatch.setattr(copilot, "complete_json",
                        lambda *a, **k: copilot._LlmSummary(summary="Rewritten: " + template))
    assert copilot.summarize(vitals, [], [], ["Amira"])["source"] == "llm"


def test_pii_stripper_catches_ins_and_dates():
    out = llm.strip_pii("INS 1234567890123, né le 12/03/1961, admis le 2026-10-05")
    assert "1234567890123" not in out and "[INS]" in out
    assert "12/03/1961" not in out and "2026-10-05" not in out


@pytest.mark.parametrize("q, intent", [("when is my next pill?", "next_dose"), ("quand est mon rendez-vous ?", "next_visit")])
def test_a_question_naming_one_topic_gets_that_topic(q, intent):
    assert assistant.answer(q, CTX)["intent"] == intent
