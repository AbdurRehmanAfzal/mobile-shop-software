"""password_requests: forgot-password requests from the login page (owner 2026-10-29)

Revision ID: c9e2a7b4d6f1
Revises: b8d5f1a3c7e2
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c9e2a7b4d6f1"
down_revision: str | None = "b8d5f1a3c7e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "password_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("sent_to", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handled_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["handled_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_requests_shop_id", "password_requests", ["shop_id"])


def downgrade() -> None:
    op.drop_index("ix_password_requests_shop_id", table_name="password_requests")
    op.drop_table("password_requests")
