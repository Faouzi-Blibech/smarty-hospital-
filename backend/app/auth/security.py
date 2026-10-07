"""Password hashing (bcrypt) and JWT (PyJWT HS256). Claims: sub, role, patient_id, exp (api.md → Conventions)."""

import bcrypt


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:  # malformed hash in the DB: treat as a failed login, not a 500
        return False
