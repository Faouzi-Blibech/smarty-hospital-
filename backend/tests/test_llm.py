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


@pytest.mark.parametrize("leak", ["+21698123456", "98-123-456", "98.123.456", "0021698123456",
                                  "d-000123", "a-0001", "rx-0001", "adm-0001", "al-0001", "P-0001"])
def test_strip_pii_formats(leak):
    assert leak not in strip_pii(f"contact {leak} today")


@pytest.mark.parametrize("text", ["Ben  Salah", "Ben-Salah", "BEN SALAH"])
def test_strip_pii_name_variants(text):
    assert "salah" not in strip_pii(f"patient {text} ok", names=["Ben Salah"]).lower()


def test_strip_pii_accent_insensitive_names():
    assert "emna" not in strip_pii("emna has fever", names=["Émna"]).lower()


def test_strip_pii_respects_word_boundaries():
    assert strip_pii("Ali needs alimentation", names=["Ali"]) == "[NAME] needs alimentation"
