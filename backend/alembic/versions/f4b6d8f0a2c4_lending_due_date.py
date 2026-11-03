"""payments.due_date / reminded_at (docs/32 §7): the promised return date on a len-den entry and
when its person was last reminded. Additive, resumable, reversible.

Revision ID: f4b6d8f0a2c4
Revises: e3a5c7e9f1b3
Create Date: 2026-11-02 18:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f4b6d8f0a2c4"
down_revision: str | None = "e3a5c7e9f1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("payments")}
    with op.batch_alter_table("payments", schema=None) as b:
        if "due_date" not in have:
            b.add_column(sa.Column("due_date", sa.Date(), nullable=True))
        if "reminded_at" not in have:
            b.add_column(sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("payments", schema=None) as b:
        b.drop_column("reminded_at")
        b.drop_column("due_date")
