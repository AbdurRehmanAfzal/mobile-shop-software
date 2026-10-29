"""idempotency_keys: a phone's queued document is posted once (offline mode, owner 2026-10-29)

Revision ID: b8d5f1a3c7e2
Revises: a7c4e9f2b5d1
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b8d5f1a3c7e2"
down_revision: str | None = "a7c4e9f2b5d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("route", sa.String(length=80), nullable=False),
        sa.Column("status", sa.Integer(), nullable=True),
        sa.Column("body", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "key", name="uq_idempotency_shop_key"),
    )


def downgrade() -> None:
    op.drop_table("idempotency_keys")
