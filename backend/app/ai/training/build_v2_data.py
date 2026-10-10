"""Validate, dedupe and merge the independently written v2 training rows (owner: Faouzi).

    python -m app.ai.training.build_v2_data SRC_DIR

SRC_DIR holds `*_triage.jsonl` (text, age, urgency, lang, category, flag) and `*_intent.jsonl` (text, intent, lang)
files from several writers. Rows are validated, deduped against each other and against every evaluation set
(v1 eval, v2 dev and test halves), and written to `data/triage_train.v2.jsonl` and `data/intent_train.v2.jsonl`.
A row is a leak when it equals an eval row, has a char-3gram Jaccard of 0.8 or more with one, or contains (or is
contained in) a whole eval phrase of three words or more. The eval sets are only compared with, never printed.
"""

import json
import re
import sys
from pathlib import Path

from app.ai.triage import _normalize

AI = Path(__file__).resolve().parent.parent
DATA = AI / "data"
FIXTURES = AI.parent.parent / "tests" / "fixtures" / "ai_eval"
LANGS = {"en", "fr", "ar", "darija_ar", "darija_latin"}
INTENTS = {"next_dose", "next_visit", "my_vitals", "urgent", "ask_staff"}
FLAGS = {"chest_pain", "stroke_signs", "severe_bleeding", "breathing", "loss_of_consciousness", "pregnancy_bleeding",
         "high_fever_child", "suicide_self_harm", "overdose", "anaphylaxis", "seizure", "medication_error",
         "thunderclap_headache", "hypertensive_crisis", "reduced_fetal_movement", "elderly_confusion",
         "elderly_fall", "diabetic_emergency", "acute_abdomen", "head_injury", "sepsis"}
CATEGORIES = {"red_flag_explicit", "red_flag_paraphrase", "negation", "worried_routine", "borderline", "routine"}
JACCARD = 0.8
MIN_PHRASE_WORDS = 3


def key(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", _normalize(text))).strip()


def grams(k: str) -> set[str]:
    k = f" {k} "
    return {k[i:i + 3] for i in range(len(k) - 2)}


def jsonl(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def eval_keys() -> list[str]:
    """Keys of every evaluation text: v1 eval, v2 dev and v2 test (the full v2 eval file is their union)."""
    texts = [r["text"] for n in ("triage_eval.v1.jsonl", "intent_eval.v1.jsonl") for r in jsonl(DATA / n)]
    texts += [r["text"] for part in ("dev", "test") for n in ("triage", "intent")
              for r in jsonl(FIXTURES / f"{n}_{part}.v2.jsonl")]
    return [key(t) for t in texts]


class Dedupe:
    """Accepts a text unless it duplicates one already accepted or one of the reference keys."""

    def __init__(self, reference: list[str]):
        self.ref = [(k, grams(k)) for k in reference]
        self.seen: list[tuple[str, set[str]]] = []
        self.exact = {k for k, _ in self.ref}

    @staticmethod
    def _similar(k: str, g: set[str], other: str, og: set[str]) -> bool:
        if k == other:
            return True
        if len(g | og) and len(g & og) / len(g | og) >= JACCARD:
            return True
        short, long = sorted((k, other), key=len)
        return len(short.split()) >= MIN_PHRASE_WORDS and f" {short} " in f" {long} "

    def reject_reason(self, text: str) -> str | None:
        k = key(text)
        g = grams(k)
        if not k:
            return "empty"
        if any(self._similar(k, g, o, og) for o, og in self.ref):
            return "eval_leak"
        if any(self._similar(k, g, o, og) for o, og in self.seen):
            return "duplicate"
        return None

    def add(self, text: str) -> None:
        k = key(text)
        self.seen.append((k, grams(k)))


def _valid_triage(r: dict) -> bool:
    return (isinstance(r.get("text"), str) and r["text"].strip() != "" and r.get("urgency") in (1, 2, 3, 4, 5)
            and r.get("lang") in LANGS and r.get("category") in CATEGORIES and isinstance(r.get("age"), int)
            and (r.get("flag") is None or r["flag"] in FLAGS))


def _valid_intent(r: dict) -> bool:
    return isinstance(r.get("text"), str) and r["text"].strip() != "" and r.get("intent") in INTENTS \
        and r.get("lang") in LANGS


def build(src: Path, kind: str, valid, reference: list[str]) -> tuple[list[dict], dict]:
    rows = [r for f in sorted(src.glob(f"*_{kind}.jsonl")) for r in jsonl(f)]
    dd, kept, dropped = Dedupe(reference), [], {"invalid": 0, "eval_leak": 0, "duplicate": 0, "empty": 0}
    for r in rows:
        if not valid(r):
            dropped["invalid"] += 1
            continue
        why = dd.reject_reason(r["text"])
        if why:
            dropped[why] += 1
            continue
        dd.add(r["text"])
        kept.append(r)
    return kept, {"read": len(rows), "kept": len(kept), "dropped": dropped}


def write(name: str, rows: list[dict]) -> None:
    (DATA / name).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def main(src: Path) -> None:
    ref = eval_keys()
    tri, tri_stats = build(src, "triage", _valid_triage, ref)
    its, its_stats = build(src, "intent", _valid_intent, ref)
    write("triage_train.v2.jsonl", tri)
    write("intent_train.v2.jsonl", its)
    print("triage", json.dumps(tri_stats))
    print("intent", json.dumps(its_stats))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
