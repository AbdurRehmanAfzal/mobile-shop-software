"""returns: the returned item's condition, when a return was undone, and the wrong return a new
one replaces (owner 2026-11-20, ADR-101)

Three nullable columns; every existing return keeps NULL in all of them and behaves as before.
Rollback: `alembic downgrade c6e8a0b2d4f7` drops only these three columns.

Revision ID: e2a4c6b8d0f3
Revises: c6e8a0b2d4f7
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e2a4c6b8d0f3"
down_revision: str | None = "c6e8a0b2d4f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("returns") as b:
        b.add_column(sa.Column("item_condition", sa.String(12), nullable=True))
        b.add_column(sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column("replaces_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("returns") as b:
        b.drop_column("replaces_id")
        b.drop_column("voided_at")
        b.drop_column("item_condition")
