from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok_even_without_services():
    res = TestClient(app).get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["db"], bool)
    assert isinstance(body["mqtt"], bool)
