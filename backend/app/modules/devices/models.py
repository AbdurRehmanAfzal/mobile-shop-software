"""Devices (one row per physical phone, forever), their append-only events and accessory bundle."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
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

from app.db.base import Base, ShopScoped, Timestamped, UUIDPk, utcnow
from app.modules.devices.state import DeviceCondition, DeviceStatus, PtaStatus, VerificationStatus


class Device(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "devices"
    __table_args__ = (
        UniqueConstraint("shop_id", "imei1", name="uq_devices_shop_imei1"),
        Index("ix_devices_shop_status", "shop_id", "status"),
    )

    imei1: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    imei2: Mapped[str | None] = mapped_column(String(20), index=True)
    serial: Mapped[str | None] = mapped_column(String(60))
    brand_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("models.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    storage_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("storages.id", ondelete="SET NULL")
    )
    colour_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("colours.id", ondelete="SET NULL")
    )
    condition: Mapped[str] = mapped_column(String(20), nullable=False, default=DeviceCondition.USED)
    pta_status: Mapped[str] = mapped_column(String(20), nullable=False, default=PtaStatus.UNKNOWN)
    sim_time_months: Mapped[int | None] = mapped_column(Integer)
    warranty_months: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warranty_start: Mapped[date | None] = mapped_column(Date)
    patch_details: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    photos: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # ---- projection of the event log (written only by apply_event) ----
    status: Mapped[str] = mapped_column(String(40), nullable=False, default=DeviceStatus.IN_STOCK)
    current_party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="SET NULL")
    )
    verification_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=VerificationStatus.NOT_REQUIRED
    )
    cost_price: Mapped[Decimal | None] = mapped_column()
    asking_price: Mapped[Decimal | None] = mapped_column()
    cycle_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    last_event_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    event_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    events: Mapped[list["DeviceEvent"]] = relationship(
        back_populates="device", order_by="DeviceEvent.seq", cascade="all, delete-orphan"
    )
    accessories: Mapped[list["DeviceAccessoryItem"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )


class DeviceEvent(UUIDPk, ShopScoped, Base):
    __tablename__ = "device_events"
    __table_args__ = (
        UniqueConstraint("device_id", "seq", name="uq_device_events_seq"),
        Index("ix_device_events_shop_type_at", "shop_id", "type", "at"),
    )

    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    status_after: Mapped[str] = mapped_column(String(40), nullable=False)
    party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="SET NULL"), index=True
    )
    amount: Mapped[Decimal | None] = mapped_column()
    ledger_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    document_type: Mapped[str | None] = mapped_column(String(40))
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    data: Mapped[dict | None] = mapped_column(JSON)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    device: Mapped[Device] = relationship(back_populates="events")


class DeviceAccessoryItem(UUIDPk, Base):
    """What came with / goes with a device (FR-ACC-02, FR-ACC-03)."""

    __tablename__ = "device_accessory_items"

    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # box|charger|cable|earphones|airpods|other
    label: Mapped[str | None] = mapped_column(String(80))  # for "other"
    came_with: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    condition: Mapped[str | None] = mapped_column(String(40))
    pending_from: Mapped[str] = mapped_column(
        String(10), default="none", nullable=False
    )  # none|vendor|shop
    expected_at: Mapped[date | None] = mapped_column(Date)
    delivered_at: Mapped[date | None] = mapped_column(Date)
    given_at_sale: Mapped[bool | None] = mapped_column(Boolean)
    promised_to_customer_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(200))

    device: Mapped[Device] = relationship(back_populates="accessories")
