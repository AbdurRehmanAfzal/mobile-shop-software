"""Software fees: a package extended on credit (`fee_dues`) and the part of a payment that cleared
it (`fee_payments.to_dues`) (owner 2026-11-09, ADR-053). Additive.

Revision ID: b3d5f7a9c1e4
Revises: a1c3e5f7b9d2
Create Date: 2026-11-09 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3d5f7a9c1e4"
down_revision: str | None = "a1c3e5f7b9d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "to_dues" not in {c["name"] for c in insp.get_columns("fee_payments")}:
        op.add_column(
            "fee_payments",
            sa.Column("to_dues", sa.Numeric(14, 2), nullable=False, server_default="0"),
        )
    if "fee_dues" not in insp.get_table_names():
        op.create_table(
            "fee_dues",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column(
                "organisation_id",
                sa.Uuid(),
                sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "shop_id", sa.Uuid(), sa.ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
            ),
            sa.Column("invoice_no", sa.String(12), nullable=False),
            sa.Column("months", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("period_from", sa.Date(), nullable=True),
            sa.Column("period_to", sa.Date(), nullable=True),
            sa.Column("due_on", sa.Date(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column(
                "created_by",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_fee_dues_organisation_id", "fee_dues", ["organisation_id"])
        op.create_index("ix_fee_dues_invoice_no", "fee_dues", ["invoice_no"])


def downgrade() -> None:
    op.drop_index("ix_fee_dues_invoice_no", table_name="fee_dues")
    op.drop_index("ix_fee_dues_organisation_id", table_name="fee_dues")
    op.drop_table("fee_dues")
    op.drop_column("fee_payments", "to_dues")
