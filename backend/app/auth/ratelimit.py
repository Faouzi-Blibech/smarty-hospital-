"""In-process sliding-window rate limits for the public auth routes (spec §7).

Correct because the API runs as ONE uvicorn process. If it is ever scaled out, move these limits to the proxy or
Redis. Behind the proxy, uvicorn's --proxy-headers makes request.client the real client IP.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from app.errors import ApiError

LOGIN_LIMITS = ((10, 60.0),)
CODE_LIMITS = ((5, 60.0), (30, 86400.0))  # /auth/register and /auth/reset
DIRECTORY_LIMITS = ((30, 60.0),)


class SlidingWindow:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_s: float, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window_s:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def full(self, key: str, limit: int, window_s: float, now: float | None = None) -> bool:
        """True if `key` already has `limit` hits in the window; does not add a hit."""
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits.get(key)
            if not q:
                return False
            while q and q[0] <= now - window_s:
                q.popleft()
            return len(q) >= limit

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindow()
_TOO_MANY = ("rate_limited", "too many attempts, try again later")


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _keys(request: Request, route: str, limits: tuple[tuple[int, float], ...]):
    ip = client_ip(request)
    return [(f"{route}:{ip}:{window}", limit, window) for limit, window in limits]


def enforce(request: Request, route: str, limits: tuple[tuple[int, float], ...]) -> None:
    """Count this request; 429 once a window is full (register, reset, directory)."""
    for key, limit, window in _keys(request, route, limits):
        if not limiter.allow(key, limit, window):
            raise ApiError(429, *_TOO_MANY)


def check(request: Request, route: str, limits: tuple[tuple[int, float], ...]) -> None:
    """429 if a window is already full, without counting (login checks this BEFORE verifying the password)."""
    for key, limit, window in _keys(request, route, limits):
        if limiter.full(key, limit, window):
            raise ApiError(429, *_TOO_MANY)


def record(request: Request, route: str, limits: tuple[tuple[int, float], ...]) -> None:
    """Count a hit without raising (a failed login)."""
    for key, limit, window in _keys(request, route, limits):
        limiter.allow(key, limit, window)
