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


@pytest.mark.parametrize("provider", ["none", "anthropic", "bogus"])
def test_unknown_or_none_provider_raises_without_network(monkeypatch, provider):
    monkeypatch.setattr(llm, "get_settings", lambda: llm.Settings(llm_provider=provider))
    monkeypatch.setattr(llm.httpx, "post", lambda *a, **k: pytest.fail("network used"))
    with pytest.raises(LLMUnavailable):
        complete_json("summary", "hello", _Out)


def test_provider_errors_become_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "get_settings", lambda: llm.Settings(llm_provider="groq"))

    def boom(*a, **k):
        raise TimeoutError("slow")

    monkeypatch.setattr(llm.httpx, "post", boom)
    with pytest.raises(LLMUnavailable):
        complete_json("summary", "hello", _Out)


class _Resp:
    def __init__(self, body):
        self._body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self._body


def test_groq_request_shape_and_pii_stripped(monkeypatch):
    monkeypatch.setattr(llm, "get_settings", lambda: llm.Settings(
        llm_provider="groq", groq_api_key="k-123", llm_model="llama-3.3-70b-versatile", llm_timeout_s=7))
    seen = {}

    def fake_post(url, **kw):
        seen["url"], seen["kw"] = url, kw
        return _Resp({"choices": [{"message": {"content": '{"x": 3}'}}]})

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    out = complete_json("summary", "Amira p-0007 has a cough", _Out, names=["Amira"])
    assert out.x == 3
    kw = seen["kw"]
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert kw["headers"] == {"Authorization": "Bearer k-123"} and kw["timeout"] == 7
    body = kw["json"]
    assert body["model"] == "llama-3.3-70b-versatile" and body["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    assert "Answer with JSON matching this schema" in body["messages"][0]["content"]
    assert "Amira" not in body["messages"][1]["content"] and "p-0007" not in body["messages"][1]["content"]


def test_local_ollama_call(monkeypatch):
    monkeypatch.setattr(llm, "get_settings", lambda: llm.Settings(llm_provider="local"))
    seen = {}

    def fake_post(url, **kw):
        seen["url"] = url
        return _Resp({"message": {"content": '{"x": 1}'}})

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    assert complete_json("summary", "hi", _Out).x == 1 and seen["url"].endswith("/api/chat")


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
