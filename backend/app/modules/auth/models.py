import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import ZERO, Base, Timestamped, UUIDPk


class Organisation(UUIDPk, Timestamped, Base):
    __tablename__ = "organisations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(
        String(20), default="trial", nullable=False
    )  # trial|basic|pro|chain
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    shops: Mapped[list["Shop"]] = relationship(back_populates="organisation")
    users: Mapped[list["User"]] = relationship(back_populates="organisation")


class Shop(UUIDPk, Timestamped, Base):
    __tablename__ = "shops"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_ur: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20))
    whatsapp: Mapped[str | None] = mapped_column(String(20))
    logo_path: Mapped[str | None] = mapped_column(String(500))
    ntn: Mapped[str | None] = mapped_column(String(30))
    strn: Mapped[str | None] = mapped_column(String(30))
    tax_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)  # percent, e.g. 18.00
    tax_inclusive: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    receipt_footer: Mapped[str | None] = mapped_column(Text)
    receipt_footer_ur: Mapped[str | None] = mapped_column(Text)
    invoice_prefix: Mapped[str] = mapped_column(String(10), default="INV", nullable=False)
    next_invoice_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_purchase_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_repair_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_payment_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_return_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    notification_settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Karachi", nullable=False)
    default_locale: Mapped[str] = mapped_column(String(5), default="ur", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    organisation: Mapped[Organisation] = relationship(back_populates="shops")


class User(UUIDPk, Timestamped, Base):
    __tablename__ = "users"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(String(100))
    pin_hash: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # owner|manager|salesman|technician
    locale: Mapped[str] = mapped_column(String(5), default="ur", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organisation: Mapped[Organisation] = relationship(back_populates="users")
    shop_links: Mapped[list["UserShop"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserShop(Base):
    __tablename__ = "user_shops"
    __table_args__ = (UniqueConstraint("user_id", "shop_id", name="uq_user_shop"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), primary_key=True
    )

    user: Mapped[User] = relationship(back_populates="shop_links")
    shop: Mapped[Shop] = relationship()
