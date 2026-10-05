import json

import pytest

from app.ai import digitizer as D
from app.ai.llm import LLMUnavailable

EXPECTED = {"fields": {"patient_name": {"value": "Amira Ben Salah", "confidence": 1.0},
                       "diagnosis": {"value": "HTA", "confidence": 1.0}}}


def _down(*a, **k):
    raise LLMUnavailable("down")


@pytest.fixture()
def demo_assets(tmp_path, monkeypatch):
    (tmp_path / "demo_record.jpg").write_bytes(b"demo-image-bytes")
    (tmp_path / "demo_record.expected.json").write_text(json.dumps(EXPECTED), encoding="utf-8")
    monkeypatch.setattr(D, "ASSETS", tmp_path)
    return tmp_path


def test_digitize_fallback_on_demo_image(monkeypatch, demo_assets):
    monkeypatch.setattr(D, "complete_json", _down)
    out = D.digitize(b"demo-image-bytes", "image/jpeg")
    assert out["source"] == "fallback"
    assert out["fields"]["patient_name"]["value"] == "Amira Ben Salah"


def test_digitize_unknown_image_returns_empty_fields(monkeypatch, demo_assets):
    monkeypatch.setattr(D, "complete_json", _down)
    out = D.digitize(b"some other photo", "image/jpeg")
    assert out["source"] == "fallback"
    assert set(out["fields"]) == set(D.FIELDS)
    assert all(f["value"] is None and f["confidence"] == 0.0 for f in out["fields"].values())


def test_digitize_without_demo_asset_still_falls_back(monkeypatch, tmp_path):
    monkeypatch.setattr(D, "ASSETS", tmp_path)          # no demo files at all
    monkeypatch.setattr(D, "complete_json", _down)
    assert D.digitize(b"x", "image/jpeg")["source"] == "fallback"


def test_digitize_llm_path_clamps_confidence(monkeypatch):
    def fake(prompt_name, user_text, schema, images=(), **kw):
        assert images and images[0][1] == "image/png"
        data = {f: {"value": None, "confidence": 0.0} for f in D.FIELDS}
        data["diagnosis"] = {"value": "Pneumonie", "confidence": 1.7}
        return schema(**data)

    monkeypatch.setattr(D, "complete_json", fake)
    out = D.digitize(b"png-bytes", "image/png")
    assert out["source"] == "llm"
    assert out["fields"]["diagnosis"] == {"value": "Pneumonie", "confidence": 1.0}
