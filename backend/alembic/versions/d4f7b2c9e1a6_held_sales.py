"""held sales: carts parked at the counter (POS hold)

Revision ID: d4f7b2c9e1a6
Revises: c3e8a1f5d9b2
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4f7b2c9e1a6"
down_revision: str | None = "c3e8a1f5d9b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "held_sales",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=True),
        sa.Column("total", sa.Numeric(14, 2), nullable=False),
        sa.Column("items", sa.Integer(), nullable=False),
        sa.Column("cart", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_held_sales_shop_id", "held_sales", ["shop_id"])


def downgrade() -> None:
    op.drop_index("ix_held_sales_shop_id", table_name="held_sales")
    op.drop_table("held_sales")
