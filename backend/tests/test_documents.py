"""Paper-record photo storage in MinIO (plans/FAOUZI.md Task 8)."""

import socket
import uuid

import pytest

from app.services import documents as D

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def test_key_uses_patient_doc_and_extension():
    assert D.document_key("p-0001", "doc-0007", "image/jpeg") == "documents/p-0001/doc-0007.jpg"
    assert D.document_key("p-0001", "doc-0008", "image/png") == "documents/p-0001/doc-0008.png"


@pytest.mark.parametrize("data,claimed", [(JPEG, "image/jpeg"), (PNG, "image/png")])
def test_validate_accepts_real_images(data, claimed):
    assert D.validate_upload(data, claimed) == claimed


def test_validate_trusts_bytes_not_the_claimed_type():
    assert D.validate_upload(PNG, "image/jpeg") == "image/png"


@pytest.mark.parametrize("data", [b"", b"%PDF-1.7 not an image", b"<svg></svg>"])
def test_validate_rejects_non_images(data):
    with pytest.raises(ValueError):
        D.validate_upload(data, "image/jpeg")


def test_validate_rejects_too_large(monkeypatch):
    monkeypatch.setattr(D, "MAX_BYTES", 10)
    with pytest.raises(ValueError, match="too large"):
        D.validate_upload(JPEG, "image/jpeg")


def _minio_up() -> bool:
    try:
        with socket.create_connection(("localhost", 9000), timeout=1):
            return True
    except OSError:
        return False


@pytest.mark.skipif(not _minio_up(), reason="MinIO not running (docker compose up minio)")
def test_round_trip_against_real_minio(monkeypatch):
    bucket = f"ward-test-{uuid.uuid4().hex[:8]}"      # throwaway bucket, removed below
    monkeypatch.setattr(D, "_bucket", lambda: bucket)
    key = D.document_key("p-0001", "doc-9999", "image/png")
    D.put_document(key, PNG, "image/png")
    assert D.get_document(key) == PNG
    client = D._client()
    client.remove_object(bucket, key)
    client.remove_bucket(bucket)
