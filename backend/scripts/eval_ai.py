"""Evaluate the shipped triage and patient-assistant intent models on the v2 (independent) and v1 eval sets.

    python scripts/eval_ai.py [--out report.json] [--no-v1]

Prints one JSON report. Triage is scored on the final urgency (red-flag rules + model). Intent is scored on the
shipped path: red flags first (-> urgent), else classify_intent. Rows are `{"text", "age", "expected", ...}` (v2)
or the older `{"text", "urgency"}` / `{"text", "intent"}` (v1).
"""

import argparse
import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ai import assistant, triage  # noqa: E402

V2 = ROOT / "tests" / "fixtures" / "ai_eval"
V1 = ROOT / "app" / "ai" / "data"
URGENT_AT = 4  # expected >= 4 must end >= 4
ROUTINE_AT = 2  # expected <= 2 must not end >= 4


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def _timing(ms: list[float]) -> dict:
    s = sorted(ms)
    return {"median_ms": round(statistics.median(s), 3), "p95_ms": round(s[int(0.95 * (len(s) - 1))], 3)}


def _score(cases: list[dict]) -> dict:
    n = len(cases)
    if not n:
        return {"n": 0}
    exact = sum(c["final"] == c["expected"] for c in cases)
    within = sum(abs(c["final"] - c["expected"]) <= 1 for c in cases)
    return {"n": n, "exact": round(exact / n, 3), "within_one": round(within / n, 3),
            "under_triaged": sum(c["final"] < c["expected"] for c in cases),
            "urgent_missed": sum(c["expected"] >= URGENT_AT and c["final"] < URGENT_AT for c in cases),
            "over_triaged_routine": sum(c["expected"] <= ROUTINE_AT and c["final"] >= URGENT_AT for c in cases)}


def _by(cases: list[dict], key: str) -> dict:
    groups = defaultdict(list)
    for c in cases:
        groups[c.get(key) or "unknown"].append(c)
    return {k: _score(v) for k, v in sorted(groups.items())}


def eval_triage(rows: list[dict]) -> dict:
    cases, ms = [], []
    for r in rows:
        expected = r["expected"] if "expected" in r else r["urgency"]
        t0 = time.perf_counter()
        res = triage.triage(r["text"], [], r.get("age"))
        ms.append((time.perf_counter() - t0) * 1000)
        cases.append({"text": r["text"], "age": r.get("age"), "expected": expected, "final": res.urgency,
                      "model_urgency": res.model_urgency, "red_flags": res.red_flags, "lang": r.get("lang"),
                      "category": r.get("category"), "flag": r.get("flag")})
    flagged = [c for c in cases if c["flag"]]
    recall = {}
    for f in sorted({c["flag"] for c in flagged}):
        rs = [c for c in flagged if c["flag"] == f]
        recall[f] = {"n": len(rs), "rule_hit": sum(f in c["red_flags"] for c in rs),
                     "final_ge_expected": sum(c["final"] >= c["expected"] for c in rs)}
    misses = [c for c in cases if c["expected"] >= URGENT_AT and c["final"] < URGENT_AT]
    return {**_score(cases), "by_lang": _by(cases, "lang"), "by_category": _by(cases, "category"),
            "red_flag_recall": recall, "urgent_misses": misses, "timing": _timing(ms)}


def shipped_intent(text: str) -> tuple[str, str]:
    """(intent, source): what assistant.answer() would route to."""
    if triage.match_red_flags(text):
        return "urgent", "red_flag_rules"
    intent, _conf, source = assistant.classify_intent(text)
    return intent, source


def eval_intent(rows: list[dict]) -> dict:
    cases, ms = [], []
    for r in rows:
        expected = r["expected"] if "expected" in r else r["intent"]
        t0 = time.perf_counter()
        got, source = shipped_intent(r["text"])
        ms.append((time.perf_counter() - t0) * 1000)
        cases.append({"text": r["text"], "expected": expected, "got": got, "source": source,
                      "lang": r.get("lang"), "category": r.get("category")})
    n = len(cases)

    def acc(cs: list[dict]) -> dict:
        return {"n": len(cs), "accuracy": round(sum(c["expected"] == c["got"] for c in cs) / len(cs), 3)}

    def grouped(key: str) -> dict:
        g = defaultdict(list)
        for c in cases:
            g[c[key] or "unknown"].append(c)
        return {k: acc(v) for k, v in sorted(g.items())}

    wrong = [c for c in cases if c["expected"] != c["got"]]
    confusion = Counter(f"{c['expected']} -> {c['got']}" for c in wrong)
    return {"n": n, "accuracy": round((n - len(wrong)) / n, 3), "by_intent": grouped("expected"),
            "by_lang": grouped("lang"), "by_category": grouped("category"),
            "by_source": dict(Counter(c["source"] for c in cases)),
            "confusion_pairs": dict(confusion.most_common()), "misses": wrong, "timing": _timing(ms)}


SPLITS = {"all": "eval", "dev": "dev", "test": "test"}  # dev: tune against it; test: sealed, final scores only


def run(include_v1: bool = True, split: str = "all") -> dict:
    part = SPLITS[split]
    report = {"triage": {"v2": eval_triage(load_jsonl(V2 / f"triage_{part}.v2.jsonl"))},
              "intent": {"v2": eval_intent(load_jsonl(V2 / f"intent_{part}.v2.jsonl"))}}
    if include_v1:
        report["triage"]["v1"] = eval_triage(load_jsonl(V1 / "triage_eval.v1.jsonl"))
        report["intent"]["v1"] = eval_intent(load_jsonl(V1 / "intent_eval.v1.jsonl"))
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", help="also write the JSON report to this file")
    ap.add_argument("--no-v1", action="store_true", help="only the v2 sets")
    ap.add_argument("--split", choices=SPLITS, default="all",
                    help="v2 half: dev (tune against it), test (sealed: final scores only) or all")
    args = ap.parse_args()
    text = json.dumps(run(include_v1=not args.no_v1, split=args.split), ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    sys.stdout.buffer.write((text + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
