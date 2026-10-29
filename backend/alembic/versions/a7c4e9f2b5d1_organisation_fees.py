"""organisations: monthly fee and a note (plans, owner 2026-10-29)

Revision ID: a7c4e9f2b5d1
Revises: f1b6d2e8a9c3
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7c4e9f2b5d1"
down_revision: str | None = "f1b6d2e8a9c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("organisations") as batch:
        batch.add_column(
            sa.Column("monthly_fee", sa.Numeric(14, 2), nullable=False, server_default="0")
        )
        batch.add_column(sa.Column("fee_note", sa.String(length=200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organisations") as batch:
        batch.drop_column("fee_note")
        batch.drop_column("monthly_fee")
