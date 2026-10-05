"""Single gateway for every LLM call. Strips PII, routes on LLM_PROVIDER, never hangs the demo.

Callers catch LLMUnavailable and return their deterministic fallback.
"""

import base64
import json
import re
import unicodedata
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import TypeVar

import anthropic
import httpx
from pydantic import BaseModel

from app.config import Settings, get_settings

T = TypeVar("T", bound=BaseModel)
PROMPTS = Path(__file__).parent / "prompts"


class LLMUnavailable(Exception):
    pass


_PATTERNS = [  # order matters: emails, then international phones, then CIN before local phones
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[EMAIL]"),
    (re.compile(r"(?:\+|\b00)216[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b"), "[PHONE]"),
    (re.compile(r"\b\d{8}\b"), "[CIN]"),
    (re.compile(r"\b\d{2}[\s.-]\d{3}[\s.-]\d{3}\b"), "[PHONE]"),
    (re.compile(r"\b[a-z]{1,3}-\d{4,6}\b", re.IGNORECASE), "[ID]"),  # p-0001, rx-0001, d-000123, adm-0001
]


def _fold(text: str) -> str:
    """Accent-fold character by character so indices still line up with the original text."""
    return "".join(unicodedata.normalize("NFKD", c)[0] for c in text)


def _strip_name(text: str, name: str) -> str:
    parts = [p for p in re.split(r"[\s-]+", _fold(name).strip()) if p]
    if not parts:
        return text
    rx = re.compile(r"\b" + r"[\s-]+".join(map(re.escape, parts)) + r"\b", re.IGNORECASE)
    for m in reversed(list(rx.finditer(_fold(text)))):
        text = text[:m.start()] + "[NAME]" + text[m.end():]
    return text


def strip_pii(text: str, names: Iterable[str] = ()) -> str:
    for rx, rep in _PATTERNS:  # structured identifiers first (emails contain names)
        text = rx.sub(rep, text)
    for n in sorted((str(n) for n in names if n), key=len, reverse=True):
        text = _strip_name(text, n)
    return text


def _prompt(name: str) -> str:
    return (PROMPTS / f"{name}.v1.md").read_text(encoding="utf-8")


def complete_json(prompt_name: str, user_text: str, schema: type[T], *,
                  names: Iterable[str] = (), images: Sequence[tuple[bytes, str]] = ()) -> T:
    s = get_settings()
    if s.llm_provider not in ("anthropic", "local"):
        raise LLMUnavailable(f"provider={s.llm_provider}")
    text = strip_pii(user_text, names)
    try:
        if s.llm_provider == "anthropic":
            return _anthropic(s, _prompt(prompt_name), text, schema, images)
        return _ollama(s, _prompt(prompt_name), text, schema, images)
    except LLMUnavailable:
        raise
    except Exception as e:  # timeout, network, validation, rate limit...
        raise LLMUnavailable(str(e)) from e


def _anthropic(s: Settings, system: str, text: str, schema: type[T], images) -> T:
    client = anthropic.Anthropic(api_key=s.anthropic_api_key or None, timeout=s.llm_timeout_s, max_retries=0)
    content: list[dict] = [
        {"type": "image", "source": {"type": "base64", "media_type": mt, "data": base64.b64encode(b).decode()}}
        for b, mt in images
    ]
    content.append({"type": "text", "text": text})
    resp = client.messages.parse(
        model=s.llm_model, max_tokens=4000, system=system,
        messages=[{"role": "user", "content": content}], output_format=schema,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise LLMUnavailable(f"stop_reason={resp.stop_reason}")
    return resp.parsed_output


def _ollama(s: Settings, system: str, text: str, schema: type[T], images) -> T:
    msg: dict = {"role": "user", "content": text}
    if images:
        msg["images"] = [base64.b64encode(b).decode() for b, _ in images]
    r = httpx.post(f"{s.llm_local_base_url}/api/chat", timeout=s.llm_timeout_s, json={
        "model": s.llm_local_model, "stream": False, "format": schema.model_json_schema(),
        "messages": [{"role": "system", "content": system}, msg]})
    r.raise_for_status()
    return schema.model_validate(json.loads(r.json()["message"]["content"]))
