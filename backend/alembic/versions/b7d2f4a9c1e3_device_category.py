"""models.category and devices.category: phone | tablet | watch

Revision ID: b7d2f4a9c1e3
Revises: a1c5e0d2b7f4
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7d2f4a9c1e3"
down_revision: str | None = "a1c5e0d2b7f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("models", "devices"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(
                sa.Column("category", sa.String(length=10), nullable=False, server_default="phone")
            )


def downgrade() -> None:
    for table in ("devices", "models"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("category")
