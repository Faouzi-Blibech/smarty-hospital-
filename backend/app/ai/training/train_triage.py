"""Train the triage classifier and export it to JSON (owner: Faouzi).

    pip install -r requirements-train.txt
    python -m app.ai.training.make_data
    python -m app.ai.training.train_triage

Character n-grams cope with French accents, Arabic script and Darija spelling variants without a tokenizer.
Prints accuracy on the hand-written `triage_eval.v1.jsonl` for the model alone and for the shipped decision
(red-flag floor + model), and writes `models/triage.v1.json` and `models/triage.v1.metrics.json`.
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


def _score(pairs: list[tuple[int, int]]) -> dict:
    n = len(pairs)
    return {"n": n, "exact": round(sum(p == e for p, e in pairs) / n, 3),
            "within_one": round(sum(abs(p - e) <= 1 for p, e in pairs) / n, 3),
            "under_triaged": sum(p < e for p, e in pairs),
            "urgent_missed": sum(e == 5 and p < 5 for p, e in pairs)}


def main() -> None:
    train, test = _rows("triage_train.v1.jsonl"), _rows("triage_eval.v1.jsonl")
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=NGRAMS, lowercase=False, sublinear_tf=True,
                          min_df=2, max_features=6000)
    clf = LogisticRegression(C=8.0, max_iter=2000, class_weight="balanced")
    pipe = make_pipeline(vec, clf).fit([_normalize(r["text"]) for r in train], [r["urgency"] for r in train])

    model_only, shipped, cases = [], [], []
    for r in test:
        p = int(pipe.predict([_normalize(r["text"])])[0])
        final = max(p, rule_floor(r["text"]))
        model_only.append((p, r["urgency"]))
        shipped.append((final, r["urgency"]))
        cases.append({"text": r["text"], "expected": r["urgency"], "model": p, "final": final})
    metrics = {"train_rows": len(train), "model_only": _score(model_only), "rules_plus_model": _score(shipped),
               "cases": cases}
    print(json.dumps({k: v for k, v in metrics.items() if k != "cases"}, indent=2))

    MODELS.mkdir(exist_ok=True)
    vocab = sorted(vec.vocabulary_, key=vec.vocabulary_.get)
    export = {"version": 1, "ngram_range": list(NGRAMS), "classes": [int(c) for c in clf.classes_],
              "vocab": vocab, "idf": [round(float(x), 5) for x in vec.idf_],
              "coef": [[round(float(x), 5) for x in row] for row in clf.coef_],
              "intercept": [round(float(x), 5) for x in clf.intercept_]}
    (MODELS / "triage.v1.json").write_text(json.dumps(export, ensure_ascii=False, separators=(",", ":")),
                                           encoding="utf-8")
    (MODELS / "triage.v1.metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
                                                   encoding="utf-8")


if __name__ == "__main__":
    main()
