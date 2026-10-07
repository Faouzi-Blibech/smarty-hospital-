import pytest

from app.ai.early_warning import score_news2, trend_z


@pytest.mark.parametrize("hr,exp", [(40, 3), (41, 1), (50, 1), (51, 0), (90, 0), (91, 1), (110, 1), (111, 2),
                                    (130, 2), (131, 3)])
def test_hr_bands(hr, exp):
    assert score_news2(hr, 98, 37.0).parts["hr"] == exp


@pytest.mark.parametrize("spo2,exp", [(91, 3), (92, 2), (93, 2), (94, 1), (95, 1), (96, 0)])
def test_spo2_bands(spo2, exp):
    assert score_news2(80, spo2, 37.0).parts["spo2"] == exp


@pytest.mark.parametrize("t,exp", [(35.0, 3), (35.1, 1), (36.0, 1), (36.1, 0), (38.0, 0), (38.1, 1), (39.0, 1),
                                   (39.1, 2)])
def test_temp_bands(t, exp):
    assert score_news2(80, 98, t).parts["temp"] == exp


def test_severity():
    assert score_news2(80, 98, 37.0).severity == "none"
    assert score_news2(95, 95, 37.0).severity == "low"          # 1+1
    assert score_news2(115, 95, 37.0).severity == "medium"      # 2+1
    assert score_news2(80, 91, 37.0).severity == "high"         # single 3
    assert score_news2(131, 91, 39.1).severity == "critical"    # 3+3+2 = 8


def test_news2_ignores_missing():
    r = score_news2(None, 97, None)
    assert r.score == 0 and set(r.parts) == {"spo2"}
    assert score_news2(None, None, None).severity == "none"


def test_trend():
    hist = [80, 82, 79, 81, 80, 78, 82, 81, 80, 79]
    assert trend_z(hist, 81) is not None and abs(trend_z(hist, 81)) < 1
    assert trend_z(hist, 120) > 3
    assert trend_z([80, 80], 120) is None   # fewer than 10 points → no trend
    assert trend_z([80] * 12, 120) is None  # flat history → no z-score
