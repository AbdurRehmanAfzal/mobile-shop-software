"""staff access requests (owner 2026-11-14, ADR-077)

Additive: one new table; nothing existing changes.

Revision ID: c8e2a4f6b0d1
Revises: a9c1e3f5b7d9
"""

import sqlalchemy as sa

from alembic import op

revision: str = "c8e2a4f6b0d1"
down_revision: str | None = "a9c1e3f5b7d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_access",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "shop_id", sa.Uuid(), sa.ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decided_by", sa.Uuid()),
    )
    op.create_index("ix_staff_access_shop_id", "staff_access", ["shop_id"])
    op.create_index("ix_staff_access_user_id", "staff_access", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_staff_access_user_id", "staff_access")
    op.drop_index("ix_staff_access_shop_id", "staff_access")
    op.drop_table("staff_access")
