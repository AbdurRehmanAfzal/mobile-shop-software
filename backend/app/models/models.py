"""SQLAlchemy database models for Mobile Shop Management System."""

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Enum, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()


class MobileCondition(str, enum.Enum):
    """Mobile phone condition types."""
    NEW = "new"
    PATCHED = "patched"
    USED = "used"


class MobileStatus(str, enum.Enum):
    """Mobile inventory status types."""
    IN_STOCK = "IN_STOCK"
    SOLD = "SOLD"
    RESERVED = "RESERVED"
    TRADE_IN = "TRADE_IN"


class PTAStatus(str, enum.Enum):
    """PTA (Pakistan Telecom Authority) approval status."""
    PTA = "PTA"
    NON_PTA = "NON_PTA"


class PartyType(str, enum.Enum):
    """Party type enum."""
    CUSTOMER = "CUSTOMER"
    VENDOR = "VENDOR"  # Wholesaler/supplier who sells mobiles
    TRADE_IN = "TRADE_IN"  # Customer who sells their own mobile


class Party(Base):
    """Unified Party model for both customers and suppliers."""
    __tablename__ = "parties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    email = Column(String(255), nullable=True)
    whatsapp = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    cnic = Column(String(20), nullable=True, unique=True)

    # Party type: CUSTOMER or SUPPLIER
    type = Column(Enum(PartyType), nullable=False)

    # Balance tracking (unified)
    current_balance = Column(Float, default=0.0)  # Positive = party owes shop, Negative = shop owes party

    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    transactions = relationship("Transaction", back_populates="party", foreign_keys="Transaction.party_id")
    purchases = relationship("Purchase", back_populates="party")
    exchanges = relationship("Exchange", back_populates="party")
    supplies = relationship("Supply", back_populates="party")


class Customer(Base):
    """Customer model for managing customer information and credit/ledger."""
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    email = Column(String(255), nullable=True)
    whatsapp = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    cnic = Column(String(20), nullable=True, unique=True)

    # Credit/Ledger tracking
    credit_balance = Column(Float, default=0.0)  # Amount customer owes
    total_purchased = Column(Float, default=0.0)
    total_paid = Column(Float, default=0.0)

    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    transactions = relationship("Transaction", back_populates="customer")
    purchases = relationship("Purchase", back_populates="customer")
    exchanges = relationship("Exchange", back_populates="customer")


class Supplier(Base):
    """Supplier model for managing supplier information and credit/ledger."""
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    email = Column(String(255), nullable=True)
    whatsapp = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    contact_person = Column(String(255), nullable=True)

    # Credit/Ledger tracking
    credit_balance = Column(Float, default=0.0)  # Amount shop owes to supplier
    total_purchased = Column(Float, default=0.0)
    total_paid = Column(Float, default=0.0)

    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    transactions = relationship("Transaction", back_populates="supplier")
    supplies = relationship("Supply", back_populates="supplier")


class MobileStorage(Base):
    """Mobile phone storage options (64GB, 128GB, 256GB, etc.)."""
    __tablename__ = "mobile_storages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # e.g., "128GB"
    name_urdu = Column(String(50), nullable=True)  # e.g., "128 گیگا بائٹ"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    inventory = relationship("MobileInventory", back_populates="storage")


class MobileColor(Base):
    """Mobile phone color options (Black, White, Gold, etc.)."""
    __tablename__ = "mobile_colors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # e.g., "Space Black"
    name_urdu = Column(String(50), nullable=True)  # e.g., "سپیس بلیک"
    hex_code = Column(String(7), nullable=True)  # e.g., "#000000" for color preview
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    inventory = relationship("MobileInventory", back_populates="color")


class MobileBrand(Base):
    """Mobile phone brands."""
    __tablename__ = "mobile_brands"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    name_urdu = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    models = relationship("MobileModel", back_populates="brand")


class MobileModel(Base):
    """Mobile phone models."""
    __tablename__ = "mobile_models"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("mobile_brands.id"), nullable=False)
    model_name = Column(String(255), nullable=False)
    model_name_urdu = Column(String(255), nullable=True)

    # Pricing
    original_price = Column(Float, nullable=True)
    sale_price = Column(Float, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    brand = relationship("MobileBrand", back_populates="models")
    inventory = relationship("MobileInventory", back_populates="model")


class MobileInventory(Base):
    """Mobile phone inventory tracking."""
    __tablename__ = "mobile_inventory"

    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(Integer, ForeignKey("mobile_models.id"), nullable=False)
    storage_id = Column(Integer, ForeignKey("mobile_storages.id"), nullable=True)  # Optional storage
    color_id = Column(Integer, ForeignKey("mobile_colors.id"), nullable=True)  # Optional color

    # IMEI Tracking - Support 1 to 3 IMEIs
    imei1 = Column(String(20), nullable=True)  # Primary IMEI
    imei2 = Column(String(20), nullable=True)  # Secondary IMEI (most phones)
    imei3 = Column(String(20), nullable=True)  # Tertiary IMEI (some phones)

    # Serial Number and PTA Status
    serial_number = Column(String(100), nullable=True)  # Optional serial number
    pta_status = Column(Enum(PTAStatus), nullable=False, default=PTAStatus.PTA)  # PTA or NON_PTA
    sim_time = Column(String(50), nullable=True)  # For non-PTA: "1 month", "3 months", etc.

    # Condition and Pricing
    condition = Column(Enum(MobileCondition), nullable=False)
    cost_price = Column(Float, nullable=False)
    sale_price = Column(Float, nullable=True)  # Optional - can be set later

    # Status tracking
    status = Column(Enum(MobileStatus), nullable=False, default=MobileStatus.IN_STOCK)
    is_sold = Column(Boolean, default=False)  # Kept for backward compatibility
    is_damaged = Column(Boolean, default=False)

    # Metadata
    batch_number = Column(String(50), nullable=True)
    received_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    model = relationship("MobileModel", back_populates="inventory")
    storage = relationship("MobileStorage", back_populates="inventory")
    color = relationship("MobileColor", back_populates="inventory")


class Accessory(Base):
    """Accessories inventory (chargers, cables, screen protectors, etc.)."""
    __tablename__ = "accessories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    name_urdu = Column(String(255), nullable=True)
    category = Column(String(100), nullable=False)  # Charger, Cable, Screen Protector, etc.

    # Inventory
    quantity = Column(Integer, default=0)

    # Pricing
    cost_price = Column(Float, nullable=False)
    sale_price = Column(Float, nullable=False)

    # Metadata
    sku = Column(String(50), unique=True, nullable=True)
    reorder_level = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    purchases = relationship("PurchaseItem", back_populates="accessory")


class Purchase(Base):
    """Purchase transactions from customers."""
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)  # Legacy
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=True)  # New unified reference

    # Purchase details
    total_amount = Column(Float, nullable=False)
    amount_paid = Column(Float, default=0.0)
    credit_amount = Column(Float, default=0.0)  # Amount on credit

    # Status
    is_completed = Column(Boolean, default=False)
    payment_status = Column(String(50), default="pending")  # pending, partial, completed

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="purchases")  # Legacy
    party = relationship("Party", back_populates="purchases")  # New unified
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="purchase")


class PurchaseItem(Base):
    """Individual items in a purchase."""
    __tablename__ = "purchase_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False)

    # Item type: either mobile or accessory
    item_type = Column(String(20), nullable=False)  # 'mobile' or 'accessory'
    mobile_inventory_id = Column(Integer, ForeignKey("mobile_inventory.id"), nullable=True)
    accessory_id = Column(Integer, ForeignKey("accessories.id"), nullable=True)

    quantity = Column(Integer, default=1)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)

    # Relationships
    purchase = relationship("Purchase", back_populates="items")
    accessory = relationship("Accessory", back_populates="purchases")


class Supply(Base):
    """Supply from suppliers to the shop."""
    __tablename__ = "supplies"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)  # Legacy
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=True)  # New unified reference

    # Supply details
    total_amount = Column(Float, nullable=False)
    amount_paid = Column(Float, default=0.0)
    credit_amount = Column(Float, default=0.0)

    # Status
    is_completed = Column(Boolean, default=False)
    payment_status = Column(String(50), default="pending")

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    supplier = relationship("Supplier", back_populates="supplies")  # Legacy
    party = relationship("Party", back_populates="supplies")  # New unified
    items = relationship("SupplyItem", back_populates="supply", cascade="all, delete-orphan")


class SupplyItem(Base):
    """Individual items supplied by supplier."""
    __tablename__ = "supply_items"

    id = Column(Integer, primary_key=True, index=True)
    supply_id = Column(Integer, ForeignKey("supplies.id"), nullable=False)
    mobile_inventory_id = Column(Integer, ForeignKey("mobile_inventory.id"), nullable=True)
    accessory_id = Column(Integer, ForeignKey("accessories.id"), nullable=True)

    quantity = Column(Integer, default=1)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)

    # Relationships
    supply = relationship("Supply", back_populates="items")


class Exchange(Base):
    """Exchange/Upgrade transactions - customer exchanges old phone for new."""
    __tablename__ = "exchanges"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)  # Legacy
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=True)  # New unified reference

    # Exchange details
    old_phone_inventory_id = Column(Integer, ForeignKey("mobile_inventory.id"), nullable=True)
    new_phone_inventory_id = Column(Integer, ForeignKey("mobile_inventory.id"), nullable=True)

    old_phone_value = Column(Float, nullable=False)
    new_phone_price = Column(Float, nullable=False)
    difference_amount = Column(Float, nullable=False)  # Amount customer pays/receives

    # Payment tracking
    amount_paid = Column(Float, default=0.0)
    credit_amount = Column(Float, default=0.0)

    # Status
    payment_status = Column(String(50), default="pending")

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="exchanges")  # Legacy
    party = relationship("Party", back_populates="exchanges")  # New unified
    payments = relationship("Payment", back_populates="exchange")


class Payment(Base):
    """Payment records for purchases and exchanges."""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)

    # Payment source
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=True)
    exchange_id = Column(Integer, ForeignKey("exchanges.id"), nullable=True)

    # Payment details
    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), nullable=False)  # cash, card, bank_transfer, etc.

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    customer = relationship("Customer", backref="payments")
    purchase = relationship("Purchase", back_populates="payments")
    exchange = relationship("Exchange", back_populates="payments")


class Transaction(Base):
    """General transaction record for auditing."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)

    # Transaction details
    transaction_type = Column(String(50), nullable=False)  # purchase, sale, exchange, payment, supply

    # Legacy references
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)

    # New unified reference
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=True)
    party_type = Column(String(50), nullable=True)  # CUSTOMER or SUPPLIER

    # Mobile reference
    mobile_id = Column(Integer, ForeignKey("mobile_inventory.id"), nullable=True)

    # Transaction amounts and details
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, nullable=True)
    total_amount = Column(Float, nullable=True)
    amount = Column(Float, nullable=False)  # Kept for backward compatibility
    balance_after = Column(Float, nullable=True)

    description = Column(Text, nullable=True)

    # Metadata
    transaction_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    customer = relationship("Customer", back_populates="transactions")  # Legacy
    supplier = relationship("Supplier", back_populates="transactions")  # Legacy
    party = relationship("Party", back_populates="transactions", foreign_keys=[party_id])  # New unified


class Reminder(Base):
    """WhatsApp/SMS reminder tracking."""
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)

    # Target
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)

    # Reminder details
    reminder_type = Column(String(50), nullable=False)  # payment_due, balance_due, stock_low
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    # Sending
    send_via = Column(String(50), nullable=False)  # whatsapp, sms, both
    is_sent = Column(Boolean, default=False)
    sent_at = Column(DateTime, nullable=True)

    # Scheduling
    scheduled_for = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    customer = relationship("Customer", backref="reminders")
    supplier = relationship("Supplier", backref="reminders")
