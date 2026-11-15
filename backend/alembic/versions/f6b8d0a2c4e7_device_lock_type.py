"""locked phones (iCloud / Google FRP) bought for parts or sold as they are (owner 2026-11-15, ADR-085)

Additive: one nullable column; existing phones stay normal phones.

Revision ID: f6b8d0a2c4e7
Revises: d4f6a8c0e2b5
"""

import sqlalchemy as sa

from alembic import op

revision: str = "f6b8d0a2c4e7"
down_revision: str | None = "d4f6a8c0e2b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("lock_type", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("devices", "lock_type")
