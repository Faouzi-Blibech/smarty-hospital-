"""Trained text classifiers: character n-gram TF-IDF + multinomial logistic regression (owner: Faouzi).

Used for triage urgency (`models/triage.v1.json`) and assistant intents (`models/intent.v1.json`). Trained with
scikit-learn by `app/ai/training/train_textclf.py`, exported to plain JSON, and scored here in pure Python, so the
API needs neither scikit-learn nor a pickle. Character n-grams cope with French accents, Arabic script and Darija
spelling variants without a tokenizer.
"""

import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

MODELS = Path(__file__).parent / "models"


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
def load(name: str) -> dict | None:
    """`name` like "triage.v1"; None when that model file is not shipped."""
    path = MODELS / f"{name}.json"
    if not path.exists():
        return None
    m = json.loads(path.read_text(encoding="utf-8"))
    m["index"] = {g: i for i, g in enumerate(m["vocab"])}
    return m


def predict_proba(m: dict, normalized_text: str) -> dict:
    """{class: probability} for already-normalised text."""
    counts = Counter(g for g in char_wb_ngrams(normalized_text, *m["ngram_range"]) if g in m["index"])
    feats = {m["index"][g]: (1 + math.log(c)) * m["idf"][m["index"][g]] for g, c in counts.items()}
    norm = math.sqrt(sum(v * v for v in feats.values())) or 1.0
    logits = [b + sum(row[i] * v / norm for i, v in feats.items()) for row, b in zip(m["coef"], m["intercept"])]
    top = max(logits)
    exp = [math.exp(z - top) for z in logits]
    total = sum(exp)
    return {c: e / total for c, e in zip(m["classes"], exp)}
