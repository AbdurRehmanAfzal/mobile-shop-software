"""accessories: an item's variants (accessories shops 2026-11-20, ADR-118)

Two nullable columns. A variant is an ordinary item with its own stock, cost, SKU and barcode;
`variant_group` says which items are kinds of the same product and `variant` is this one's label
("Black", "2m"). Every existing item keeps NULL in both and behaves as before.
Rollback: `alembic downgrade a3c5e7f9b1d2` drops only these two columns and the index.

Revision ID: b4d6f8a0c2e4
Revises: a3c5e7f9b1d2
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b4d6f8a0c2e4"
down_revision: str | None = "a3c5e7f9b1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("accessories") as b:
        b.add_column(sa.Column("variant_group", sa.Uuid(), nullable=True))
        b.add_column(sa.Column("variant", sa.String(60), nullable=True))
        b.create_index("ix_accessories_variant_group", ["variant_group"])


def downgrade() -> None:
    with op.batch_alter_table("accessories") as b:
        b.drop_index("ix_accessories_variant_group")
        b.drop_column("variant")
        b.drop_column("variant_group")
