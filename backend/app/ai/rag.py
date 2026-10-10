"""Retrieval over one patient's record (owner: Faouzi): sources are split into short passages and ranked with
BM25 over the triage text normaliser (accents and Arabic letter variants folded). Used by the role chat assistants
(app/ai/chat.py). Pure: no DB, no network."""

import math
import re
from dataclasses import dataclass

from app.ai.triage import _normalize

TOP_K = 4
MAX_PASSAGE = 400
CONTEXT_CHARS = 7000  # passages handed to the LLM: the best matches first, then the most recent, up to this budget

_SENTENCE = re.compile(r"(?<=[.!?؟])\s+|\n+")
_TOKEN = re.compile(r"\w+", re.UNICODE)
_STOP = {"the", "and", "what", "did", "was", "is", "are", "of", "to", "in", "on", "for", "with", "show",
         "le", "la", "les", "de", "des", "du", "et", "est", "en", "un", "une", "a", "il", "elle", "que", "qui"}


@dataclass(frozen=True)
class Source:
    id: str
    kind: str  # referral | note | exam_report | prescription | vitals
    title: str
    ts: str | None
    text: str


@dataclass(frozen=True)
class Passage:
    source: Source
    text: str


def _chunks(text: str) -> list[str]:
    out, buf = [], ""
    for sent in (s.strip() for s in _SENTENCE.split(text or "")):
        while len(sent) > MAX_PASSAGE:  # one huge sentence: hard split
            out.append(sent[:MAX_PASSAGE])
            sent = sent[MAX_PASSAGE:]
        if not sent:
            continue
        if buf and len(buf) + 1 + len(sent) > MAX_PASSAGE:
            out.append(buf)
            buf = sent
        else:
            buf = f"{buf} {sent}".strip()
    return out + [buf] if buf else out


def passages(sources: list[Source]) -> list[Passage]:
    return [Passage(s, c) for s in sources for c in _chunks(s.text)]


def tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(_normalize(text)) if len(t) > 1 and t not in _STOP]


def rank(question: str, ps: list[Passage], k: int = TOP_K, k1: float = 1.5, b: float = 0.75) -> list[Passage]:
    q = set(tokens(question))
    if not q or not ps:
        return []
    docs = [tokens(p.text) for p in ps]
    n, avg = len(docs), (sum(map(len, docs)) / len(docs)) or 1.0
    df = {t: sum(1 for d in docs if t in d) for t in q}
    scored = []
    for i, d in enumerate(docs):
        score = 0.0
        for t in q:
            f = d.count(t)
            if f:
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                score += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * len(d) / avg))
        if score > 0:
            scored.append((score, i))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [ps[i] for _, i in scored[:k]]


def context(question: str, ps: list[Passage], budget: int = CONTEXT_CHARS) -> list[Passage]:
    """Passages for the LLM: the BM25 matches first, then the rest newest first, until the budget is spent.
    The rest matters: a question in Arabic about an English note shares no words with it."""
    picked = rank(question, ps, k=8)
    rest = sorted((p for p in ps if p not in picked), key=lambda p: p.source.ts or "", reverse=True)
    out, used = [], 0
    for p in picked + rest:
        if used + len(p.text) > budget:
            continue
        out.append(p)
        used += len(p.text)
    return out
