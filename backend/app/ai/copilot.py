"""Doctor copilot: LLM daily summary + drug-interaction check from a curated rule list (never the LLM).

`summarize` is DB-free; `daily_summary(db, patient_id)` wraps it once the models exist (plans/FAOUZI.md Task 7).
"""

import json
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

from app.ai.llm import LLMUnavailable, complete_json

RULES = Path(__file__).parent / "rules" / "interactions.v1.json"


class _LlmSummary(BaseModel):
    summary: str


@lru_cache
def _pairs() -> list[dict]:
    return json.loads(RULES.read_text(encoding="utf-8"))["pairs"]


def check_interactions(med_names: list[str]) -> list[dict]:
    meds = " | ".join(med_names).lower()
    return [{"drugs": p["drugs"], "severity": p["severity"], "note": p["note"]}
            for p in _pairs() if all(d in meds for d in p["drugs"])]


def _range(vitals: list[dict], key: str) -> tuple | None:
    vals = [v[key] for v in vitals if v.get(key) is not None]
    return (min(vals), max(vals), vals[-1]) if vals else None


def _stats_text(vitals: list[dict]) -> str:
    if not vitals:
        return "No vitals recorded in the last 24h."
    parts = []
    for key, label, unit in (("hr", "HR", ""), ("spo2", "SpO2", "%"), ("temp", "Temp", "°C")):
        r = _range(vitals, key)
        if r:
            parts.append(f"{label} {r[0]}–{r[1]}{unit} (latest {r[2]}{unit})")
    news2 = _range(vitals, "news2")
    if news2:
        parts.append(f"max NEWS2 {news2[1]}")
    return "Last 24h: " + ", ".join(parts) + "."


def fallback_summary(vitals: list[dict], notes: list[str], meds: list[str]) -> str:
    n = len(notes)
    return (f"{_stats_text(vitals)} {n} nurse note{'s' if n != 1 else ''}. "
            f"Active meds: {', '.join(meds) if meds else 'none'}.")


def summarize(vitals: list[dict], notes: list[str], meds: list[str], names: list[str]) -> dict:
    interactions = check_interactions(meds)
    user_text = (f"{_stats_text(vitals)}\nNurse notes:\n" + ("\n".join(f"- {t}" for t in notes) or "- none")
                 + f"\nActive medications: {', '.join(meds) or 'none'}")
    try:
        summary, source = complete_json("summary", user_text, _LlmSummary, names=names).summary, "llm"
    except LLMUnavailable:
        summary, source = fallback_summary(vitals, notes, meds), "fallback"
    return {"summary": summary, "interactions": interactions, "source": source,
            "generated_at": datetime.now(UTC).isoformat()}
