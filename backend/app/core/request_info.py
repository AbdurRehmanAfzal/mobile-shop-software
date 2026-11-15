"""The caller's IP and browser for the current request (login sessions, ADR-074)."""

from contextvars import ContextVar

_info: ContextVar[tuple[str | None, str | None]] = ContextVar("client_info", default=(None, None))


def set_client_info(ip: str | None, user_agent: str | None):
    return _info.set((ip, user_agent))


def client_info() -> tuple[str | None, str | None]:
    return _info.get()


# owner 2026-11-15 (ADR-080): the app's own random key for this phone / browser (header
# X-Device-Key), so a login can be allowed only on devices the owner approved
_device: ContextVar[str | None] = ContextVar("device_key", default=None)


def set_device_key(key: str | None):
    return _device.set(key)


def device_key() -> str | None:
    return _device.get()
