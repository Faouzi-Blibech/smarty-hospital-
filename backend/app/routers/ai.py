"""AI routes (owner: Faouzi). Contract: api.md → AI. Every module works with LLM_PROVIDER=none; an LLM only
rewrites the summary text through app/ai/llm.py. A human reviews every output (`human_confirmed_by`).
"""

import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.ai import assistant, chat, copilot
from app.ai.triage import triage
from app.auth.deps import check_patient_access, require_roles
from app.db import get_db
from app.errors import ApiError, not_found
from app.ids import new_id
from app.models import (AiSummary, Appointment, ChatConversation, ChatMessage, MedDose, Note, NotebookEntry, Patient,
                        Prescription, User, Vital)
from app.services import record_sources
from app.services.audit import audit
from app.services.schedule import local_to_utc, today_local

router = APIRouter(prefix="/ai", tags=["ai"])


class TriageIn(BaseModel):
    referral_text: str = Field(min_length=1, max_length=4000)
    symptoms: list[str] = []
    age: int | None = Field(default=None, ge=0, le=130)


class AssistantIn(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=2000)


class ChatIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    patient_id: str | None = None  # doctors and nurses: required; patients: always their own record
    history: list[ChatTurn] = Field(default=[], max_length=12)
    lang: str | None = Field(default=None, pattern="^(en|fr|ar)$")


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _name(db: Session, user_id: str | None) -> str | None:
    u = db.get(User, user_id) if user_id else None
    return u.name if u else None


@router.post("/triage")
def triage_preview(body: TriageIn, user: User = Depends(require_roles("admin", "doctor"))) -> dict:
    """Preview only: nothing is stored (the stored triage runs in POST /appointments)."""
    return triage(body.referral_text, body.symptoms, body.age).model_dump()


# --- daily summary ---------------------------------------------------------------------------------------------

def _latest_summary(db: Session, patient_id: str) -> AiSummary | None:
    return db.scalar(select(AiSummary).where(AiSummary.patient_id == patient_id)
                     .order_by(AiSummary.created_at.desc(), AiSummary.id.desc()).limit(1))


def _summary_out(db: Session, row: AiSummary) -> dict:
    out = copilot.summary_payload(row)
    based_on = (row.ai_suggested or {}).get("based_on")
    out.update(human_confirmed_by_name=_name(db, row.human_confirmed_by), based_on=based_on,
               reviewed_at=(row.ai_suggested or {}).get("reviewed_at") if row.human_confirmed_by else None)
    return out


def _new_summary(db: Session, p: Patient, now: datetime) -> AiSummary:
    since = now - timedelta(hours=24)
    vitals = db.scalars(select(Vital).where(Vital.patient_id == p.id, Vital.ts >= since).order_by(Vital.ts)).all()
    notes = db.scalars(select(Note).where(Note.patient_id == p.id, Note.created_at >= since)
                       .order_by(Note.created_at)).all()
    rxs = db.scalars(select(Prescription).where(Prescription.patient_id == p.id)).all()
    doses = db.scalar(select(func.count()).select_from(MedDose).where(
        MedDose.patient_id == p.id, MedDose.scheduled_at >= since, MedDose.scheduled_at <= now)) or 0
    result = copilot.summarize(**copilot.summary_inputs(p, vitals, notes, rxs))
    result.pop("generated_at", None)
    result["based_on"] = {"vitals": len(vitals), "doses": doses, "notes": len(notes)}
    row = AiSummary(id=new_id(db, "ais"), patient_id=p.id, ai_suggested=result)
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


@router.get("/summary/{patient_id}")
def get_summary(patient_id: str, request: Request, user: User = Depends(require_roles("doctor")),
                db: Session = Depends(get_db)) -> dict:
    p = check_patient_access(db, user, patient_id, resource="ai_summary", ip=_ip(request))
    now = datetime.now(UTC)
    row = _latest_summary(db, p.id)
    if not copilot.is_fresh(row, now=now):
        row = _new_summary(db, p, now)
    out = _summary_out(db, row)
    db.commit()
    return out


def _review(db: Session, user: User, patient_id: str, request: Request, *, reviewed: bool) -> dict:
    check_patient_access(db, user, patient_id, write=True, resource="ai_summary", ip=_ip(request))
    row = _latest_summary(db, patient_id)
    if row is None:
        raise not_found("summary")
    if reviewed:
        copilot.apply_review(row, user_id=user.id)
        stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    else:
        row.human_confirmed_by = None
        stamp = None
    row.ai_suggested = {**row.ai_suggested, "reviewed_at": stamp}  # new dict so the JSONB change is saved
    db.flush()
    out = _summary_out(db, row)
    db.commit()
    return out


@router.post("/summary/{patient_id}/review")
def review_summary(patient_id: str, request: Request, user: User = Depends(require_roles("doctor")),
                   db: Session = Depends(get_db)) -> dict:
    return _review(db, user, patient_id, request, reviewed=True)


@router.delete("/summary/{patient_id}/review")
def undo_review(patient_id: str, request: Request, user: User = Depends(require_roles("doctor")),
                db: Session = Depends(get_db)) -> dict:
    return _review(db, user, patient_id, request, reviewed=False)


# --- patient assistant -----------------------------------------------------------------------------------------

def _patient_ctx(db: Session, p: Patient) -> dict:
    now = datetime.now(UTC)
    day = today_local()
    doses = db.scalars(select(MedDose).where(MedDose.patient_id == p.id,
                                             MedDose.scheduled_at >= local_to_utc(day, "00:00"),
                                             MedDose.scheduled_at < local_to_utc(day + timedelta(days=1), "00:00"))
                       ).all()
    visit = db.scalar(select(Appointment).where(Appointment.patient_id == p.id, Appointment.status == "confirmed",
                                                Appointment.slot_at >= now)
                      .order_by(Appointment.slot_at).limit(1))
    vital = db.scalar(select(Vital).where(Vital.patient_id == p.id).order_by(Vital.ts.desc()).limit(1))
    return assistant.assistant_context(p, doses, visit, vital, now=now)


@router.post("/assistant")
def ask_assistant(body: AssistantIn, request: Request, user: User = Depends(require_roles("patient")),
                  db: Session = Depends(get_db)) -> dict:
    p = db.get(Patient, user.patient_id) if user.patient_id else None
    if p is None:
        raise not_found("patient")
    ctx = _patient_ctx(db, p)
    audit(db, user, "read", "assistant", p.id, patient_id=p.id, ip=_ip(request))
    db.commit()
    return assistant.answer(body.question, ctx)


# --- role chat assistants (RAG over one patient's record) ---------------------------------------------------------

@router.post("/chat")
def ask_chat(body: ChatIn, request: Request, user: User = Depends(require_roles("doctor", "nurse", "patient")),
             db: Session = Depends(get_db)) -> dict:
    """Doctor: summaries and possible conditions to consider; nurse: care questions; patient: their own care.
    Every answer is stored as a notebook entry (AI suggestion, reviewable) and the read is audited."""
    if user.role == "patient":
        p = db.get(Patient, user.patient_id) if user.patient_id else None
        if p is None:
            raise not_found("patient")
        audit(db, user, "read", "ai_chat", p.id, patient_id=p.id, ip=_ip(request))
    else:
        if not body.patient_id:
            raise ApiError(422, "patient_required", "patient_id is required")
        p = check_patient_access(db, user, body.patient_id, resource="ai_chat", ip=_ip(request))
    out = chat.answer(user.role, body.question.strip(), record_sources.build(db, p, user.role),
                      names=[p.first_name, p.last_name], history=[t.model_dump() for t in body.history],
                      lang=body.lang, patient_ctx=_patient_ctx(db, p) if user.role == "patient" else None)
    entry = NotebookEntry(id=new_id(db, "nb"), patient_id=p.id, user_id=user.id, question=body.question.strip(),
                          ai_suggested={"answer": out["answer"], "source": out["source"], "role": user.role,
                                        "citations": [c["source_id"] for c in out["citations"]]})
    db.add(entry)
    db.commit()
    return {**out, "id": entry.id}


# --- staff assistant conversations (sidebar "AI assistant" page) ------------------------------------------------

class ConversationIn(BaseModel):
    title: str = Field(default="", max_length=120)


class MessageIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    patient_id: str | None = None  # the patient mentioned with @; omitted: the conversation's current patient
    clear_patient: bool = False    # true: a general question, ignore the conversation's patient
    lang: str | None = Field(default=None, pattern="^(en|fr|ar)$")


def _conversation(db: Session, user: User, conversation_id: str) -> ChatConversation:
    c = db.get(ChatConversation, conversation_id)
    if c is None or c.user_id != user.id:
        raise not_found("conversation")
    return c


def _messages(db: Session, c: ChatConversation) -> list[ChatMessage]:
    return list(db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == c.id)
                           .order_by(ChatMessage.created_at, ChatMessage.id)))


def _current_patient(msgs: list[ChatMessage]) -> str | None:
    for m in reversed(msgs):
        if m.role == "user":
            return m.patient_id
    return None


def _patient_ref(db: Session, patient_id: str | None) -> dict | None:
    p = db.get(Patient, patient_id) if patient_id else None
    return {"id": p.id, "name": f"{p.first_name} {p.last_name}"} if p else None


def _stamp(dt: datetime | None) -> str | None:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _msg_out(db: Session, m: ChatMessage) -> dict:
    return {"id": m.id, "role": m.role, "text": m.text, "patient": _patient_ref(db, m.patient_id),
            "created_at": _stamp(m.created_at), **(m.meta or {})}


def _conv_out(db: Session, c: ChatConversation, msgs: list[ChatMessage] | None = None) -> dict:
    out = {"id": c.id, "title": c.title, "created_at": _stamp(c.created_at), "updated_at": _stamp(c.updated_at)}
    if msgs is not None:
        out["messages"] = [_msg_out(db, m) for m in msgs]
        out["patient"] = _patient_ref(db, _current_patient(msgs))
    return out


@router.get("/conversations")
def list_conversations(user: User = Depends(require_roles("doctor", "nurse")), db: Session = Depends(get_db)) -> list:
    rows = db.scalars(select(ChatConversation).where(ChatConversation.user_id == user.id)
                      .order_by(ChatConversation.updated_at.desc()).limit(100))
    return [_conv_out(db, c) for c in rows]


@router.post("/conversations", status_code=201)
def create_conversation(body: ConversationIn, user: User = Depends(require_roles("doctor", "nurse")),
                        db: Session = Depends(get_db)) -> dict:
    c = ChatConversation(id=new_id(db, "cv"), user_id=user.id, title=body.title.strip())
    db.add(c)
    db.flush()
    db.refresh(c)
    out = _conv_out(db, c, [])
    db.commit()
    return out


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, request: Request, user: User = Depends(require_roles("doctor", "nurse")),
                     db: Session = Depends(get_db)) -> dict:
    c = _conversation(db, user, conversation_id)
    msgs = _messages(db, c)
    for pid in {m.patient_id for m in msgs if m.patient_id}:  # re-reading a patient's analysis is a record read
        check_patient_access(db, user, pid, resource="ai_chat", ip=_ip(request))
    out = _conv_out(db, c, msgs)
    db.commit()
    return out


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, user: User = Depends(require_roles("doctor", "nurse")),
                        db: Session = Depends(get_db)) -> None:
    c = _conversation(db, user, conversation_id)
    db.execute(delete(ChatMessage).where(ChatMessage.conversation_id == c.id))
    db.delete(c)
    db.commit()


@router.post("/conversations/{conversation_id}/messages")
def send_message(conversation_id: str, body: MessageIn, request: Request,
                 user: User = Depends(require_roles("doctor", "nurse")), db: Session = Depends(get_db)) -> dict:
    """One question in a conversation. With a patient (mentioned now or earlier in the conversation): answered from
    that patient's record (access-checked, audited, stored as a notebook entry). Without: a general question."""
    c = _conversation(db, user, conversation_id)
    msgs = _messages(db, c)
    pid = None if body.clear_patient else (body.patient_id or _current_patient(msgs))
    history = [{"role": m.role, "text": m.text} for m in msgs[-chat.MAX_HISTORY:]]
    q = body.question.strip()
    if pid:
        p = check_patient_access(db, user, pid, resource="ai_chat", ip=_ip(request))
        out = chat.answer(user.role, q, record_sources.build(db, p, user.role), names=[p.first_name, p.last_name],
                          history=history, lang=body.lang)
        db.add(NotebookEntry(id=new_id(db, "nb"), patient_id=p.id, user_id=user.id, question=q,
                             ai_suggested={"answer": out["answer"], "source": out["source"], "role": user.role,
                                           "citations": [x["source_id"] for x in out["citations"]]}))
    else:
        out = chat.answer_general(user.role, q, history=history, lang=body.lang)
    now = datetime.now(UTC)
    db.add(ChatMessage(id=new_id(db, "cm", width=6), conversation_id=c.id, role="user", text=q, patient_id=pid,
                       created_at=now))
    reply = ChatMessage(id=new_id(db, "cm", width=6), conversation_id=c.id, role="assistant", text=out["answer"],
                        patient_id=pid, created_at=now + timedelta(milliseconds=1),
                        meta={"citations": out["citations"], "source": out["source"],
                              "unverified": out.get("unverified") or []})
    db.add(reply)
    if not c.title:
        ref = _patient_ref(db, pid)
        text = re.sub(r"\s+", " ", q.replace(f"@{ref['name']}", "") if ref else q).strip() or q
        c.title = (f"{ref['name']} · " if ref else "") + (text[:60] + ("…" if len(text) > 60 else ""))
    c.updated_at = now
    db.flush()
    result = {"message": _msg_out(db, reply), "conversation": _conv_out(db, c)}
    db.commit()
    return result
