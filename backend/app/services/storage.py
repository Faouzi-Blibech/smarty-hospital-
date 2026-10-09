"""Exam files in MinIO (bucket MINIO_BUCKET). Files are only ever served through the API, which checks access
and writes audit_log; there are no public MinIO links. Callers use `storage.put(...)` through the module so tests
can swap it."""

import io
from functools import lru_cache

from minio import Minio

from app.config import get_settings


@lru_cache
def _client() -> Minio:
    s = get_settings()
    client = Minio(s.minio_endpoint, access_key=s.minio_root_user, secret_key=s.minio_root_password, secure=False)
    if not client.bucket_exists(s.minio_bucket):
        client.make_bucket(s.minio_bucket)
    return client


def put(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(get_settings().minio_bucket, key, io.BytesIO(data), len(data), content_type=content_type)


def get(key: str) -> bytes:
    resp = _client().get_object(get_settings().minio_bucket, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()
