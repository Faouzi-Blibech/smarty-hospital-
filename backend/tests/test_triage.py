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


@pytest.mark.parametrize("text,flag", [
    ("douleurs thoraciques depuis hier", "chest_pain"),
    ("ضيق التنفس شديد", "breathing"),
    ("ألم فى الصدر", "chest_pain"),
    ("enceinte et saignement depuis ce matin", "pregnancy_bleeding"),
    ("fièvre du nourrisson 39.5", "high_fever_child"),
    ("ma nnajjamch nitnaffes", "breathing"),
])
def test_red_flag_common_phrasings(text, flag):
    assert flag in [f["id"] for f in T.match_red_flags(text)]


def test_triage_passes_names_for_pii_stripping(monkeypatch):
    seen = {}

    def capture(prompt_name, user_text, schema, **kw):
        seen.update(kw)
        return schema(urgency=2, reasons=["x"], red_flags=[])

    monkeypatch.setattr(T, "complete_json", capture)
    T.triage("Je suis Amira, toux", [], 30, names=["Amira", "Ben Salah"])
    assert list(seen["names"]) == ["Amira", "Ben Salah"]
