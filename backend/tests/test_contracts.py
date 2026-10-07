"""The JSON examples from docs/contracts/mqtt-topics.md (copied into tests/fixtures/mqtt/) are accepted."""

import json
from pathlib import Path

import pytest

from app.iot import ingest
from app.models import Alert, Device

FIX = Path(__file__).parent / "fixtures" / "mqtt"


@pytest.mark.parametrize("kind", ["vitals", "events", "status"])
def test_contract_examples_accepted(db, seeded, kind):
    payload = json.loads((FIX / f"{kind}.json").read_text(encoding="utf-8"))
    ingest.handle(db, "bsu-001", kind, payload)  # must not raise
    assert db.get(Device, "bsu-001").last_seen is not None


def test_unknown_fields_ignored(db, seeded):
    payload = json.loads((FIX / "vitals.json").read_text(encoding="utf-8"))
    assert ingest.handle(db, "bsu-001", "vitals", dict(payload, msg_id=5000, battery=87, extra={"x": 1}))


def test_device_offline_alert_once(db, seeded):
    ingest.handle(db, "bsu-001", "status", {"online": True, "fw_version": "0.1.0"})
    frames = ingest.handle(db, "bsu-001", "status", {"online": False, "fw_version": "0.1.0"})
    a = db.query(Alert).filter_by(kind="device_offline").one()
    assert a.severity == "medium" and a.patient_id == "p-0001" and a.device_id == "bsu-001"
    assert {f["type"] for f in frames} == {"device_status", "alert"}
    ingest.handle(db, "bsu-001", "status", {"online": False, "fw_version": "0.1.0"})  # retained re-delivery
    assert db.query(Alert).filter_by(kind="device_offline").count() == 1


def test_offline_without_admission_no_alert(db, seeded):
    ingest.handle(db, "bsu-007", "status", {"online": True})
    ingest.handle(db, "bsu-007", "status", {"online": False})
    assert db.query(Alert).filter_by(kind="device_offline").count() == 0
