"""bill details for tax invoices (docs/36 §6): shops.phones_tax_at_import, invoices.cash_tendered,
invoice_lines.tax_rate. Additive, resumable, reversible.

Revision ID: d8f0b2c4e6a9
Revises: c7e9a1b3d5f8
Create Date: 2026-11-06 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8f0b2c4e6a9"
down_revision: str | None = "c7e9a1b3d5f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cols(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "phones_tax_at_import" not in _cols("shops"):
        op.add_column(
            "shops",
            sa.Column(
                "phones_tax_at_import", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
        )
    if "cash_tendered" not in _cols("invoices"):
        op.add_column("invoices", sa.Column("cash_tendered", sa.Numeric(14, 2), nullable=True))
    if "tax_rate" not in _cols("invoice_lines"):
        op.add_column("invoice_lines", sa.Column("tax_rate", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("invoice_lines", "tax_rate")
    op.drop_column("invoices", "cash_tendered")
    op.drop_column("shops", "phones_tax_at_import")
