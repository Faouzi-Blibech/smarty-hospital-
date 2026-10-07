import time

import httpx

from app.integrations import n8n

REAL_EMIT = n8n.emit  # conftest's autouse `emitted` fixture replaces n8n.emit in every test


def test_post_swallows_connection_errors(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("n8n down")

    monkeypatch.setattr(httpx, "post", boom)
    n8n._post("alert.critical", {"alert_id": "al-0001"})  # must not raise


def test_post_envelope_and_secret(monkeypatch):
    seen = {}

    def fake(url, **kw):
        seen.update(url=url, **kw)

    monkeypatch.setattr(httpx, "post", fake)
    n8n._post("dose.missed", {"dose_id": "d-000001"})
    assert seen["json"]["event"] == "dose.missed" and seen["json"]["data"] == {"dose_id": "d-000001"}
    assert seen["json"]["ts"].endswith("Z")
    assert seen["headers"]["X-Ward-Secret"] and seen["timeout"] == 3.0


def test_emit_does_not_block_the_caller(monkeypatch):
    monkeypatch.setattr(n8n, "_post", lambda e, d: time.sleep(1))
    t0 = time.perf_counter()
    REAL_EMIT("alert.critical", {})
    assert time.perf_counter() - t0 < 0.2
