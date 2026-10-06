import builtins

import pytest

from app.ai import laya_intent
from app.config import get_settings


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    monkeypatch.delenv("LAYA_ENABLED", raising=False)
    get_settings.cache_clear()
    laya_intent._load_agent.cache_clear()
    yield
    get_settings.cache_clear()


class FakeAgent:
    def __init__(self, answer):
        self.answer = answer

    def predict(self, state, questions):
        assert state == {"body": "when is my pill"}
        assert "intent" in questions
        return {"answers": {"intent": self.answer}}


def test_disabled_returns_none(monkeypatch):
    monkeypatch.setenv("LAYA_ENABLED", "false")
    get_settings.cache_clear()
    assert laya_intent.classify("x") is None


def test_not_installed_returns_none(monkeypatch):
    real = builtins.__import__

    def fake(name, *a, **k):
        if name == "laya":
            raise ImportError("no laya")
        return real(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", fake)
    assert laya_intent.classify("x") is None


def test_probabilities_from_agent(monkeypatch):
    probs = {"next_dose": 0.7, "next_visit": 0.1, "my_vitals": 0.1, "urgent": 0.05, "ask_staff": 0.05}
    agent = FakeAgent({"choice": "next_dose", "confidence": 0.7, "probabilities": probs})
    monkeypatch.setattr(laya_intent, "_load_agent", lambda: agent)
    out = laya_intent.classify("when is my pill")
    assert set(out) == set(laya_intent.KEYS) and len(out) == 5
    assert out["next_dose"] == pytest.approx(0.7)
    assert sum(out.values()) == pytest.approx(1.0)


def test_choice_and_confidence_only(monkeypatch):
    agent = FakeAgent({"choice": "urgent", "confidence": 0.6})
    monkeypatch.setattr(laya_intent, "_load_agent", lambda: agent)
    out = laya_intent.classify("when is my pill")
    assert out["urgent"] == pytest.approx(0.6)
    assert out["next_dose"] == pytest.approx(0.1)
    assert sum(out.values()) == pytest.approx(1.0)


def test_predict_failure_returns_none(monkeypatch):
    class Boom:
        def predict(self, *a):
            raise RuntimeError("x")

    monkeypatch.setattr(laya_intent, "_load_agent", lambda: Boom())
    assert laya_intent.classify("q") is None
