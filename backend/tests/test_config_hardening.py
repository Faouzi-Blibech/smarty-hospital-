import logging

import pytest

from app.config import DEFAULT_JWT_SECRET, Settings, check_secrets, insecure_defaults

GOOD = {
    "jwt_secret": "x" * 40,
    "n8n_event_secret": "ev-" + "a" * 20,
    "n8n_callback_secret": "cb-" + "b" * 20,
    "minio_root_password": "m" * 20,
    "seed_password": "s" * 20,
    "mqtt_password": "q" * 20,
    "database_url": "postgresql+psycopg://ward:strongpw@db:5432/ward",
}


def make(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_default_jwt_replaced_by_random():
    a, b = make(), make()
    assert a.jwt_secret != DEFAULT_JWT_SECRET
    assert len(a.jwt_secret) >= 32
    assert a.jwt_secret != b.jwt_secret


def test_short_jwt_replaced(caplog):
    with caplog.at_level(logging.WARNING):
        s = make(jwt_secret="short")
    assert s.jwt_secret != "short" and len(s.jwt_secret) >= 32
    assert "JWT_SECRET" in caplog.text


def test_custom_long_jwt_kept():
    secret = "k" * 40
    assert make(jwt_secret=secret).jwt_secret == secret


def test_prod_with_default_jwt_raises_at_construction():
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        make(ward_env="prod")


def test_prod_defaults_raise_and_list_names():
    s = make(ward_env="prod", jwt_secret="x" * 40)
    with pytest.raises(RuntimeError) as e:
        check_secrets(s)
    for name in ("n8n_event_secret", "n8n_callback_secret", "minio_root_password", "seed_password", "mqtt_password", "database_url"):
        assert name in str(e.value)


def test_demo_defaults_warn_once_without_raising(caplog):
    s = make()
    caplog.clear()
    with caplog.at_level(logging.WARNING):
        check_secrets(s)
    warns = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warns) == 1
    assert "n8n_callback_secret" in warns[0].getMessage()
    assert "jwt_secret" in insecure_defaults(s)


def test_prod_with_all_secrets_set_ok():
    s = make(ward_env="prod", **GOOD)
    assert insecure_defaults(s) == []
    check_secrets(s)


def test_default_mqtt_password_is_flagged_and_a_custom_one_is_not():
    assert "mqtt_password" in insecure_defaults(make())
    assert "mqtt_password" not in insecure_defaults(make(mqtt_password="q" * 20))


def test_invalid_ward_env_rejected():
    with pytest.raises(ValueError):
        make(ward_env="staging")


def test_session_and_cors_defaults():
    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.jwt_expire_hours == 8 and s.web_origin == "http://localhost:3000"
