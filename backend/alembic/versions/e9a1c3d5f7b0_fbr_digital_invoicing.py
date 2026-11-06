"""FBR Digital Invoicing (docs/36 §4, ADR-050): shops.fbr_settings and fbr_submissions. Additive,
resumable, reversible.

Revision ID: e9a1c3d5f7b0
Revises: d8f0b2c4e6a9
Create Date: 2026-11-06 14:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e9a1c3d5f7b0"
down_revision: str | None = "d8f0b2c4e6a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "fbr_settings" not in {c["name"] for c in insp.get_columns("shops")}:
        op.add_column("shops", sa.Column("fbr_settings", sa.JSON(), nullable=True))
    if "fbr_submissions" not in insp.get_table_names():
        op.create_table(
            "fbr_submissions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("shop_id", sa.Uuid(), nullable=False),
            sa.Column("invoice_id", sa.Uuid(), nullable=False),
            sa.Column("kind", sa.String(length=12), nullable=False),
            sa.Column("env", sa.String(length=12), nullable=False),
            sa.Column("status", sa.String(length=12), nullable=False),
            sa.Column("fbr_invoice_no", sa.String(length=60), nullable=True),
            sa.Column("attempts", sa.Integer(), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("request", sa.JSON(), nullable=True),
            sa.Column("response", sa.JSON(), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_try_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("invoice_id", "kind", name="uq_fbr_submission_invoice_kind"),
        )
        op.create_index("ix_fbr_submissions_shop_id", "fbr_submissions", ["shop_id"])
        op.create_index("ix_fbr_submissions_invoice_id", "fbr_submissions", ["invoice_id"])
        op.create_index("ix_fbr_submissions_status", "fbr_submissions", ["status"])


def downgrade() -> None:
    op.drop_table("fbr_submissions")
    op.drop_column("shops", "fbr_settings")
