"""organisations.modules: which modules a shop may use (owner 2026-10-29)

Revision ID: d2f8b6c1a4e7
Revises: c9e2a7b4d6f1
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2f8b6c1a4e7"
down_revision: str | None = "c9e2a7b4d6f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("organisations") as batch:
        batch.add_column(sa.Column("modules", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organisations") as batch:
        batch.drop_column("modules")
