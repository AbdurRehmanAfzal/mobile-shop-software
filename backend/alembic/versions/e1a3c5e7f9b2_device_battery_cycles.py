"""An Apple unit's battery cycle count (owner 2026-11-09, ADR-055). Additive, nullable.

Revision ID: e1a3c5e7f9b2
Revises: d7f9b1c3e5a8
Create Date: 2026-11-09 21:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e1a3c5e7f9b2"
down_revision: str | None = "d7f9b1c3e5a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("devices")}
    if "battery_cycles" not in cols:
        op.add_column("devices", sa.Column("battery_cycles", sa.Integer()))


def downgrade() -> None:
    op.drop_column("devices", "battery_cycles")
