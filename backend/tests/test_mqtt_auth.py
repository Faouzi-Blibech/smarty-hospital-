import logging
from types import SimpleNamespace

import paho.mqtt.client as mqtt
import paho.mqtt.reasoncodes as rc_mod
from paho.mqtt.enums import CallbackAPIVersion

from app.config import DEFAULT_MQTT_PASSWORD, Settings
from app.iot import mqtt_auth, publisher
from app.ws import relay


class FakeClient:
    def __init__(self):
        self.creds = None

    def username_pw_set(self, username, password=None):
        self.creds = (username, password)


def make(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_settings_default_to_the_demo_backend_account():
    s = make()
    assert s.mqtt_username == "ward-backend"
    assert s.mqtt_password == DEFAULT_MQTT_PASSWORD == "change-me-mqtt"


def test_apply_credentials_uses_the_settings():
    c = FakeClient()
    mqtt_auth.apply_credentials(c, make(mqtt_username="svc", mqtt_password="s3cret"))
    assert c.creds == ("svc", "s3cret")


def test_apply_credentials_defaults_to_get_settings(monkeypatch):
    monkeypatch.setattr(mqtt_auth, "get_settings", lambda: make(mqtt_username="u2", mqtt_password="p2"))
    c = FakeClient()
    mqtt_auth.apply_credentials(c)
    assert c.creds == ("u2", "p2")


def test_apply_credentials_on_a_real_paho_client():
    c = mqtt.Client(CallbackAPIVersion.VERSION2, client_id="t")
    mqtt_auth.apply_credentials(c, make(mqtt_username="svc", mqtt_password="pw"))
    assert c._username == b"svc" and c._password == b"pw"


def test_publisher_lazy_client_logs_in(monkeypatch):
    made = []

    class Lazy(FakeClient):
        def connect_async(self, *a, **k): ...
        def loop_start(self): ...

    def factory(*a, **k):
        made.append(Lazy())
        return made[0]

    monkeypatch.setattr(publisher, "_client", None)
    monkeypatch.setattr(publisher.mqtt, "Client", factory)
    monkeypatch.setattr(publisher, "get_settings", lambda: make(mqtt_username="svc", mqtt_password="pw"))
    publisher._get()
    assert made[0].creds == ("svc", "pw")
    monkeypatch.setattr(publisher, "_client", None)


def test_relay_client_logs_in(monkeypatch):
    made = []

    class Fake(FakeClient):
        def connect_async(self, *a, **k): ...
        def loop_start(self): ...

    def factory(*a, **k):
        made.append(Fake())
        return made[0]

    monkeypatch.setattr(relay.mqtt, "Client", factory)
    monkeypatch.setattr(relay, "get_settings", lambda: make(mqtt_username="svc", mqtt_password="pw"))
    relay.start()
    assert made[0].creds == ("svc", "pw")


def test_connack_ok_logs_an_error_on_refusal(caplog):
    refused = rc_mod.ReasonCode(2, identifier=135)  # CONNACK "Not authorized"
    with caplog.at_level(logging.ERROR):
        assert mqtt_auth.connack_ok(refused, "ward-worker") is False
    assert "ward-worker" in caplog.text and "MQTT_PASSWORD" in caplog.text
    assert mqtt_auth.connack_ok(rc_mod.ReasonCode(2, identifier=0), "ward-worker") is True
    assert mqtt_auth.connack_ok(SimpleNamespace(is_failure=False), "x") is True


def test_worker_does_not_subscribe_when_refused():
    from app.iot import worker

    class C:
        subscribed = False

        def subscribe(self, *a, **k):
            C.subscribed = True

    worker.on_connect(C(), None, {}, rc_mod.ReasonCode(2, identifier=135), None)
    assert C.subscribed is False
    worker.on_connect(C(), None, {}, rc_mod.ReasonCode(2, identifier=0), None)
    assert C.subscribed is True
