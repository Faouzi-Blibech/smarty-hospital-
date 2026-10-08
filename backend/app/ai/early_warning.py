"""Early warning (owner: Wali): partial NEWS2 (HR, SpO2 scale 1, temperature) + a rolling z-score trend.

Single-parameter bands match the RCP NEWS2 chart (2017) for these three parameters. Respiration rate,
blood pressure, consciousness and supplemental O2 are not measured, so the score is *partial*. The severity
labels are this app's scale from docs/architecture.md §6, not the RCP clinical-response bands.
Prototype only: not clinically validated. A nurse or doctor always acks the alert.
"""

from dataclasses import dataclass, field
from statistics import mean, pstdev

TREND_MIN_POINTS = 10


@dataclass
class News2Result:
    score: int
    severity: str  # none | low | medium | high | critical
    parts: dict[str, int] = field(default_factory=dict)


def _hr(v: int) -> int:
    if v <= 40:
        return 3
    if v <= 50:
        return 1
    if v <= 90:
        return 0
    if v <= 110:
        return 1
    if v <= 130:
        return 2
    return 3


def _spo2(v: int) -> int:
    if v <= 91:
        return 3
    if v <= 93:
        return 2
    if v <= 95:
        return 1
    return 0


def _temp(v: float) -> int:
    if v <= 35.0:
        return 3
    if v <= 36.0:
        return 1
    if v <= 38.0:
        return 0
    if v <= 39.0:
        return 1
    return 2


def score_news2(hr: int | None, spo2: int | None, temp: float | None) -> News2Result:
    """Scores only the parameters that are present (a `null` reading is skipped, never an error)."""
    parts: dict[str, int] = {}
    if hr is not None:
        parts["hr"] = _hr(hr)
    if spo2 is not None:
        parts["spo2"] = _spo2(spo2)
    if temp is not None:
        parts["temp"] = _temp(round(temp, 1))
    s = sum(parts.values())
    if s >= 7:
        sev = "critical"
    elif s >= 5 or 3 in parts.values():
        sev = "high"
    elif s >= 3:
        sev = "medium"
    elif s >= 1:
        sev = "low"
    else:
        sev = "none"
    return News2Result(s, sev, parts)


def trend_z(history: list[float], value: float) -> float | None:
    """z-score of `value` against `history`; None with too little or flat history."""
    if len(history) < TREND_MIN_POINTS:
        return None
    sd = pstdev(history)
    if sd == 0:
        return None
    return (value - mean(history)) / sd
