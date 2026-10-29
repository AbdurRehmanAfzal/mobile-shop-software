"""installment_plans: phones sold on qist (owner 2026-10-29)

Revision ID: a8c2e4f6b1d3
Revises: f4b1d8e2c6a9
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a8c2e4f6b1d3"
down_revision: str | None = "f4b1d8e2c6a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "installment_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("party_id", sa.Uuid(), nullable=False),
        sa.Column("total", sa.Numeric(14, 2), nullable=False),
        sa.Column("advance", sa.Numeric(14, 2), nullable=False),
        sa.Column("months", sa.Integer(), nullable=False),
        sa.Column("monthly", sa.Numeric(14, 2), nullable=False),
        sa.Column("due_day", sa.Integer(), nullable=False),
        sa.Column("first_due", sa.Date(), nullable=False),
        sa.Column("guarantor_name", sa.String(length=200), nullable=True),
        sa.Column("guarantor_phone", sa.String(length=20), nullable=True),
        sa.Column("guarantor_cnic", sa.String(length=20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["party_id"], ["parties.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_id"),
    )
    op.create_index("ix_installment_plans_shop_id", "installment_plans", ["shop_id"])
    op.create_index("ix_installment_plans_party_id", "installment_plans", ["party_id"])


def downgrade() -> None:
    op.drop_index("ix_installment_plans_party_id", table_name="installment_plans")
    op.drop_index("ix_installment_plans_shop_id", table_name="installment_plans")
    op.drop_table("installment_plans")
