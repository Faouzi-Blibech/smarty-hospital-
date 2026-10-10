"""Ratchet on the independent v2 eval sets (tests/fixtures/ai_eval). See scripts/eval_ai.py for the full report."""

import json
from collections import Counter

import pytest

from scripts import eval_ai
from tests.test_eval_leakage import _jsonl, leaks

# Measured baselines on the shipped models. Lower URGENT_MISSED_BASELINE / raise
# INTENT_ACCURACY_BASELINE when the models improve; never loosen.
URGENT_MISSED_BASELINE = 12
INTENT_ACCURACY_BASELINE = 0.727
INTENT_TOLERANCE = 0.02

FLAGS = {"chest_pain", "stroke_signs", "severe_bleeding", "breathing", "loss_of_consciousness",
         "pregnancy_bleeding", "high_fever_child", "suicide_self_harm", "overdose", "anaphylaxis", "seizure",
         "medication_error"}


@pytest.fixture(scope="module")
def triage_rows():
    return eval_ai.load_jsonl(eval_ai.V2 / "triage_eval.v2.jsonl")


@pytest.fixture(scope="module")
def intent_rows():
    return eval_ai.load_jsonl(eval_ai.V2 / "intent_eval.v2.jsonl")


def test_v2_triage_urgent_missed_does_not_regress(triage_rows):
    report = eval_ai.eval_triage(triage_rows)
    misses = [(m["expected"], m["final"], m["text"]) for m in report["urgent_misses"]]
    assert report["urgent_missed"] <= URGENT_MISSED_BASELINE, misses


def test_v2_intent_accuracy_does_not_regress(intent_rows, monkeypatch):
    report = eval_ai.eval_intent(intent_rows)
    assert report["accuracy"] >= INTENT_ACCURACY_BASELINE - INTENT_TOLERANCE, report["confusion_pairs"]


def test_v2_sets_are_well_formed(triage_rows, intent_rows):
    assert 140 <= len(triage_rows) <= 170 and 140 <= len(intent_rows) <= 170
    flags = Counter(r["flag"] for r in triage_rows if r["flag"])
    assert set(flags) == FLAGS and min(flags.values()) >= 3
    assert sum(r["lang"].startswith("darija") for r in triage_rows) >= 30
    assert sum(r["expected"] >= 4 for r in triage_rows) / len(triage_rows) >= 0.35
    assert {r["expected"] for r in intent_rows} == {"next_dose", "next_visit", "my_vitals", "urgent", "ask_staff"}
    assert {r["lang"] for r in intent_rows} == {"en", "fr", "ar", "darija_ar", "darija_latin"}


def test_v2_sets_do_not_leak_into_training_data():
    tri = [json.loads(x)["text"] for x in (eval_ai.V2 / "triage_eval.v2.jsonl").read_text("utf-8").splitlines()]
    its = [json.loads(x)["text"] for x in (eval_ai.V2 / "intent_eval.v2.jsonl").read_text("utf-8").splitlines()]
    t_train = [r["text"] for r in _jsonl("triage_train.v1.jsonl") + _jsonl("triage_train.v2.jsonl")]
    i_train = [r["state"]["body"] for r in _jsonl("intent_train.v1.jsonl")] + [r["text"] for r in _jsonl("intent_train.v2.jsonl")]
    assert leaks(tri, t_train, []) == [] and leaks(its, i_train, []) == []
