"""payments.purpose (docs/32): 'bill' = money against bills (every existing row), 'lending' = money
given to / taken from a person with no bill (len-den). Additive, resumable, reversible.

Revision ID: e3a5c7e9f1b3
Revises: d2f4b6c8e0a2
Create Date: 2026-11-02 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e3a5c7e9f1b3"
down_revision: str | None = "d2f4b6c8e0a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("payments")}
    if "purpose" not in have:
        with op.batch_alter_table("payments", schema=None) as b:
            b.add_column(
                sa.Column("purpose", sa.String(length=10), nullable=False, server_default="bill")
            )
    idx = {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("payments")}
    if "ix_payments_shop_purpose" not in idx:
        op.create_index("ix_payments_shop_purpose", "payments", ["shop_id", "purpose"])


def downgrade() -> None:
    op.drop_index("ix_payments_shop_purpose", table_name="payments")
    with op.batch_alter_table("payments", schema=None) as b:
        b.drop_column("purpose")
