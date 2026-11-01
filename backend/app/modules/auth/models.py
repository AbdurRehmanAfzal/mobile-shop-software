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
    # owner 2026-10-29: the fee the product owner charges per month (PKR) and a private note
    monthly_fee: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    fee_note: Mapped[str | None] = mapped_column(String(200))
    # owner addendum 3 (2026-10-31): when the paid plan started, this shop's own grace days
    # (None = the provider's default), and the last lock state we audited
    plan_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grace_days: Mapped[int | None] = mapped_column(Integer)
    plan_status_seen: Mapped[str | None] = mapped_column(String(10))
    # owner 2026-10-29: modules switched on for this shop; None = the plan's defaults
    modules: Mapped[list | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # provider console (docs/28): cloud or one-PC install, last use of the app, the one-PC
    # install's heartbeat and version, and (on a one-PC install) the SaaS organisation its keys are for
    deployment: Mapped[str] = mapped_column(String(10), default="cloud", server_default="cloud", nullable=False)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    install_last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    install_version: Mapped[str | None] = mapped_column(String(40))
    license_org_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)

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
    # owner allows staff to log in with their fingerprint too (owner 2026-10-28)
    fingerprint_staff: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="0"
    )
    receipt_footer: Mapped[str | None] = mapped_column(Text)
    receipt_footer_ur: Mapped[str | None] = mapped_column(Text)
    invoice_prefix: Mapped[str] = mapped_column(String(10), default="INV", nullable=False)
    next_invoice_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_purchase_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_repair_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_payment_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_return_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_expense_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_exchange_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    notification_settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Karachi", nullable=False)
    default_locale: Mapped[str] = mapped_column(String(5), default="ur", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # price stickers (owner 2026-10-30): 10 distinct letters that spell the cost; saved sticker choices
    label_code_word: Mapped[str | None] = mapped_column(String(10))
    label_prefs: Mapped[dict | None] = mapped_column(JSON)
    # owner addendum 4: barcode type / prefix / mode for NEW barcodes, and the last number used
    barcode_prefs: Mapped[dict | None] = mapped_column(JSON)
    # owner addendum 5: valuation (avg | fifo), negative stock, unit table, grades
    item_prefs: Mapped[dict | None] = mapped_column(JSON)
    # owner addendum 6: grades of used units, whether used phones need the lock check too
    device_prefs: Mapped[dict | None] = mapped_column(JSON)
    barcode_seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    # owner 2026-10-30: who may sell below asking / change the asking price (sales/approval.py)
    sale_rules: Mapped[dict | None] = mapped_column(JSON)
    # Shop Audit (owner brief 2026-10-30): age bands, high-value, low-margin, performance, bypass thresholds
    audit_prefs: Mapped[dict | None] = mapped_column(JSON)

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
