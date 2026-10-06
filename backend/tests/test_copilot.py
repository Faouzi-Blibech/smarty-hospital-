from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

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


def _provider(monkeypatch, provider):
    monkeypatch.setattr(C, "get_settings", lambda: SimpleNamespace(llm_provider=provider))


def _no_network(*a, **k):
    raise AssertionError("complete_json must not be called")


def test_template_summary_content(monkeypatch):
    _provider(monkeypatch, "none")
    monkeypatch.setattr(C, "complete_json", _no_network)
    out = C.summarize(VITALS, notes=["Slept poorly", "Patient slept poorly again"],
                      meds=["Warfarin", "Ibuprofen 400mg"], names=["Amira"])
    s = out["summary"]
    assert out["source"] == "rules"
    assert "HR 72–118 (latest 96, rising)" in s
    assert "SpO2 93–97% (latest 93%, stable)" in s
    assert "max NEWS2 5" in s
    assert '2 nurse notes. Latest: "Patient slept poorly again".' in s
    assert "Active meds: Warfarin, Ibuprofen 400mg." in s
    assert s.count("Interaction (") == len(out["interactions"]) == 1
    assert "warfarin + ibuprofen" in s


def test_trend_words_and_single_value():
    assert C._trend([100, 104]) == "stable" and C._trend([100, 106]) == "rising"
    assert C._trend([100, 94]) == "falling" and C._trend([100, 95]) == "stable"
    assert C._trend([97]) == "stable"


def test_latest_note_truncated_to_120():
    text = C._notes_text(["x" * 300])
    assert "..." in text and "x" * 118 not in text


def test_summary_without_vitals(monkeypatch):
    _provider(monkeypatch, "none")
    out = C.summarize([], notes=[], meds=[], names=[])
    assert "No vitals recorded" in out["summary"] and "0 nurse notes." in out["summary"]


def test_llm_rewrites_template_when_provider_set(monkeypatch):
    _provider(monkeypatch, "groq")
    seen = {}

    def fake(prompt_name, user_text, schema, **kw):
        seen.update(prompt=prompt_name, text=user_text, names=kw["names"])
        return schema(summary="Stable overnight.")

    monkeypatch.setattr(C, "complete_json", fake)
    out = C.summarize(VITALS, notes=[], meds=["Warfarin", "Ibuprofen 400mg"], names=["Amira"])
    assert out["source"] == "llm" and out["summary"] == "Stable overnight."
    assert "HR 72–118" in seen["text"] and seen["names"] == ["Amira"]
    assert out["interactions"][0]["drugs"] == ["warfarin", "ibuprofen"]


def test_llm_down_keeps_template(monkeypatch):
    _provider(monkeypatch, "groq")
    monkeypatch.setattr(C, "complete_json", _down)
    out = C.summarize(VITALS, notes=[], meds=[], names=[])
    assert out["source"] == "rules" and "HR 72–118" in out["summary"]


# --- GET /ai/summary building blocks (rows follow data-model.md; DB queries come with the link step) ---
T0 = datetime(2026, 10, 8, 9, 0, tzinfo=UTC)


def test_summary_inputs_from_rows():
    patient = SimpleNamespace(first_name="Amira", last_name="Ben Salah")
    vitals = [SimpleNamespace(hr=72, spo2=97, temp=36.8, news2=0, ts=T0), SimpleNamespace(hr=118, spo2=None, temp=38.4, news2=5, ts=T0)]
    notes = [SimpleNamespace(text="Slept poorly"), SimpleNamespace(text="  ")]
    rxs = [SimpleNamespace(active=True, items=[{"med": "Warfarin 5mg"}, {"med": "Aspirin 100mg"}]),
           SimpleNamespace(active=False, items=[{"med": "Ibuprofen 400mg"}])]
    got = C.summary_inputs(patient, vitals, notes, rxs)
    assert got["vitals"] == [{"hr": 72, "spo2": 97, "temp": 36.8, "news2": 0},
                             {"hr": 118, "spo2": None, "temp": 38.4, "news2": 5}]
    assert got["notes"] == ["Slept poorly"]
    assert got["meds"] == ["Warfarin 5mg", "Aspirin 100mg"]
    assert got["names"] == ["Amira", "Ben Salah"]


def test_cached_summary_is_fresh_for_10_minutes():
    row = SimpleNamespace(created_at=T0)
    assert C.is_fresh(row, now=T0 + timedelta(minutes=9, seconds=59)) is True
    assert C.is_fresh(row, now=T0 + timedelta(minutes=10)) is False
    assert C.is_fresh(None, now=T0) is False


def test_review_marks_confirmer():
    row = SimpleNamespace(human_confirmed_by=None)
    C.apply_review(row, user_id="u-0001")
    assert row.human_confirmed_by == "u-0001"


def test_summary_payload_shape():
    row = SimpleNamespace(created_at=T0, human_confirmed_by=None,
             ai_suggested={"summary": "Stable.", "interactions": [], "source": "rules"})
    assert C.summary_payload(row) == {"summary": "Stable.", "interactions": [], "source": "rules",
                                      "generated_at": "2026-10-08T09:00:00Z", "human_confirmed_by": None}
