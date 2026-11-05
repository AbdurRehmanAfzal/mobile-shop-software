"""branch_transfers + branch_transfer_lines (docs/35 §5 item 2, ADR-046): phones and items moved
between two branches of one owner. Additive, resumable, reversible.

Revision ID: b6d8f0a2c4e7
Revises: a5c7e9b1d3f6
Create Date: 2026-11-04 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b6d8f0a2c4e7"
down_revision: str | None = "a5c7e9b1d3f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "branch_transfers" not in tables:
        op.create_table(
            "branch_transfers",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("shop_id", sa.Uuid(), nullable=False),
            sa.Column("no", sa.String(length=20), nullable=False),
            sa.Column("to_shop_id", sa.Uuid(), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("total_cost", sa.Numeric(14, 2), nullable=False),
            sa.Column("out_group_id", sa.Uuid(), nullable=True),
            sa.Column("in_group_id", sa.Uuid(), nullable=True),
            sa.Column("user_id", sa.Uuid(), nullable=True),
            sa.Column("at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["to_shop_id"], ["shops.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["out_group_id"], ["ledger_groups.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["in_group_id"], ["ledger_groups.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_branch_transfers_shop_id", "branch_transfers", ["shop_id"])
        op.create_index("ix_branch_transfers_to_shop_id", "branch_transfers", ["to_shop_id"])
    if "branch_transfer_lines" not in tables:
        op.create_table(
            "branch_transfer_lines",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("transfer_id", sa.Uuid(), nullable=False),
            sa.Column("seq", sa.Integer(), nullable=False),
            sa.Column("kind", sa.String(length=10), nullable=False),
            sa.Column("label", sa.String(length=200), nullable=False),
            sa.Column("from_device_id", sa.Uuid(), nullable=True),
            sa.Column("to_device_id", sa.Uuid(), nullable=True),
            sa.Column("from_item_id", sa.Uuid(), nullable=True),
            sa.Column("to_item_id", sa.Uuid(), nullable=True),
            sa.Column("qty", sa.Integer(), nullable=False),
            sa.Column("cost", sa.Numeric(14, 2), nullable=False),
            sa.ForeignKeyConstraint(["transfer_id"], ["branch_transfers.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["from_device_id"], ["devices.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["to_device_id"], ["devices.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["from_item_id"], ["accessories.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["to_item_id"], ["accessories.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_branch_transfer_lines_transfer_id", "branch_transfer_lines", ["transfer_id"]
        )


def downgrade() -> None:
    op.drop_table("branch_transfer_lines")
    op.drop_table("branch_transfers")
