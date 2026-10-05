"""n8n callback helpers (owner: Faouzi). Contract: docs/contracts/n8n-webhooks.md v1.2."""

import hmac

from app.config import get_settings


def callback_secret_ok(header_value: str | None) -> bool:
    """Constant-time check of X-N8N-Secret; an unset server secret rejects everything."""
    expected = get_settings().n8n_callback_secret
    if not expected or not header_value:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())


def digest_entries(rows: list[tuple], *, doctors: list) -> list[dict]:
    """`daily-digest` body: one entry per doctor that has at least one admitted patient.

    rows: (doctor, patient, bed, news2, summary) for each admitted patient; doctors fixes the output order.
    """
    by_doctor: dict[str, list[dict]] = {}
    for doctor, patient, bed, news2, summary in rows:
        by_doctor.setdefault(doctor.id, []).append(
            {"name": f"{patient.first_name} {patient.last_name}", "bed": bed, "news2": news2, "summary": summary})
    return [{"doctor": {"id": d.id, "name": d.name, "email": d.email}, "patients": by_doctor[d.id]}
            for d in doctors if d.id in by_doctor]
