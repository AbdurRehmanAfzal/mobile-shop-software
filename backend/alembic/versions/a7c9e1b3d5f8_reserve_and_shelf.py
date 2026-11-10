"""Reserve a phone or some pieces of an item for a customer, and a shelf for a phone (owner
2026-11-10, ADR-060). Additive: nullable columns on devices and a new table; nothing else changes.

Revision ID: a7c9e1b3d5f8
Revises: f3a5c7e9b1d4
Create Date: 2026-11-10 15:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7c9e1b3d5f8"
down_revision: str | None = "f3a5c7e9b1d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEVICE_COLS = [
    ("location", sa.String(60)),
    ("reserved_party_id", sa.Uuid()),
    ("reserved_at", sa.DateTime(timezone=True)),
    ("reserved_until", sa.Date()),
    ("reserved_note", sa.String(200)),
    ("reserved_by", sa.Uuid()),
]


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    have = {c["name"] for c in insp.get_columns("devices")}
    for name, typ in DEVICE_COLS:
        if name not in have:
            op.add_column("devices", sa.Column(name, typ))
    if "accessory_reservations" not in insp.get_table_names():
        op.create_table(
            "accessory_reservations",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column(
                "shop_id", sa.Uuid(), sa.ForeignKey("shops.id", ondelete="RESTRICT"), nullable=False
            ),
            sa.Column(
                "accessory_id",
                sa.Uuid(),
                sa.ForeignKey("accessories.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column(
                "party_id",
                sa.Uuid(),
                sa.ForeignKey("parties.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("qty", sa.Integer(), nullable=False),
            sa.Column("fulfilled_qty", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(10), nullable=False, server_default="open"),
            sa.Column("until", sa.Date()),
            sa.Column("note", sa.String(200)),
            sa.Column("created_by", sa.Uuid()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("closed_at", sa.DateTime(timezone=True)),
            sa.Column("close_reason", sa.String(200)),
        )
        op.create_index("ix_accessory_reservations_shop_id", "accessory_reservations", ["shop_id"])
        op.create_index(
            "ix_accessory_reservations_item",
            "accessory_reservations",
            ["shop_id", "accessory_id", "status"],
        )


def downgrade() -> None:
    op.drop_index("ix_accessory_reservations_item", table_name="accessory_reservations")
    op.drop_index("ix_accessory_reservations_shop_id", table_name="accessory_reservations")
    op.drop_table("accessory_reservations")
    for name, _ in reversed(DEVICE_COLS):
        op.drop_column("devices", name)
