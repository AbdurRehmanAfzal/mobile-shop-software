"""what a shop chose when paying its fee (owner 2026-11-17, ADR-095): package, extra modules,
add-ons, months, discount and total, kept on the payment

Every existing payment keeps NULL (a plain "months" payment, as before).

Revision ID: f2b4d6a8c0e3
Revises: e4a6c8d0f2b5
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f2b4d6a8c0e3"
down_revision: str | None = "e4a6c8d0f2b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("fee_payments") as b:
        b.add_column(sa.Column("package_order", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("fee_payments") as b:
        b.drop_column("package_order")
