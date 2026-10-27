import pytest

from app.core import config as cfg
from app.main import check_production_settings


def test_prod_refuses_default_secret(monkeypatch):
    monkeypatch.setattr(cfg.settings, "app_env", "prod")
    monkeypatch.setattr(cfg.settings, "secret_key", "dev-secret-change-me")
    with pytest.raises(RuntimeError):
        check_production_settings()
    monkeypatch.setattr(cfg.settings, "secret_key", "x" * 64)
    check_production_settings()
