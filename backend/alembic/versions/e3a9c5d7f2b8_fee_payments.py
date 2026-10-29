"""software fee payments and the product owner's payment accounts (owner 2026-10-29)

Revision ID: e3a9c5d7f2b8
Revises: d2f8b6c1a4e7
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e3a9c5d7f2b8"
down_revision: str | None = "d2f8b6c1a4e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "fee_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("method", sa.String(length=60), nullable=False),
        sa.Column("reference", sa.String(length=80), nullable=True),
        sa.Column("proof_path", sa.String(length=500), nullable=True),
        sa.Column("months", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handled_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["handled_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fee_payments_organisation_id", "fee_payments", ["organisation_id"])


def downgrade() -> None:
    op.drop_index("ix_fee_payments_organisation_id", table_name="fee_payments")
    op.drop_table("fee_payments")
    op.drop_table("platform_settings")
