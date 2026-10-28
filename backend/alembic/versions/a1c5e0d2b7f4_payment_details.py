"""payment_details: how a sale or purchase was paid (online, cheque, remittance)

Revision ID: a1c5e0d2b7f4
Revises: 3f1c2a7b9d10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1c5e0d2b7f4"
down_revision: str | None = "3f1c2a7b9d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payment_details",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("document_type", sa.String(length=20), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("method", sa.String(length=12), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("bank", sa.String(length=80), nullable=True),
        sa.Column("reference", sa.String(length=80), nullable=True),
        sa.Column("cheque_date", sa.Date(), nullable=True),
        sa.Column("sender_name", sa.String(length=120), nullable=True),
        sa.Column("country", sa.String(length=60), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("foreign_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("rate", sa.Numeric(14, 2), nullable=True),
        sa.Column("service", sa.String(length=60), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payment_details_shop_id", "payment_details", ["shop_id"])
    op.create_index(
        "ix_payment_details_document",
        "payment_details",
        ["shop_id", "document_type", "document_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_payment_details_document", table_name="payment_details")
    op.drop_index("ix_payment_details_shop_id", table_name="payment_details")
    op.drop_table("payment_details")
