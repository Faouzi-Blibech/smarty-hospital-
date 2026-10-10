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


# ---- v2 training data (independent writers) vs every evaluation set --------------------------------------------------
def test_v2_training_rows_are_not_in_any_eval_set():
    from app.ai.training import build_v2_data as B

    dd = B.Dedupe(B.eval_keys())
    rows = [r["text"] for n in ("triage_train.v2.jsonl", "intent_train.v2.jsonl") for r in _jsonl(n)]
    assert rows and [t for t in rows if dd.reject_reason(t) == "eval_leak"] == []


def test_v2_training_files_are_valid_and_deduped():
    from app.ai.training import build_v2_data as B

    tri, its = _jsonl("triage_train.v2.jsonl"), _jsonl("intent_train.v2.jsonl")
    assert len(tri) >= 1500 and len(its) >= 700
    assert all(B._valid_triage(r) for r in tri) and all(B._valid_intent(r) for r in its)
    for rows in (tri, its):
        keys = [B.key(r["text"]) for r in rows]
        assert len(keys) == len(set(keys))
    assert {r["flag"] for r in tri if r["flag"]} == B.FLAGS
    assert {r["intent"] for r in its} == B.INTENTS


def test_dedupe_rejects_exact_near_and_contained_texts():
    from app.ai.training.build_v2_data import Dedupe

    dd = Dedupe(["douleur thoracique depuis hier soir avec sueurs"])
    assert dd.reject_reason("Douleur thoracique depuis hier soir, avec sueurs!") == "eval_leak"  # same after normalising
    assert dd.reject_reason("douleur thoracique depuis hier soir avec sueurs froides") == "eval_leak"  # near copy
    assert dd.reject_reason("mon père dit: douleur thoracique depuis hier soir avec sueurs, venez") == "eval_leak"  # contains it
    assert dd.reject_reason("renouvellement de l'ordonnance de tension") is None
    dd.add("renouvellement de l'ordonnance de tension")
    assert dd.reject_reason("Renouvellement de l'ordonnance de tension.") == "duplicate"
    assert dd.reject_reason("pills?") is None  # short texts are only rejected when equal, not when contained
