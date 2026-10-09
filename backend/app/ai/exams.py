"""Exam-set suggestions for a request (owner: Faouzi). Rules only, no LLM: red flags from triage plus keywords in
French, English and Arabic, from rules/exam_bundles.v1.json. A doctor orders or drops each suggestion."""

import json
from functools import lru_cache
from pathlib import Path

from app.ai.triage import _normalize

RULES = Path(__file__).parent / "rules" / "exam_bundles.v1.json"
MAX_EXAMS = 4
DEPARTMENTS = ("Imaging", "Laboratory", "Cardiology")


@lru_cache
def _rules() -> dict:
    data = json.loads(RULES.read_text(encoding="utf-8"))
    for b in data["bundles"]:
        b["norm_keywords"] = [_normalize(k) for k in b.get("keywords", [])]
    return data


def catalogue() -> dict[str, dict]:
    return _rules()["catalogue"]


def _matches(bundle: dict, text: str, red_flags: set[str]) -> bool:
    return bool(red_flags & set(bundle.get("red_flags", []))) or any(k in text for k in bundle["norm_keywords"])


def suggest_exams(text: str, red_flags: list[str]) -> dict:
    t, flags = _normalize(text), set(red_flags)
    hits = [b for b in _rules()["bundles"] if _matches(b, t, flags)]
    codes: list[str] = []
    for b in hits:
        codes += [c for c in b["exams"] if c not in codes]
    cat = catalogue()
    return {"exams": [{"code": c, **cat[c]} for c in codes[:MAX_EXAMS]], "bundles": [b["id"] for b in hits],
            "source": "rules"}
