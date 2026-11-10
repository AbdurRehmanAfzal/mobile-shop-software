"""party phone optional (owner 2026-11-10)

Only relaxes NOT NULL on parties.phone: every existing row keeps its number; the unique
(shop_id, phone) key stays (NULLs never clash).

Revision ID: b9d1f3a5c7e2
Revises: a7c9e1b3d5f8
"""

import sqlalchemy as sa

from alembic import op

revision: str = "b9d1f3a5c7e2"
down_revision: str | None = "a7c9e1b3d5f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("parties") as b:
        b.alter_column("phone", existing_type=sa.String(20), nullable=True)


def downgrade() -> None:
    # only possible while every party has a number
    with op.batch_alter_table("parties") as b:
        b.alter_column("phone", existing_type=sa.String(20), nullable=False)
