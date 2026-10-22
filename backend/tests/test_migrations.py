"""Alembic migrations must build the same schema as the models (no drift)."""

import os
import tempfile

from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command
from app.db.models import Base

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_upgrade_head_matches_models(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        url = "sqlite:///" + os.path.join(tmp, "mig.db").replace("\\", "/")
        monkeypatch.setenv("DATABASE_URL", url)
        # settings is cached; alembic env reads settings.database_url, so override directly
        from app.core import config as cfg

        monkeypatch.setattr(cfg.settings, "database_url", url)

        alembic_cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
        command.upgrade(alembic_cfg, "head")

        eng = create_engine(url)
        migrated = {t for t in inspect(eng).get_table_names() if t != "alembic_version"}
        expected = set(Base.metadata.tables.keys())
        assert migrated == expected, f"missing={expected - migrated} extra={migrated - expected}"

        for table in expected:
            cols_db = {c["name"] for c in inspect(eng).get_columns(table)}
            cols_model = {c.name for c in Base.metadata.tables[table].columns}
            assert cols_db == cols_model, f"{table}: db={cols_db ^ cols_model}"
        eng.dispose()
