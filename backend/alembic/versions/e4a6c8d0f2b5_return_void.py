"""a return or a branch transfer can be undone (owner 2026-11-15, ADR-090): status / why / who on
returns; the transfer that undid a branch transfer; a cancelled installment plan

Every existing return stays "posted"; nothing else changes.

Revision ID: e4a6c8d0f2b5
Revises: c1e3a5b7d9f2
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4a6c8d0f2b5"
down_revision: str | None = "c1e3a5b7d9f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("returns") as b:
        b.add_column(sa.Column("status", sa.String(10), nullable=False, server_default="posted"))
        b.add_column(sa.Column("void_reason", sa.Text(), nullable=True))
        b.add_column(sa.Column("voided_by", sa.Uuid(), nullable=True))
    with op.batch_alter_table("branch_transfers") as b:
        b.add_column(sa.Column("undone_by", sa.Uuid(), nullable=True))
    with op.batch_alter_table("installment_plans") as b:
        b.add_column(sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column("cancel_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("installment_plans") as b:
        b.drop_column("cancel_reason")
        b.drop_column("cancelled_at")
    with op.batch_alter_table("branch_transfers") as b:
        b.drop_column("undone_by")
    with op.batch_alter_table("returns") as b:
        b.drop_column("voided_by")
        b.drop_column("void_reason")
        b.drop_column("status")
