"""shops: the shop's own price code for stickers (shopkeepers 2026-11-20, ADR-117)

One nullable JSON column. Every existing shop keeps NULL and prints the cost code with its
10-letter word exactly as before.
Rollback: `alembic downgrade e2a4c6b8d0f3` drops only this column.

Revision ID: a3c5e7f9b1d2
Revises: e2a4c6b8d0f3
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a3c5e7f9b1d2"
down_revision: str | None = "e2a4c6b8d0f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("shops") as b:
        b.add_column(sa.Column("price_code", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("shops") as b:
        b.drop_column("price_code")
