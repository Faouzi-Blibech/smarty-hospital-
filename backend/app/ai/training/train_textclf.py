"""Train the triage and intent classifiers and export them to JSON (owner: Faouzi).

    pip install -r requirements-train.txt
    python -m app.ai.training.make_data
    python -m app.ai.training.train_textclf

Each model is scored on its hand-written evaluation set (`*_eval.v1.jsonl`), never on generated rows. Writes
`models/{triage,intent}.v1.json` (read by `app/ai/textclf.py`) and `models/{triage,intent}.v1.metrics.json`.
"""

import json
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

from app.ai.triage import _normalize, rule_floor

AI = Path(__file__).resolve().parent.parent
DATA, MODELS = AI / "data", AI / "models"
NGRAMS = (2, 5)


def _rows(name: str) -> list[dict]:
    return [json.loads(line) for line in (DATA / name).read_text(encoding="utf-8").splitlines() if line.strip()]


def fit(texts: list[str], labels: list) -> tuple:
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=NGRAMS, lowercase=False, sublinear_tf=True,
                          min_df=2, max_features=6000)
    clf = LogisticRegression(C=8.0, max_iter=2000, class_weight="balanced")
    make_pipeline(vec, clf).fit([_normalize(t) for t in texts], labels)
    return vec, clf


def export(name: str, vec, clf, metrics: dict) -> None:
    MODELS.mkdir(exist_ok=True)
    vocab = sorted(vec.vocabulary_, key=vec.vocabulary_.get)
    classes = [c.item() if hasattr(c, "item") else c for c in clf.classes_]
    model = {"version": 1, "ngram_range": list(NGRAMS), "classes": classes, "vocab": vocab,
             "idf": [round(float(x), 5) for x in vec.idf_],
             "coef": [[round(float(x), 5) for x in row] for row in clf.coef_],
             "intercept": [round(float(x), 5) for x in clf.intercept_]}
    (MODELS / f"{name}.json").write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")),
                                         encoding="utf-8")
    (MODELS / f"{name}.metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
                                                 encoding="utf-8")
    print(name, json.dumps({k: v for k, v in metrics.items() if k != "cases"}))


def _urgency_score(pairs: list[tuple[int, int]]) -> dict:
    n = len(pairs)
    return {"n": n, "exact": round(sum(p == e for p, e in pairs) / n, 3),
            "within_one": round(sum(abs(p - e) <= 1 for p, e in pairs) / n, 3),
            "under_triaged": sum(p < e for p, e in pairs),
            "urgent_missed": sum(e == 5 and p < 5 for p, e in pairs)}


def train_triage() -> None:
    train, test = _rows("triage_train.v1.jsonl"), _rows("triage_eval.v1.jsonl")
    vec, clf = fit([r["text"] for r in train], [r["urgency"] for r in train])
    model_only, shipped, cases = [], [], []
    for r in test:
        p = int(clf.predict(vec.transform([_normalize(r["text"])]))[0])
        final = max(p, rule_floor(r["text"]))
        model_only.append((p, r["urgency"]))
        shipped.append((final, r["urgency"]))
        cases.append({"text": r["text"], "expected": r["urgency"], "model": p, "final": final})
    export("triage.v1", vec, clf, {"train_rows": len(train), "model_only": _urgency_score(model_only),
                                   "rules_plus_model": _urgency_score(shipped), "cases": cases})


def train_intent() -> None:
    train, test = _rows("intent_train.v1.jsonl"), _rows("intent_eval.v1.jsonl")
    vec, clf = fit([r["state"]["body"] for r in train], [r["expected"]["intent"] for r in train])
    cases = [{"text": r["text"], "expected": r["intent"],
              "got": str(clf.predict(vec.transform([_normalize(r["text"])]))[0])} for r in test]
    hits = sum(c["got"] == c["expected"] for c in cases)
    export("intent.v1", vec, clf, {"train_rows": len(train), "accuracy": round(hits / len(cases), 3),
                                   "n": len(cases), "misses": [c for c in cases if c["got"] != c["expected"]]})


if __name__ == "__main__":
    train_triage()
    train_intent()
