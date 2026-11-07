"""Sale: the extra cash kept against the customer's old udhaar (owner 2026-11-06). Additive.

Revision ID: a1c3e5f7b9d2
Revises: e9a1c3d5f7b0
Create Date: 2026-11-06 19:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1c3e5f7b9d2"
down_revision: str | None = "e9a1c3d5f7b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "khata_adjusted" not in {c["name"] for c in insp.get_columns("invoices")}:
        op.add_column("invoices", sa.Column("khata_adjusted", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "khata_adjusted")
