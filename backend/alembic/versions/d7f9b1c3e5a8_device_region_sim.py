"""An Apple unit's region code (the letters after the part number, e.g. LL/A) and its SIM setup
(physical + eSIM, dual eSIM, dual physical ...) (owner 2026-11-09, ADR-055). Additive, nullable.

Revision ID: d7f9b1c3e5a8
Revises: c5e7a9b1d3f6
Create Date: 2026-11-09 20:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d7f9b1c3e5a8"
down_revision: str | None = "c5e7a9b1d3f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("devices")}
    if "region_code" not in cols:
        op.add_column("devices", sa.Column("region_code", sa.String(12)))
    if "sim_type" not in cols:
        op.add_column("devices", sa.Column("sim_type", sa.String(30)))


def downgrade() -> None:
    op.drop_column("devices", "sim_type")
    op.drop_column("devices", "region_code")
