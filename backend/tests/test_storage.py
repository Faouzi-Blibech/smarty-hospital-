import socket
import uuid

import pytest

from app.config import get_settings


def _minio_up() -> bool:
    host, _, port = get_settings().minio_endpoint.partition(":")
    try:
        with socket.create_connection((host, int(port or 9000)), timeout=1):
            return True
    except OSError:
        return False


@pytest.mark.skipif(not _minio_up(), reason="MinIO not reachable")
def test_put_then_get_round_trip():
    from app.services import storage

    key = f"tests/{uuid.uuid4().hex}.txt"
    storage.put(key, b"hello ward", "text/plain")
    assert storage.get(key) == b"hello ward"
