"""Password hashing (bcrypt) and JWT (PyJWT HS256). Claims: sub, role, patient_id, exp (api.md → Conventions)."""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:  # malformed hash in the DB: treat as a failed login, not a 500
        return False


def create_token(user) -> str:
    s = get_settings()
    claims = {"sub": user.id, "role": user.role, "patient_id": user.patient_id,
              "exp": datetime.now(UTC) + timedelta(hours=s.jwt_expire_hours)}
    return jwt.encode(claims, s.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    """Claims, or None if the token is missing, malformed, badly signed or expired."""
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
