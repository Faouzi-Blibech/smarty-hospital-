"""The hand-written evaluation sets must not leak into the generated training data."""

import json
import re
from pathlib import Path

from app.ai.training import make_data
from app.ai.triage import _normalize

DATA = make_data.DATA


def _key(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", _normalize(text))).strip()


def _jsonl(name: str) -> list[dict]:
    return [json.loads(x) for x in Path(DATA / name).read_text(encoding="utf-8").splitlines() if x.strip()]


def leaks(eval_texts: list[str], train_texts: list[str], phrases: list[str]) -> list[str]:
    """Eval rows equal to a training row, or containing a whole generator phrase."""
    train = {_key(t) for t in train_texts}
    keys = {_key(p) for p in phrases}
    return [t for t in eval_texts if _key(t) in train or any(p in _key(t) for p in keys)]


def test_intent_eval_has_no_leakage():
    ev = [r["text"] for r in _jsonl("intent_eval.v1.jsonl")]
    tr = [r["state"]["body"] for r in _jsonl("intent_train.v1.jsonl")]
    phrases = [p for ps in make_data.INTENT_PHRASES.values() for p in ps]
    assert leaks(ev, tr, phrases) == []


def test_triage_eval_has_no_leakage():
    ev = [r["text"] for r in _jsonl("triage_eval.v1.jsonl")]
    tr = [r["text"] for r in _jsonl("triage_train.v1.jsonl")]
    phrases = [p for ps in make_data.TRIAGE_COMPLAINTS.values() for p in ps]
    assert leaks(ev, tr, phrases) == []


def test_eval_set_sizes_are_kept():
    assert len(_jsonl("intent_eval.v1.jsonl")) == 36
    assert len(_jsonl("triage_eval.v1.jsonl")) == 29
