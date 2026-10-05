"""Trained triage classifier: character n-gram TF-IDF + multinomial logistic regression (owner: Faouzi).

Trained by `app/ai/training/train_triage.py` on synthetic referrals, exported to plain JSON
(`models/triage.v1.json`), and scored here in pure Python so the API needs neither scikit-learn nor a pickle.
The red-flag rules in `triage.py` keep the last word: this model can raise urgency, never lower it below the floor.
"""

import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

MODEL = Path(__file__).parent / "models" / "triage.v1.json"


def char_wb_ngrams(text: str, n_min: int, n_max: int) -> list[str]:
    """Same features as scikit-learn's `analyzer="char_wb"`: n-grams inside space-padded words."""
    grams = []
    for word in re.split(r"\s+", text):
        if not word:
            continue
        w = f" {word} "
        for n in range(n_min, n_max + 1):
            if len(w) <= n:  # scikit-learn keeps a short word once, whole, then stops
                grams.append(w)
                break
            grams += [w[i:i + n] for i in range(len(w) - n + 1)]
    return grams


@lru_cache
def load() -> dict | None:
    if not MODEL.exists():
        return None
    m = json.loads(MODEL.read_text(encoding="utf-8"))
    m["index"] = {g: i for i, g in enumerate(m["vocab"])}
    return m


def predict_proba(normalized_text: str, model: dict | None = None) -> dict[int, float] | None:
    """{urgency: probability} for already-normalised text, or None when no model is shipped."""
    m = model or load()
    if m is None:
        return None
    counts = Counter(g for g in char_wb_ngrams(normalized_text, *m["ngram_range"]) if g in m["index"])
    feats = {m["index"][g]: (1 + math.log(c)) * m["idf"][m["index"][g]] for g, c in counts.items()}
    norm = math.sqrt(sum(v * v for v in feats.values())) or 1.0
    logits = [b + sum(row[i] * v / norm for i, v in feats.items()) for row, b in zip(m["coef"], m["intercept"])]
    top = max(logits)
    exp = [math.exp(z - top) for z in logits]
    total = sum(exp)
    return {int(c): e / total for c, e in zip(m["classes"], exp)}
