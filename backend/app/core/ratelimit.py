"""Tiny in-process failure limiter for login/PIN attempts (per key, sliding window).

Good enough for a single VPS process group; move to Redis when running several hosts.
"""

import time
from collections import defaultdict, deque

from app.core.errors import AppError


class TooManyAttempts(AppError):
    status_code = 429
    code = "too_many_attempts"
    message_en = "Too many wrong attempts. Try again in a few minutes."
    message_ur = "بہت زیادہ غلط کوششیں۔ چند منٹ بعد دوبارہ کوشش کریں۔"


class FailureLimiter:
    def __init__(self, max_failures: int = 5, window_seconds: int = 600):
        self.max = max_failures
        self.window = window_seconds
        self._fails: dict[str, deque[float]] = defaultdict(deque)

    def _trim(self, key: str) -> deque[float]:
        q = self._fails[key]
        cutoff = time.monotonic() - self.window
        while q and q[0] < cutoff:
            q.popleft()
        return q

    def check(self, key: str) -> None:
        if len(self._trim(key)) >= self.max:
            raise TooManyAttempts()

    def fail(self, key: str) -> None:
        self._trim(key).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._fails.pop(key, None)


login_limiter = FailureLimiter()
