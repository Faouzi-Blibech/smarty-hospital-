"""Train the triage and intent classifiers and export them to JSON (owner: Faouzi).

    pip install -r requirements-train.txt
    python -m app.ai.training.make_data               # the v1 template rows
    python -m app.ai.training.build_v2_data SRC_DIR   # the v2 independently written rows
    python -m app.ai.training.train_textclf [--v1-weight 0.5] [--c 8] [--max-features 6000]

Training uses the v1 template rows (down-weighted by --v1-weight) and the v2 rows. The triage model also gets its
risk threshold tau: the smallest P(urgency >= 4) at which the shipped decision raises a case to 4, chosen by
5-fold cross-validation on the TRAINING rows only, with the folds grouped by scenario (never an evaluation set). Writes
`models/{triage,intent}.v2.json` (read by `app/ai/textclf.py`) and `models/{triage,intent}.v2.metrics.json`.
The v1 hand-written eval sets are reported for context; tune against the v2 dev half, never the test half.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

from app.ai.triage import _normalize, model_text, rule_floor

AI = Path(__file__).resolve().parent.parent
DATA, MODELS = AI / "data", AI / "models"
NGRAMS = (2, 5)
URGENT = 4
TAU_RECALL_TARGET = 0.95  # tau: the largest threshold whose cross-validated recall on urgency >= 4 reaches this
CV_FOLDS, SEED = 5, 20261010
NAME = "v2"


def _rows(name: str) -> list[dict]:
    return [json.loads(line) for line in (DATA / name).read_text(encoding="utf-8").splitlines() if line.strip()]


def triage_rows(v1_weight: float) -> list[dict]:
    """[{text, urgency, w, src}] from the v1 template rows (weight v1_weight) and the v2 rows (weight 1)."""
    v1 = [{"text": r["text"], "urgency": r["urgency"], "w": v1_weight, "src": "v1"}
          for r in _rows("triage_train.v1.jsonl")] if v1_weight > 0 else []
    v2 = [{"text": r["text"], "urgency": r["urgency"], "w": 1.0, "src": "v2", "scenario": f"{r['flag']}|{r['urgency']}|{r['age']}"}
          for r in _rows("triage_train.v2.jsonl")]
    return v1 + v2


def intent_rows(v1_weight: float) -> list[dict]:
    """[{text, intent, w, src}]. The v1 rows use the nested {"state": {"body"}, "expected": {"intent"}} layout."""
    v1 = [{"text": r["state"]["body"], "intent": r["expected"]["intent"], "w": v1_weight, "src": "v1"}
          for r in _rows("intent_train.v1.jsonl")] if v1_weight > 0 else []
    v2 = [{"text": r["text"], "intent": r["intent"], "w": 1.0, "src": "v2"} for r in _rows("intent_train.v2.jsonl")]
    return v1 + v2


def fit(texts: list[str], labels: list, weights: list[float] | None = None, *, c: float = 8.0,
        max_features: int = 6000, min_df: int = 2, prep=_normalize):
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=NGRAMS, lowercase=False, sublinear_tf=True,
                          min_df=min_df, max_features=max_features)
    clf = LogisticRegression(C=c, max_iter=3000, class_weight="balanced")
    x = vec.fit_transform([prep(t) for t in texts])
    clf.fit(x, labels, sample_weight=weights)
    return vec, clf


def export(name: str, vec, clf, metrics: dict, extra: dict | None = None) -> None:
    MODELS.mkdir(exist_ok=True)
    vocab = sorted(vec.vocabulary_, key=vec.vocabulary_.get)
    classes = [c.item() if hasattr(c, "item") else c for c in clf.classes_]
    model = {"version": 1, "ngram_range": list(NGRAMS), "classes": classes, "vocab": vocab,
             "idf": [round(float(x), 5) for x in vec.idf_],
             "coef": [[round(float(x), 5) for x in row] for row in clf.coef_],
             "intercept": [round(float(x), 5) for x in clf.intercept_], **(extra or {})}
    (MODELS / f"{name}.json").write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")),
                                         encoding="utf-8")
    (MODELS / f"{name}.metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
                                                 encoding="utf-8")
    print(name, json.dumps({k: v for k, v in metrics.items() if k not in ("cases", "misses", "cv")}))


def _urgency_score(pairs: list[tuple[int, int]]) -> dict:
    n = len(pairs)
    return {"n": n, "exact": round(sum(p == e for p, e in pairs) / n, 3),
            "within_one": round(sum(abs(p - e) <= 1 for p, e in pairs) / n, 3),
            "under_triaged": sum(p < e for p, e in pairs),
            "urgent_missed": sum(e >= URGENT and p < URGENT for p, e in pairs)}


def cv_probabilities(rows: list[dict], kw: dict, *, grouped: bool = True) -> np.ndarray:
    """Out-of-fold class probabilities for the v2 rows. v1 rows are in every training fold, never scored.

    The three writers filled the same scenario slots (flag, urgency, age) in different languages, so a random split
    leaks translations of the held-out row into training. `grouped` keeps every row of a scenario in one fold.
    """
    v2 = [i for i, r in enumerate(rows) if r["src"] == "v2"]
    v1 = [i for i, r in enumerate(rows) if r["src"] == "v1"]
    y = np.array([r["urgency"] for r in rows])
    oof = np.zeros((len(rows), 5))
    if grouped:
        splits = StratifiedGroupKFold(CV_FOLDS, shuffle=True, random_state=SEED).split(v2, y[v2], [rows[i]["scenario"] for i in v2])
    else:
        splits = StratifiedKFold(CV_FOLDS, shuffle=True, random_state=SEED).split(v2, y[v2])
    for tr, te in splits:
        train_idx = [v2[i] for i in tr] + v1
        vec, clf = fit([rows[i]["text"] for i in train_idx], [rows[i]["urgency"] for i in train_idx],
                       [rows[i]["w"] for i in train_idx], **kw)
        x = vec.transform([kw.get("prep", _normalize)(rows[v2[i]]["text"]) for i in te])
        probs = clf.predict_proba(x)
        for j, i in enumerate(te):
            for k, cls in enumerate(clf.classes_):
                oof[v2[i], cls - 1] = probs[j, k]
    return oof[v2]


def sweep_tau(rows: list[dict], oof: np.ndarray) -> list[dict]:
    """Model-only decision on out-of-fold probabilities: max(argmax, 4 if P(>=4) >= tau).

    The red-flag rules are left out on purpose: they were written while reading these very rows, so their recall here
    is optimistic. tau only has to cover what the rules miss, so it is chosen on the model alone."""
    v2 = [r for r in rows if r["src"] == "v2"]
    floors = np.ones(len(v2), dtype=int)
    expected = np.array([r["urgency"] for r in v2])
    argmax = oof.argmax(axis=1) + 1
    p_urgent = oof[:, URGENT - 1:].sum(axis=1)
    out = []
    for tau in [round(0.05 * i, 2) for i in range(1, 20)] + [1.01]:
        final = np.maximum(np.maximum(floors, argmax), np.where(p_urgent >= tau, URGENT, 1))
        urgent, routine = expected >= URGENT, expected <= 2
        out.append({"tau": tau, "recall_ge4": round(float((final[urgent] >= URGENT).mean()), 3),
                    "urgent_missed": int((final[urgent] < URGENT).sum()),
                    "over_triaged_routine": round(float((final[routine] >= URGENT).mean()), 3),
                    "exact": round(float((final == expected).mean()), 3),
                    "within_one": round(float((abs(final - expected) <= 1).mean()), 3)})
    return out


def choose_tau(table: list[dict]) -> float:
    """The largest tau whose cross-validated recall on urgency >= 4 reaches the target (least over-triage);
    the most sensitive tau when none does. The table comes from the scenario-grouped split."""
    ok = [row["tau"] for row in table if row["recall_ge4"] >= TAU_RECALL_TARGET and row["tau"] <= 1.0]
    return max(ok) if ok else min(row["tau"] for row in table)


def train_triage(args) -> None:
    rows = triage_rows(args.v1_weight)
    kw = {"c": args.c, "max_features": args.max_features, "min_df": args.min_df, "prep": model_text}
    table = sweep_tau(rows, cv_probabilities(rows, kw))
    table_random = sweep_tau(rows, cv_probabilities(rows, kw, grouped=False))
    tau = args.tau if args.tau is not None else choose_tau(table)
    vec, clf = fit([r["text"] for r in rows], [r["urgency"] for r in rows], [r["w"] for r in rows], **kw)
    ev = _rows("triage_eval.v1.jsonl")
    model_only, shipped = [], []
    for r in ev:
        p = int(clf.predict(vec.transform([model_text(r["text"])]))[0])
        model_only.append((p, r["urgency"]))
        shipped.append((max(p, rule_floor(r["text"])), r["urgency"]))
    export(f"triage.{NAME}", vec, clf,
           {"train_rows": len(rows), "v1_weight": args.v1_weight, "c": args.c, "max_features": args.max_features,
            "risk_tau": tau, "tau_rule": f"largest tau with cross-validated recall(urgency>=4) >= {TAU_RECALL_TARGET}",
            "cv": {"folds": CV_FOLDS, "scored_rows": sum(r["src"] == "v2" for r in rows), "split": "grouped by scenario",
                  "tau_sweep": table, "tau_sweep_random_split_for_context": table_random},
            "v1_eval": {"model_only": _urgency_score(model_only), "rules_plus_model": _urgency_score(shipped)}},
           {"risk_tau": tau})


def train_intent(args) -> None:
    rows = intent_rows(args.v1_weight)
    kw = {"c": args.c, "max_features": args.max_features, "min_df": args.min_df}
    vec, clf = fit([r["text"] for r in rows], [r["intent"] for r in rows], [r["w"] for r in rows], **kw)
    ev = _rows("intent_eval.v1.jsonl")
    cases = [{"text": r["text"], "expected": r["intent"],
              "got": str(clf.predict(vec.transform([_normalize(r["text"])]))[0])} for r in ev]
    hits = sum(c["got"] == c["expected"] for c in cases)
    export(f"intent.{NAME}", vec, clf,
           {"train_rows": len(rows), "v1_weight": args.v1_weight, "c": args.c, "max_features": args.max_features,
            "v1_eval": {"accuracy": round(hits / len(cases), 3), "n": len(cases)},
            "misses": [c for c in cases if c["got"] != c["expected"]]})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--v1-weight", type=float, default=0.3, help="sample weight of the v1 template rows (0 drops them)")
    ap.add_argument("--c", type=float, default=8.0)
    ap.add_argument("--max-features", type=int, default=15000)
    ap.add_argument("--min-df", type=int, default=2)
    ap.add_argument("--tau", type=float, help="override the cross-validated tau (experiments only)")
    ap.add_argument("--only", choices=("triage", "intent"))
    args = ap.parse_args()
    if args.only != "intent":
        train_triage(args)
    if args.only != "triage":
        train_intent(args)


if __name__ == "__main__":
    main()
