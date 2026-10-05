import pytest
from pydantic import BaseModel

from app.ai import llm
from app.ai.llm import LLMUnavailable, complete_json, strip_pii


def test_strip_pii():
    t = "Amira Ben Salah (p-0007), tel 98 123 456, CIN 01234567, amira@mail.tn"
    out = strip_pii(t, names=["Amira", "Ben Salah"])
    for leak in ["Amira", "Ben Salah", "p-0007", "98 123 456", "01234567", "amira@mail.tn"]:
        assert leak not in out


class _Out(BaseModel):
    x: int


def test_fallback_provider_raises_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "get_settings", lambda: llm.Settings(llm_provider="fallback"))
    with pytest.raises(LLMUnavailable):
        complete_json("triage", "hello", _Out)


def test_provider_errors_become_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "get_settings", lambda: llm.Settings(llm_provider="anthropic"))

    def boom(*a, **k):
        raise TimeoutError("slow")

    monkeypatch.setattr(llm, "_anthropic", boom)
    with pytest.raises(LLMUnavailable):
        complete_json("triage", "hello", _Out)


def test_pii_stripped_before_provider_sees_text(monkeypatch):
    monkeypatch.setattr(llm, "get_settings", lambda: llm.Settings(llm_provider="anthropic"))
    seen = {}

    def capture(s, system, text, schema, images):
        seen["text"] = text
        return schema(x=1)

    monkeypatch.setattr(llm, "_anthropic", capture)
    complete_json("triage", "Amira p-0007 has a cough", _Out, names=["Amira"])
    assert "Amira" not in seen["text"] and "p-0007" not in seen["text"]
