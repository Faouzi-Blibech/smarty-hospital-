"""Triage scorer: hard red-flag rules + a trained classifier, no LLM (owner: Faouzi).

urgency = max(red-flag floor, trained model, 2 if age >= 75). The model can only raise urgency above the floor,
never lower it. Without the shipped model file it degrades to the rules alone. A human always confirms the result.
"""

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

from app.ai import textclf

RULES = Path(__file__).parent / "rules" / "red_flags.v1.json"
SCALE = Path(__file__).parent / "rules" / "triage_scale.v1.json"
ELDERLY_AGE = 75


class TriageResult(BaseModel):
    urgency: int
    reasons: list[str]
    red_flags: list[str]
    source: str  # "model" (rules + trained classifier) | "rules" (no model file shipped)
    model_urgency: int | None = None
    confidence: float | None = None
    scale: dict | None = None


_ARABIC_VARIANTS = str.maketrans({"ى": "ي", "ة": "ه", "ـ": None})


@lru_cache
def _flags() -> list[dict]:
    flags = json.loads(RULES.read_text(encoding="utf-8"))["flags"]
    for f in flags:
        # Each keyword becomes a tuple of terms that must all appear; a plain string is a one-term tuple.
        f["norm_keywords"] = [tuple(_normalize(t) for t in (k["all"] if isinstance(k, dict) else [k]))
                              for k in f["keywords"]]
    return flags


def _normalize(text: str) -> str:
    # Drop every combining mark (French accents, Arabic harakat/hamza marks); keywords get the same treatment.
    decomposed = unicodedata.normalize("NFKD", text.lower())
    kept = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).translate(_ARABIC_VARIANTS)
    return re.sub(r"\s+", " ", kept).strip()


def match_red_flags(text: str) -> list[dict]:
    t = _normalize(text)
    return [f for f in _flags() if any(all(term in t for term in k) for k in f["norm_keywords"])]


def rule_floor(text: str) -> int:
    return max((f["min_urgency"] for f in match_red_flags(text)), default=1)


@lru_cache
def _scale() -> dict:
    return json.loads(SCALE.read_text(encoding="utf-8"))


def scale_label(urgency: int) -> dict:
    s = _scale()
    return {"name": s["name"], "level": s["levels"][str(urgency)], "confirmed": bool(s["confirmed"])}


def triage(referral_text: str, symptoms: list[str], age: int | None) -> TriageResult:
    full_text = " ".join([referral_text, *symptoms])
    matched = match_red_flags(full_text)
    flag_ids = [f["id"] for f in matched]
    floor = max((f["min_urgency"] for f in matched), default=1)
    reasons = [f"Red flag: {i.replace('_', ' ')} (urgency at least {f['min_urgency']})"
               for i, f in zip(flag_ids, matched)]

    urgency, model_u, conf = floor, None, None
    model = textclf.load("triage.v1")
    if model is not None:
        model_u, conf = max(textclf.predict_proba(model, _normalize(full_text)).items(), key=lambda kv: kv[1])
        conf = round(conf, 2)
        reasons.append(f"Similar referrals were urgency {model_u} (model confidence {conf:.0%})")
        urgency = max(urgency, model_u)
    if (age or 0) >= ELDERLY_AGE and urgency < 2:
        urgency = 2
        reasons.append(f"Age {age}: routine requests are raised to urgency 2")
    if not reasons:
        reasons = ["No red flag found; routine priority"]
    return TriageResult(urgency=urgency, reasons=reasons, red_flags=flag_ids,
                        source="model" if model is not None else "rules", model_urgency=model_u, confidence=conf,
                        scale=scale_label(urgency))
