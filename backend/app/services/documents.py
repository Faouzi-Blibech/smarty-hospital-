"""Paper-record photos in MinIO (owner: Faouzi, plans/FAOUZI.md Task 8).

Key layout (data-model.md `documents.minio_key`): documents/{patient_id}/{doc_id}.{ext} in bucket MINIO_BUCKET.
"""

import io

from minio import Minio

from app.config import get_settings

MAX_BYTES = 10 * 1024 * 1024
_SIGNATURES = (  # media types the vision model accepts, identified by magic bytes
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}


def _sniff(data: bytes) -> str | None:
    for sig, media_type in _SIGNATURES:
        if data.startswith(sig):
            return media_type
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_upload(data: bytes, claimed_media_type: str) -> str:
    """Return the real media type of an uploaded photo; reject non-images and oversized files."""
    if len(data) > MAX_BYTES:
        raise ValueError(f"file too large (max {MAX_BYTES // (1024 * 1024)} MB)")
    media_type = _sniff(data)
    if media_type is None:
        raise ValueError("not a JPEG, PNG, GIF or WebP image")
    return media_type


def document_key(patient_id: str, doc_id: str, media_type: str) -> str:
    return f"documents/{patient_id}/{doc_id}.{_EXT[media_type]}"


def _client() -> Minio:
    s = get_settings()
    return Minio(s.minio_endpoint, access_key=s.minio_root_user, secret_key=s.minio_root_password, secure=False)


def _bucket() -> str:
    return get_settings().minio_bucket


def put_document(key: str, data: bytes, media_type: str) -> None:
    client, bucket = _client(), _bucket()
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    client.put_object(bucket, key, io.BytesIO(data), len(data), content_type=media_type)


def get_document(key: str) -> bytes:
    resp = _client().get_object(_bucket(), key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()
