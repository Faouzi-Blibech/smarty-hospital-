from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as NS

from app.ai import copilot as C
from app.ai.llm import LLMUnavailable

VITALS = [
    {"hr": 72, "spo2": 97, "temp": 36.8, "news2": 0},
    {"hr": 118, "spo2": 93, "temp": 38.4, "news2": 5},
    {"hr": 96, "spo2": None, "temp": 37.6, "news2": 1},
]


def _down(*a, **k):
    raise LLMUnavailable("down")


def test_interaction_detected():
    found = C.check_interactions(["Warfarin 5mg", "Aspirin 100mg", "Paracetamol 500mg"])
    assert len(found) == 1
    assert found[0]["severity"] == "high" and set(found[0]["drugs"]) == {"warfarin", "aspirin"}


def test_no_interaction_for_safe_combo():
    assert C.check_interactions(["Paracetamol 500mg", "Amoxicillin 1g"]) == []


def test_summary_fallback_mentions_vitals(monkeypatch):
    monkeypatch.setattr(C, "complete_json", _down)
    out = C.summarize(VITALS, notes=["Patient slept poorly"], meds=["Paracetamol 500mg"], names=["Amira"])
    assert out["source"] == "fallback"
    assert "HR 72–118" in out["summary"] and "max NEWS2 5" in out["summary"]
    assert "1 nurse note" in out["summary"] and "Paracetamol 500mg" in out["summary"]


def test_summary_fallback_without_vitals(monkeypatch):
    monkeypatch.setattr(C, "complete_json", _down)
    out = C.summarize([], notes=[], meds=[], names=[])
    assert "No vitals recorded" in out["summary"]


def test_interactions_come_from_rules_even_with_llm(monkeypatch):
    def fake(prompt_name, user_text, schema, **kw):
        return schema(summary="Stable overnight.")

    monkeypatch.setattr(C, "complete_json", fake)
    out = C.summarize(VITALS, notes=[], meds=["Warfarin", "Ibuprofen 400mg"], names=[])
    assert out["source"] == "llm" and out["summary"] == "Stable overnight."
    assert out["interactions"][0]["drugs"] == ["warfarin", "ibuprofen"]


# --- GET /ai/summary building blocks (rows follow data-model.md; DB queries come with the link step) ---
T0 = datetime(2026, 10, 8, 9, 0, tzinfo=UTC)


def test_summary_inputs_from_rows():
    patient = NS(first_name="Amira", last_name="Ben Salah")
    vitals = [NS(hr=72, spo2=97, temp=36.8, news2=0, ts=T0), NS(hr=118, spo2=None, temp=38.4, news2=5, ts=T0)]
    notes = [NS(text="Slept poorly"), NS(text="  ")]
    rxs = [NS(active=True, items=[{"med": "Warfarin 5mg"}, {"med": "Aspirin 100mg"}]),
           NS(active=False, items=[{"med": "Ibuprofen 400mg"}])]
    got = C.summary_inputs(patient, vitals, notes, rxs)
    assert got["vitals"] == [{"hr": 72, "spo2": 97, "temp": 36.8, "news2": 0},
                             {"hr": 118, "spo2": None, "temp": 38.4, "news2": 5}]
    assert got["notes"] == ["Slept poorly"]
    assert got["meds"] == ["Warfarin 5mg", "Aspirin 100mg"]
    assert got["names"] == ["Amira", "Ben Salah"]


def test_cached_summary_is_fresh_for_10_minutes():
    row = NS(created_at=T0)
    assert C.is_fresh(row, now=T0 + timedelta(minutes=9, seconds=59)) is True
    assert C.is_fresh(row, now=T0 + timedelta(minutes=10)) is False
    assert C.is_fresh(None, now=T0) is False


def test_review_marks_confirmer():
    row = NS(human_confirmed_by=None)
    C.apply_review(row, user_id="u-0001")
    assert row.human_confirmed_by == "u-0001"


def test_summary_payload_shape():
    row = NS(created_at=T0, human_confirmed_by=None,
             ai_suggested={"summary": "Stable.", "interactions": [], "source": "fallback"})
    assert C.summary_payload(row) == {"summary": "Stable.", "interactions": [], "source": "fallback",
                                      "generated_at": "2026-10-08T09:00:00Z", "human_confirmed_by": None}
