"""Password policy for sign-up, reset and change (spec §7)."""

from functools import lru_cache
from pathlib import Path

from app.errors import ApiError

MIN_LENGTH = 10
MAX_BYTES = 72  # bcrypt ignores or rejects anything longer
COMMON = Path(__file__).parent / "common_passwords.txt"


@lru_cache
def _common() -> frozenset[str]:
    lines = COMMON.read_text(encoding="utf-8").splitlines()
    return frozenset(s.strip().lower() for s in lines if s.strip() and not s.startswith("#"))


def password_problem(password: str, *, email: str = "", name: str = "") -> str | None:
    if len(password) < MIN_LENGTH:
        return f"use at least {MIN_LENGTH} characters"
    if len(password.encode("utf-8")) > MAX_BYTES:
        return f"use at most {MAX_BYTES} bytes (about {MAX_BYTES} letters without accents)"
    low = password.lower()
    if low in _common():
        return "this password is too common"
    email = email.strip().lower()
    if email and low in (email, email.split("@")[0]):
        return "do not use your email as a password"
    if name and low.replace(" ", "") == name.lower().replace(" ", ""):
        return "do not use your name as a password"
    return None


def check_password(password: str, *, email: str = "", name: str = "") -> None:
    problem = password_problem(password, email=email, name=name)
    if problem:
        raise ApiError(422, "weak_password", problem)
