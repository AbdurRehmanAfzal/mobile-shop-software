"""device SIM (carrier) lock (owner 2026-11-13, ADR-070)

Additive: two nullable columns; nothing existing changes.

Revision ID: e7a9c1d3f5b8
Revises: d5f7b9c1e3a6
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e7a9c1d3f5b8"
down_revision: str | None = "d5f7b9c1e3a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("sim_lock", sa.String(10), nullable=True))
    op.add_column("devices", sa.Column("sim_lock_carrier", sa.String(40), nullable=True))


def downgrade() -> None:
    op.drop_column("devices", "sim_lock_carrier")
    op.drop_column("devices", "sim_lock")
