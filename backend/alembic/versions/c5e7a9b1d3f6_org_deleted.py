"""A customer moved to the bin by the super admin (owner 2026-11-09, ADR-054): when, by whom and
why. Additive; `organisations.is_active` stays the switch, nothing is ever removed.

Revision ID: c5e7a9b1d3f6
Revises: b3d5f7a9c1e4
Create Date: 2026-11-09 18:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c5e7a9b1d3f6"
down_revision: str | None = "b3d5f7a9c1e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("organisations")}
    if "deleted_at" not in cols:
        op.add_column("organisations", sa.Column("deleted_at", sa.DateTime(timezone=True)))
    if "deleted_by" not in cols:
        op.add_column("organisations", sa.Column("deleted_by", sa.Uuid()))
    if "deleted_reason" not in cols:
        op.add_column("organisations", sa.Column("deleted_reason", sa.String(200)))


def downgrade() -> None:
    op.drop_column("organisations", "deleted_reason")
    op.drop_column("organisations", "deleted_by")
    op.drop_column("organisations", "deleted_at")
