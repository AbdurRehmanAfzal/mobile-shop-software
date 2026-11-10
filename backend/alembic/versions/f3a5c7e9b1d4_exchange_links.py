"""An exchange keeps the bill the old phone was sold on, the trade-in value put against the new
bill, and the money the shop paid back (owner 2026-11-10, ADR-057). Additive, nullable / default 0.

Revision ID: f3a5c7e9b1d4
Revises: e1a3c5e7f9b2
Create Date: 2026-11-10 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f3a5c7e9b1d4"
down_revision: str | None = "e1a3c5e7f9b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("exchanges")}
    if "original_invoice_id" not in cols:
        op.add_column("exchanges", sa.Column("original_invoice_id", sa.Uuid()))
    if "trade_in_applied" not in cols:
        op.add_column(
            "exchanges",
            sa.Column("trade_in_applied", sa.Numeric(14, 2), nullable=False, server_default="0"),
        )
    if "refund" not in cols:
        op.add_column(
            "exchanges", sa.Column("refund", sa.Numeric(14, 2), nullable=False, server_default="0")
        )


def downgrade() -> None:
    op.drop_column("exchanges", "refund")
    op.drop_column("exchanges", "trade_in_applied")
    op.drop_column("exchanges", "original_invoice_id")
