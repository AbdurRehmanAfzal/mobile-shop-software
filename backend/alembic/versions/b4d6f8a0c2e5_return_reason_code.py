"""why a phone came back (owner 2026-11-17, ADR-097): returns.reason_code, one of a short list
(changed mind, fault, not as told, price, wants another phone, not selling, other)

Every existing return keeps NULL ("not said"); the free-text reason stays as it is.

Revision ID: b4d6f8a0c2e5
Revises: f2b4d6a8c0e3
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b4d6f8a0c2e5"
down_revision: str | None = "f2b4d6a8c0e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("returns") as b:
        b.add_column(sa.Column("reason_code", sa.String(20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("returns") as b:
        b.drop_column("reason_code")
