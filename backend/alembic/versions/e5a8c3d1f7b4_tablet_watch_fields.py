"""tablet and watch details: cellular, watch case size, battery health

Revision ID: e5a8c3d1f7b4
Revises: d4f7b2c9e1a6
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5a8c3d1f7b4"
down_revision: str | None = "d4f7b2c9e1a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("devices") as batch:
        batch.add_column(sa.Column("cellular", sa.Boolean(), nullable=True))
        batch.add_column(sa.Column("size_mm", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("battery_health", sa.Integer(), nullable=True))
    # tablets/watches entered before: one with an IMEI took a SIM
    op.execute(
        "UPDATE devices SET cellular = (imei1 ~ '^[0-9]{15}$') WHERE category <> 'phone'"
        if op.get_bind().dialect.name == "postgresql"
        else "UPDATE devices SET cellular = (imei1 GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]') WHERE category <> 'phone'"
    )


def downgrade() -> None:
    with op.batch_alter_table("devices") as batch:
        batch.drop_column("battery_health")
        batch.drop_column("size_mm")
        batch.drop_column("cellular")
