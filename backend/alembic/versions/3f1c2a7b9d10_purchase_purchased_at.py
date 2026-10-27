"""purchases.purchased_at: when the phone was actually bought

Revision ID: 3f1c2a7b9d10
Revises: 218e639dde2c
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3f1c2a7b9d10"
down_revision: str | None = "218e639dde2c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("purchases", sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("purchases") as batch:
        batch.drop_column("purchased_at")
