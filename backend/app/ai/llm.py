"""Single gateway for every LLM call. Strips PII, routes on LLM_PROVIDER, never hangs the demo.

Callers catch LLMUnavailable and return their deterministic fallback.
"""

import base64
import json
import re
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


_PATTERNS = [
    (re.compile(r"\b[pu]-\d{4}\b"), "[ID]"),
    (re.compile(r"\b\d{8}\b"), "[CIN]"),
    (re.compile(r"(\+216\s?)?\b\d{2}\s?\d{3}\s?\d{3}\b"), "[PHONE]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[EMAIL]"),
]


def strip_pii(text: str, names: Iterable[str] = ()) -> str:
    for rx, rep in _PATTERNS:  # structured identifiers first (emails contain names)
        text = rx.sub(rep, text)
    for n in sorted((n for n in names if n), key=len, reverse=True):
        text = re.sub(re.escape(n), "[NAME]", text, flags=re.IGNORECASE)
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
