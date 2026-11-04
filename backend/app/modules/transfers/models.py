"""Stock moved between two branches of one owner (docs/35 §5 item 2, ADR-046).

One `branch_transfers` row per move, owned by the sending shop (`shop_id`) and naming the receiving
one (`to_shop_id`); each phone or item on it is a `branch_transfer_lines` row. Nothing here is ever
changed after it is written: the money effect is two ledger groups (one per shop) and the phones'
history is the device events in each shop.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import ZERO, Base, ShopScoped, UUIDPk, utcnow


class BranchTransfer(UUIDPk, ShopScoped, Base):
    __tablename__ = "branch_transfers"

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    to_shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    note: Mapped[str | None] = mapped_column(Text)
    total_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    out_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    in_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    lines: Mapped[list["BranchTransferLine"]] = relationship(
        back_populates="transfer", cascade="all, delete-orphan", order_by="BranchTransferLine.seq"
    )


class BranchTransferLine(UUIDPk, Base):
    __tablename__ = "branch_transfer_lines"

    transfer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("branch_transfers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # device | item
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    from_device_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="SET NULL")
    )
    to_device_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="SET NULL")
    )
    from_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("accessories.id", ondelete="SET NULL")
    )
    to_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("accessories.id", ondelete="SET NULL")
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)

    transfer: Mapped[BranchTransfer] = relationship(back_populates="lines")
