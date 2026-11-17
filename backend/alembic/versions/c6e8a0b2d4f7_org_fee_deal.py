"""a special fee for one shop (owner 2026-11-17, ADR-098): organisations.fee_deal — the package,
its agreed monthly price, how many months of it are left (NULL inside = no end) and a note

Every existing shop keeps NULL (no special price; its fee is worked out as before).

Revision ID: c6e8a0b2d4f7
Revises: b4d6f8a0c2e5
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c6e8a0b2d4f7"
down_revision: str | None = "b4d6f8a0c2e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("organisations") as b:
        b.add_column(sa.Column("fee_deal", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organisations") as b:
        b.drop_column("fee_deal")
