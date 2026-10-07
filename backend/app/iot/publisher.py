"""Server → broker publishing (mqtt-topics.md). The worker hands over its own client with `use(...)`;
the API process lazily opens one. Publishing never raises: a broker outage is logged, not a 500."""

import json
import logging
import os
import threading

import paho.mqtt.client as mqtt

from app.config import get_settings

log = logging.getLogger("ward.publisher")

WS_TOPIC = "ward/internal/ws"
_client = None
_lock = threading.Lock()


def use(client) -> None:
    global _client
    _client = client


def _get():
    global _client
    with _lock:
        if _client is None:
            s = get_settings()
            c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"ward-api-pub-{os.getpid()}")
            c.connect_async(s.mqtt_host, s.mqtt_port)
            c.loop_start()
            _client = c
        return _client


def _publish(topic: str, payload: dict, qos: int, retain: bool) -> bool:
    try:
        info = _get().publish(topic, json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                              qos=qos, retain=retain)
        rc = getattr(info, "rc", 0)
        if rc not in (0, None) and rc != mqtt.MQTT_ERR_NO_CONN:
            log.warning("publish %s failed rc=%s", topic, rc)
            return False
        return True
    except Exception as e:  # never break a request because the broker is down
        log.warning("publish %s failed: %s", topic, e)
        return False


def publish_schedule(device_id: str, payload: dict) -> bool:
    return _publish(f"hospital/device/{device_id}/schedule", payload, qos=1, retain=True)


def publish_command(device_id: str, payload: dict) -> bool:
    return _publish(f"hospital/device/{device_id}/command", payload, qos=1, retain=False)


def publish_ws_frame(frame: dict) -> bool:
    return _publish(WS_TOPIC, frame, qos=0, retain=False)
