"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum


# Enums
class MobileConditionEnum(str, Enum):
    NEW = "new"
    PATCHED = "patched"
    USED = "used"


class PTAStatusEnum(str, Enum):
    PTA = "PTA"
    NON_PTA = "NON_PTA"


class PartyTypeEnum(str, Enum):
    CUSTOMER = "CUSTOMER"
    VENDOR = "VENDOR"  # Wholesaler/supplier who sells mobiles
    TRADE_IN = "TRADE_IN"  # Customer who sells their own mobile


# ==================== PARTY SCHEMAS (Unified Customer/Supplier) ====================
class PartyBase(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    cnic: Optional[str] = None
    notes: Optional[str] = None


class PartyCreate(PartyBase):
    type: PartyTypeEnum
    is_active: bool = True


class PartyUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    cnic: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class PartyResponse(PartyBase):
    id: int
    type: str
    current_balance: float
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== CUSTOMER SCHEMAS ====================
class CustomerBase(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    cnic: Optional[str] = None
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    cnic: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(CustomerBase):
    id: int
    credit_balance: float
    total_purchased: float
    total_paid: float
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerLedgerResponse(BaseModel):
    id: int
    name: str
    phone: str
    credit_balance: float
    total_purchased: float
    total_paid: float
    created_at: datetime


# ==================== SUPPLIER SCHEMAS ====================
class SupplierBase(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierResponse(SupplierBase):
    id: int
    credit_balance: float
    total_purchased: float
    total_paid: float
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== MOBILE BRAND & MODEL SCHEMAS ====================
class MobileBrandBase(BaseModel):
    name: str
    name_urdu: Optional[str] = None


class MobileBrandCreate(MobileBrandBase):
    pass


class MobileBrandUpdate(BaseModel):
    name: Optional[str] = None
    name_urdu: Optional[str] = None


class MobileBrandResponse(MobileBrandBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class MobileModelBase(BaseModel):
    brand_id: int
    model_name: str
    model_name_urdu: Optional[str] = None
    original_price: Optional[float] = None
    sale_price: float


class MobileModelCreate(MobileModelBase):
    pass


class MobileModelUpdate(BaseModel):
    brand_id: Optional[int] = None
    model_name: Optional[str] = None
    model_name_urdu: Optional[str] = None
    original_price: Optional[float] = None
    sale_price: Optional[float] = None


class MobileModelResponse(MobileModelBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== MOBILE INVENTORY SCHEMAS ====================
class MobileInventoryBase(BaseModel):
    model_id: int
    storage_id: Optional[int] = None
    color_id: Optional[int] = None
    condition: MobileConditionEnum
    cost_price: float
    sale_price: Optional[float] = None
    # Multiple IMEI support
    imei1: Optional[str] = None
    imei2: Optional[str] = None
    imei3: Optional[str] = None
    # Serial Number
    serial_number: Optional[str] = None
    # PTA Status and SIM Time
    pta_status: PTAStatusEnum = PTAStatusEnum.PTA
    sim_time: Optional[str] = None  # For non-PTA: "1 month", "3 months", etc.
    batch_number: Optional[str] = None
    notes: Optional[str] = None


class MobileInventoryCreate(MobileInventoryBase):
    pass


class MobileInventoryUpdate(BaseModel):
    sale_price: Optional[float] = None
    is_damaged: Optional[bool] = None
    serial_number: Optional[str] = None
    pta_status: Optional[PTAStatusEnum] = None
    sim_time: Optional[str] = None
    notes: Optional[str] = None


# Nested schemas for relationships
class MobileStorageResponse(BaseModel):
    id: int
    name: str
    name_urdu: Optional[str] = None

    class Config:
        from_attributes = True


class MobileColorResponse(BaseModel):
    id: int
    name: str
    name_urdu: Optional[str] = None
    hex_code: Optional[str] = None

    class Config:
        from_attributes = True


class MobileBrandForResponse(MobileBrandBase):
    id: int

    class Config:
        from_attributes = True


class MobileModelForResponse(BaseModel):
    id: int
    model_name: str
    model_name_urdu: Optional[str] = None
    original_price: Optional[float] = None
    sale_price: float
    brand: MobileBrandForResponse

    class Config:
        from_attributes = True


class MobileInventoryResponse(MobileInventoryBase):
    id: int
    is_sold: bool
    is_damaged: bool
    received_date: datetime
    created_at: datetime
    updated_at: datetime
    model: Optional[MobileModelForResponse] = None
    storage: Optional[MobileStorageResponse] = None
    color: Optional[MobileColorResponse] = None

    class Config:
        from_attributes = True


# ==================== ACCESSORY SCHEMAS ====================
class AccessoryBase(BaseModel):
    name: str
    name_urdu: Optional[str] = None
    category: str
    cost_price: float
    sale_price: float
    quantity: int = 0
    sku: Optional[str] = None
    reorder_level: int = 5


class AccessoryCreate(AccessoryBase):
    pass


class AccessoryUpdate(BaseModel):
    name: Optional[str] = None
    name_urdu: Optional[str] = None
    category: Optional[str] = None
    cost_price: Optional[float] = None
    sale_price: Optional[float] = None
    quantity: Optional[int] = None
    sku: Optional[str] = None
    reorder_level: Optional[int] = None


class AccessoryResponse(AccessoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== PURCHASE SCHEMAS ====================
class PurchaseItemCreate(BaseModel):
    item_type: str  # 'mobile' or 'accessory'
    mobile_inventory_id: Optional[int] = None
    accessory_id: Optional[int] = None
    quantity: int = 1
    unit_price: float


class PurchaseCreate(BaseModel):
    customer_id: int
    items: List[PurchaseItemCreate]
    amount_paid: float = 0.0
    notes: Optional[str] = None


class PurchaseResponse(BaseModel):
    id: int
    customer_id: int
    total_amount: float
    amount_paid: float
    credit_amount: float
    is_completed: bool
    payment_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== PAYMENT SCHEMAS ====================
class PaymentCreate(BaseModel):
    customer_id: Optional[int] = None
    purchase_id: Optional[int] = None
    exchange_id: Optional[int] = None
    amount: float
    payment_method: str  # cash, card, bank_transfer, etc.
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    id: int
    customer_id: Optional[int]
    purchase_id: Optional[int]
    exchange_id: Optional[int]
    amount: float
    payment_method: str
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== EXCHANGE SCHEMAS ====================
class ExchangeCreate(BaseModel):
    customer_id: int
    old_phone_inventory_id: Optional[int] = None
    new_phone_inventory_id: int
    old_phone_value: float
    new_phone_price: float
    amount_paid: float = 0.0
    notes: Optional[str] = None


class ExchangeResponse(BaseModel):
    id: int
    customer_id: int
    difference_amount: float
    amount_paid: float
    credit_amount: float
    payment_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== REMINDER SCHEMAS ====================
class ReminderCreate(BaseModel):
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    reminder_type: str  # payment_due, balance_due, stock_low
    title: str
    message: str
    send_via: str  # whatsapp, sms, both
    scheduled_for: Optional[datetime] = None


class ReminderResponse(BaseModel):
    id: int
    customer_id: Optional[int]
    supplier_id: Optional[int]
    reminder_type: str
    title: str
    message: str
    send_via: str
    is_sent: bool
    sent_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== TRANSACTION SCHEMAS ====================
class TransactionCreate(BaseModel):
    transaction_type: str
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    amount: float
    description: Optional[str] = None


class TransactionResponse(BaseModel):
    id: int
    transaction_type: str
    customer_id: Optional[int]
    supplier_id: Optional[int]
    amount: float
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== DASHBOARD SCHEMAS ====================
class DashboardStats(BaseModel):
    total_customers: int
    total_suppliers: int
    total_inventory_value: float
    total_customer_credit: float
    total_supplier_credit: float
    monthly_sales: float
    pending_payments: float


# ==================== QUICK TRADE-IN REQUEST SCHEMA ====================
class QuickTradeInRequest(BaseModel):
    """Request body for quick trade-in purchase endpoint"""
    supplier_id: int
    brand_id: int
    model_id: int
    imei1: str  # Required - every phone has at least one IMEI
    imei2: Optional[str] = None  # Optional - not all phones have a second IMEI
    imei3: Optional[str] = None  # Optional - rare, only some phones
    condition: str = "used"  # 'new', 'used', or 'patched'
    patch_details: Optional[str] = None
    pta_status: str = "locked"  # 'locked', 'unlocked', or 'approved'
    cnic_number: Optional[str] = None
    cnic_photo_url: Optional[str] = None
    photos: Optional[List[str]] = None
    purchase_price: float
    payment_method: str = "cash"
    amount_paid: float = 0
    transaction_date: Optional[date] = None
    notes: Optional[str] = None
