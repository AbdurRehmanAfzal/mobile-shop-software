"""Repair lab (FR-REP-01..05): customer devices and the shop's own stock devices."""

import datetime as dt
import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk, utcnow


class RepairStatus(StrEnum):
    RECEIVED = "received"
    DIAGNOSED = "diagnosed"
    WAITING_PARTS = "waiting_parts"
    IN_PROGRESS = "in_progress"
    REPAIRED = "repaired"
    DELIVERED = "delivered"
    RETURNED_UNREPAIRED = "returned_unrepaired"
    UNCLAIMED = "unclaimed"


OPEN_STATUSES = {
    RepairStatus.RECEIVED,
    RepairStatus.DIAGNOSED,
    RepairStatus.WAITING_PARTS,
    RepairStatus.IN_PROGRESS,
    RepairStatus.REPAIRED,
}
CLOSED_STATUSES = {RepairStatus.DELIVERED, RepairStatus.RETURNED_UNREPAIRED, RepairStatus.UNCLAIMED}

TRANSITIONS: dict[RepairStatus, set[RepairStatus]] = {
    RepairStatus.RECEIVED: {
        RepairStatus.DIAGNOSED,
        RepairStatus.IN_PROGRESS,
        RepairStatus.WAITING_PARTS,
        RepairStatus.REPAIRED,
        RepairStatus.RETURNED_UNREPAIRED,
    },
    RepairStatus.DIAGNOSED: {
        RepairStatus.WAITING_PARTS,
        RepairStatus.IN_PROGRESS,
        RepairStatus.REPAIRED,
        RepairStatus.RETURNED_UNREPAIRED,
    },
    RepairStatus.WAITING_PARTS: {
        RepairStatus.IN_PROGRESS,
        RepairStatus.REPAIRED,
        RepairStatus.RETURNED_UNREPAIRED,
    },
    RepairStatus.IN_PROGRESS: {
        RepairStatus.WAITING_PARTS,
        RepairStatus.REPAIRED,
        RepairStatus.RETURNED_UNREPAIRED,
    },
    RepairStatus.REPAIRED: {
        RepairStatus.IN_PROGRESS,
        RepairStatus.DELIVERED,
        RepairStatus.UNCLAIMED,
    },
    RepairStatus.DELIVERED: set(),
    RepairStatus.RETURNED_UNREPAIRED: set(),
    RepairStatus.UNCLAIMED: {RepairStatus.DELIVERED},
}


class RepairJob(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "repair_jobs"
    __table_args__ = (UniqueConstraint("shop_id", "no", name="uq_repair_jobs_shop_no"),)

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), index=True
    )  # customer; None = own stock
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="RESTRICT"), index=True
    )  # stock device
    device_desc: Mapped[str] = mapped_column(String(200), nullable=False)  # "Samsung A54 black"
    imei: Mapped[str | None] = mapped_column(String(20))
    fault_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    fault_text: Mapped[str | None] = mapped_column(Text)
    received_accessories: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )  # sim, memory_card, cover, charger, box
    condition_photos: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    condition_notes: Mapped[str | None] = mapped_column(Text)
    estimate: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    advance: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    promised_at: Mapped[dt.date | None] = mapped_column(Date)
    technician_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    outside_party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="SET NULL")
    )  # outside technician
    outside_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=RepairStatus.RECEIVED, index=True
    )
    parts_total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    labour: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    discount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    paid: Mapped[Decimal] = mapped_column(
        default=ZERO, nullable=False
    )  # advance + paid at delivery
    warranty_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delivered_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    advance_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    bill_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )

    parts: Mapped[list["RepairPart"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="RepairPart.created_at"
    )
    status_log: Mapped[list["RepairStatusLog"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="RepairStatusLog.at"
    )


class RepairPart(UUIDPk, Base):
    __tablename__ = "repair_parts"

    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    accessory_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # FK once accessories stock exists
    qty: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    job: Mapped[RepairJob] = relationship(back_populates="parts")


class RepairStatusLog(UUIDPk, Base):
    __tablename__ = "repair_status_log"

    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(24))
    to_status: Mapped[str] = mapped_column(String(24), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    job: Mapped[RepairJob] = relationship(back_populates="status_log")


class DispatchStatus(StrEnum):
    AT_LAB = "at_lab"
    BACK = "back"
    CANCELLED = "cancelled"


class DispatchOutcome(StrEnum):
    FIXED = "fixed"
    NOT_FIXED = "not_fixed"


class RepairDispatch(UUIDPk, ShopScoped, Timestamped, Base):
    """A repair job sent to an outside repair lab / technician in the market (docs/34). One row per
    trip: a phone that comes back unfixed and goes to a second lab has two rows, so the history of
    every lab stays complete. The lab is a party of kind `technician`; its cost goes to its khata."""

    __tablename__ = "repair_dispatches"
    __table_args__ = (Index("ix_repair_dispatches_shop_status", "shop_id", "status"),)

    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lab_party_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False, default=DispatchStatus.AT_LAB)
    problem: Mapped[str | None] = mapped_column(Text)  # what the lab was asked to do
    quoted_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    sent_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    expected_back: Mapped[dt.date | None] = mapped_column(Date)
    sent_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    back_on: Mapped[dt.date | None] = mapped_column(Date)
    received_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    outcome: Mapped[str | None] = mapped_column(String(12))  # fixed | not_fixed
    final_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    paid_now: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    ledger_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    back_note: Mapped[str | None] = mapped_column(Text)
