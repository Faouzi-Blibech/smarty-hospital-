"""Patient assistant (owner: Faouzi, plans/FAOUZI.md Task 11, stretch).

Scoped to the caller's own record: the router loads only that patient's rows and passes them in, so the model
never sees anyone else's data. Red-flag questions bypass the LLM and send the patient to staff immediately.
"""

from datetime import datetime, timedelta, timezone

from pydantic import BaseModel

from app.ai.llm import LLMUnavailable, complete_json
from app.ai.triage import _normalize, match_red_flags

TUNIS = timezone(timedelta(hours=1))  # Africa/Tunis: UTC+1, no DST
SOURCES = ("med_doses", "appointments", "vitals")
DOSE_WORDS = ("dose", "medic", "pill", "comprime", "traitement", "dwa", "دواء", "حبوب")
VISIT_WORDS = ("appointment", "rendez-vous", "rendez vous", "rdv", "visit", "consultation", "maw3ed", "موعد")
URGENT = ("This could be urgent. Press the call-nurse button on your bedside unit now, "
          "or tell any member of staff straight away.")
ASK_STAFF = "I can't answer that. Please ask your nurse or doctor; you can press the call-nurse button anytime."


class _LlmAnswer(BaseModel):
    answer: str
    sources: list[str]


def _local(dt: datetime) -> datetime:
    return dt.astimezone(TUNIS)


def assistant_context(patient, doses_today: list, next_visit, latest_vital, *, now: datetime) -> dict:
    """The only data the assistant may use. Rows follow data-model.md (med_doses, appointments, vitals)."""
    now_hhmm = _local(now).strftime("%H:%M")
    upcoming = sorted((d for d in doses_today if d.status == "scheduled"), key=lambda d: d.time_of_day)
    nxt = next((d for d in upcoming if d.time_of_day >= now_hhmm), None)
    vit = None
    if latest_vital is not None:
        vit = {"hr": latest_vital.hr, "spo2": latest_vital.spo2, "temp": latest_vital.temp,
               "at": _local(latest_vital.ts).strftime("%H:%M")}
    visit = None
    if next_visit is not None and next_visit.slot_at is not None:
        v = _local(next_visit.slot_at)
        visit = f"{v:%A} {v.day} {v:%b} at {v:%H:%M}"
    return {"next_dose": {"time": nxt.time_of_day, "meds": list(nxt.meds)} if nxt else None,
            "next_visit": visit, "latest_vitals": vit, "names": [patient.first_name, patient.last_name]}


def _fallback(question: str, ctx: dict) -> dict:
    q = _normalize(question)
    if any(_normalize(w) in q for w in DOSE_WORDS):
        d = ctx["next_dose"]
        if d:
            return {"answer": f"Your next dose is at {d['time']}: {', '.join(d['meds'])}.", "sources": ["med_doses"]}
        return {"answer": "You have no more doses scheduled today.", "sources": ["med_doses"]}
    if any(_normalize(w) in q for w in VISIT_WORDS):
        if ctx["next_visit"]:
            return {"answer": f"Your next appointment is on {ctx['next_visit']}.", "sources": ["appointments"]}
        return {"answer": "You have no confirmed appointment yet; the hospital will contact you.",
                "sources": ["appointments"]}
    return {"answer": ASK_STAFF, "sources": []}


def answer(question: str, ctx: dict) -> dict:
    """POST /ai/assistant body: {"answer", "sources"}."""
    if match_red_flags(question):
        return {"answer": URGENT, "sources": ["safety_rules"]}
    record = (f"Next dose today: {ctx['next_dose'] or 'none'}\nNext appointment: {ctx['next_visit'] or 'none'}\n"
              f"Latest vitals: {ctx['latest_vitals'] or 'none'}")
    try:
        out = complete_json("assistant", f"Record excerpt:\n{record}\n\nPatient question: {question}", _LlmAnswer,
                            names=ctx["names"])
    except LLMUnavailable:
        return _fallback(question, ctx)
    return {"answer": out.answer, "sources": [s for s in out.sources if s in SOURCES]}
