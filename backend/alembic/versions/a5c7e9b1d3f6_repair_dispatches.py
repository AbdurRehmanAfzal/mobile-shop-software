"""repair_dispatches (docs/34): repair jobs sent to outside repair labs / technicians, one row per
trip. Additive, resumable, reversible.

Revision ID: a5c7e9b1d3f6
Revises: f4b6d8f0a2c4
Create Date: 2026-11-03 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a5c7e9b1d3f6"
down_revision: str | None = "f4b6d8f0a2c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if "repair_dispatches" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "repair_dispatches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("lab_party_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("problem", sa.Text(), nullable=True),
        sa.Column("quoted_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("sent_on", sa.Date(), nullable=False),
        sa.Column("expected_back", sa.Date(), nullable=True),
        sa.Column("sent_by", sa.Uuid(), nullable=True),
        sa.Column("back_on", sa.Date(), nullable=True),
        sa.Column("received_by", sa.Uuid(), nullable=True),
        sa.Column("outcome", sa.String(length=12), nullable=True),
        sa.Column("final_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid_now", sa.Numeric(14, 2), nullable=False),
        sa.Column("ledger_group_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("back_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["job_id"], ["repair_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lab_party_id"], ["parties.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sent_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["received_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ledger_group_id"], ["ledger_groups.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_repair_dispatches_shop_id", "repair_dispatches", ["shop_id"])
    op.create_index("ix_repair_dispatches_job_id", "repair_dispatches", ["job_id"])
    op.create_index("ix_repair_dispatches_lab_party_id", "repair_dispatches", ["lab_party_id"])
    op.create_index("ix_repair_dispatches_shop_status", "repair_dispatches", ["shop_id", "status"])


def downgrade() -> None:
    op.drop_table("repair_dispatches")
