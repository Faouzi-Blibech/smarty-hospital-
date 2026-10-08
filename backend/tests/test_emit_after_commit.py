"""n8n events leave only after the transaction that created their rows commits (review minor #8)."""

from datetime import UTC, datetime

from app.iot import ingest

NOW = int(datetime.now(UTC).timestamp())
CRITICAL = {"msg_id": 1, "ts": NOW, "patient_id": "p-0001", "hr": 135, "spo2": 87, "temp": 39.3}


def test_emit_waits_for_commit(db, seeded, emitted):
    ingest.handle(db, "bsu-001", "vitals", dict(CRITICAL))
    assert emitted == []  # nothing tells Telegram about an alert that may still be rolled back
    db.commit()
    assert [e for e, _ in emitted] == ["alert.critical"]


def test_emit_dropped_on_rollback(db, seeded, emitted):
    ingest.handle(db, "bsu-001", "vitals", dict(CRITICAL, msg_id=2))
    db.rollback()
    db.commit()
    assert emitted == []
