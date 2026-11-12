"""device faults (owner 2026-11-12, ADR-066)

Additive: one nullable JSON column; nothing existing changes.

Revision ID: c3e5a7b9d1f4
Revises: b9d1f3a5c7e2
"""

import sqlalchemy as sa

from alembic import op

revision: str = "c3e5a7b9d1f4"
down_revision: str | None = "b9d1f3a5c7e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("faults", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("devices", "faults")
