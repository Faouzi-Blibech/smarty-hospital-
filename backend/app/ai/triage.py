"""Triage scorer: LLM urgency 1-5 with a hard red-flag floor the LLM cannot lower.

Falls back to rules only when the LLM is unavailable. A human always confirms the result.
"""

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

from app.ai.llm import LLMUnavailable, complete_json

RULES = Path(__file__).parent / "rules" / "red_flags.v1.json"


class TriageResult(BaseModel):
    urgency: int
    reasons: list[str]
    red_flags: list[str]
    source: str


class _LlmTriage(BaseModel):
    urgency: int = Field(ge=1, le=5)
    reasons: list[str]
    red_flags: list[str]


@lru_cache
def _flags() -> list[dict]:
    flags = json.loads(RULES.read_text(encoding="utf-8"))["flags"]
    for f in flags:
        f["norm_keywords"] = [_normalize(k) for k in f["keywords"]]
    return flags


def _normalize(text: str) -> str:
    # Drop every combining mark (French accents, Arabic harakat/hamza marks); keywords get the same treatment.
    decomposed = unicodedata.normalize("NFKD", text.lower())
    kept = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", kept).strip()


def match_red_flags(text: str) -> list[dict]:
    t = _normalize(text)
    return [f for f in _flags() if any(k in t for k in f["norm_keywords"])]


def triage(referral_text: str, symptoms: list[str], age: int | None, history: str = "") -> TriageResult:
    full_text = " ".join([referral_text, *symptoms])
    matched = match_red_flags(full_text)
    floor = max((f["min_urgency"] for f in matched), default=1)
    flag_ids = [f["id"] for f in matched]

    user_text = (f"Referral / complaint: {referral_text}\nSymptoms: {', '.join(symptoms) or 'none listed'}\n"
                 f"Age: {age if age is not None else 'unknown'}\nHistory: {history or 'none given'}")
    try:
        out = complete_json("triage", user_text, _LlmTriage)
    except LLMUnavailable:
        urgency = max(floor, 2 if (age or 0) >= 75 else 1)
        reasons = [f"Red flag: {i.replace('_', ' ')}" for i in flag_ids] or ["No red flag found; routine priority"]
        return TriageResult(urgency=urgency, reasons=reasons, red_flags=flag_ids, source="fallback")

    urgency = max(min(max(out.urgency, 1), 5), floor)
    red_flags = list(dict.fromkeys(flag_ids + out.red_flags))
    return TriageResult(urgency=urgency, reasons=out.reasons, red_flags=red_flags, source="llm")
