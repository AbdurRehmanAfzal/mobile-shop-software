"""verification thumb impression photo (owner 2026-11-13, ADR-069)

Additive: one nullable column; nothing existing changes.

Revision ID: d5f7b9c1e3a6
Revises: c3e5a7b9d1f4
"""

import sqlalchemy as sa

from alembic import op

revision: str = "d5f7b9c1e3a6"
down_revision: str | None = "c3e5a7b9d1f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("verifications", sa.Column("thumb_path", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("verifications", "thumb_path")
