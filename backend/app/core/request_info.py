"""The caller's IP and browser for the current request (login sessions, ADR-074)."""

from contextvars import ContextVar

_info: ContextVar[tuple[str | None, str | None]] = ContextVar("client_info", default=(None, None))


def set_client_info(ip: str | None, user_agent: str | None):
    return _info.set((ip, user_agent))


def client_info() -> tuple[str | None, str | None]:
    return _info.get()
