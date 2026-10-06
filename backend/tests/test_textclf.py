import math

import pytest

from app.ai import textclf

SAMPLES = [
    "douleur thoracique depuis 2 jours",
    "ألم في الصدر منذ يومين",
    "a b  cd   efghij",
    "3andi waja3 fi sadri",
    "  Fièvre  du nourrisson 39.5 ",
]


def test_char_wb_ngrams_match_scikit_learn():
    feature_extraction = pytest.importorskip("sklearn.feature_extraction.text")
    analyze = feature_extraction.TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5),
                                                 lowercase=False).build_analyzer()
    for s in SAMPLES:
        assert textclf.char_wb_ngrams(s, 2, 5) == analyze(s), s


def test_triage_model_probabilities():
    m = textclf.load("triage.v1")
    assert m is not None
    p = textclf.predict_proba(m, "douleur thoracique depuis 2 jours")
    assert sorted(p) == [1, 2, 3, 4, 5]
    assert math.isclose(sum(p.values()), 1.0, rel_tol=1e-9)


def test_missing_model_is_none():
    assert textclf.load("nope.v1") is None


def test_shipped_triage_model_scores_chest_pain_as_most_urgent():
    m = textclf.load("triage.v1")
    p = textclf.predict_proba(m, "douleur dans la poitrine depuis ce matin")
    assert max(p, key=p.get) == 5
