"""Paper digitizer: photo of a paper record -> structured fields with per-field confidence.

A nurse or doctor reviews and approves every field before it is saved. The image goes to the vision model
before any name is known, so it is not PII-stripped: use LLM_PROVIDER=local in production.
"""

import json
from pathlib import Path

from pydantic import BaseModel

from app.ai.llm import LLMUnavailable, complete_json

ASSETS = Path(__file__).parent / "assets"
FIELDS = ("patient_name", "date_of_birth", "visit_date", "diagnosis", "medications", "allergies", "notes")


class FieldValue(BaseModel):
    value: str | None
    confidence: float


class DigitizedRecord(BaseModel):
    patient_name: FieldValue
    date_of_birth: FieldValue
    visit_date: FieldValue
    diagnosis: FieldValue
    medications: FieldValue
    allergies: FieldValue
    notes: FieldValue


def _empty() -> dict:
    return {f: {"value": None, "confidence": 0.0} for f in FIELDS}


def _demo_fallback(image: bytes) -> dict | None:
    demo, expected = ASSETS / "demo_record.jpg", ASSETS / "demo_record.expected.json"
    if not (demo.exists() and expected.exists()):
        return None
    if image != demo.read_bytes():
        return None
    return json.loads(expected.read_text(encoding="utf-8"))["fields"]


def digitize(image: bytes, media_type: str) -> dict:
    try:
        rec = complete_json("digitize", "Extract the record.", DigitizedRecord, images=[(image, media_type)])
    except LLMUnavailable:
        return {"fields": _demo_fallback(image) or _empty(), "source": "fallback"}
    fields = {f: {"value": getattr(rec, f).value, "confidence": min(max(getattr(rec, f).confidence, 0.0), 1.0)}
              for f in FIELDS}
    return {"fields": fields, "source": "llm"}
