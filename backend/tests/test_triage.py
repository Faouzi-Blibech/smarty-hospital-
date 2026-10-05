import pytest

from app.ai import triage as T
from app.ai.llm import LLMUnavailable


def fake_llm(urgency):
    def _f(prompt_name, user_text, schema, **kw):
        return schema(urgency=urgency, reasons=["llm"], red_flags=[])

    return _f


def test_red_flag_floor_beats_llm(monkeypatch):
    monkeypatch.setattr(T, "complete_json", fake_llm(2))
    r = T.triage("Douleur thoracique depuis 2 jours", [], 55)
    assert r.urgency == 5 and "chest_pain" in r.red_flags and r.source == "llm"


@pytest.mark.parametrize("text", ["ألم في الصدر منذ يومين", "3andi waja3 fi sadri", "chest pain at rest"])
def test_red_flag_arabic_and_darija(monkeypatch, text):
    monkeypatch.setattr(T, "complete_json", fake_llm(1))
    assert T.triage(text, [], 40).urgency == 5


def test_triage_fallback_when_llm_unavailable(monkeypatch):
    def boom(*a, **k):
        raise LLMUnavailable("down")

    monkeypatch.setattr(T, "complete_json", boom)
    r = T.triage("Contrôle de routine, pas de plainte", [], 30)
    assert r.source == "fallback" and 1 <= r.urgency <= 2


def test_no_flag_keeps_llm_score(monkeypatch):
    monkeypatch.setattr(T, "complete_json", fake_llm(4))
    assert T.triage("toux légère", [], 30).urgency == 4
