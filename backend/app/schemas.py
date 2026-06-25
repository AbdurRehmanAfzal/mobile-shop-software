from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum

# ============================================================================
# ENUMS
# ============================================================================
class ConditionEnum(str, Enum):
    BOX_PACK = "BOX_PACK"
    PATCHED = "PATCHED"
    USED = "USED"

class MobileStatusEnum(str, Enum):
    IN_STOCK = "IN_STOCK"
    SOLD = "SOLD"
    RESERVED = "RESERVED"
    TRADE_IN = "TRADE_IN"

class AccessoryTypeEnum(str, Enum):
    BOX = "BOX"
    CHARGER = "CHARGER"
    EARPHONES = "EARPHONES"
    CABLE = "CABLE"
    AIRPODS = "AIRPODS"
    OTHER = "OTHER"

class AccessoryStatusEnum(str, Enum):
    WITH_DEVICE = "WITH_DEVICE"
    IN_SHOP = "IN_SHOP"
    PENDING_VENDOR = "PENDING_VENDOR"
    PENDING_CUSTOMER = "PENDING_CUSTOMER"
    DELIVERED = "DELIVERED"

class TransactionTypeEnum(str, Enum):
    SALE = "SALE"
    PURCHASE = "PURCHASE"
    PAYMENT_IN = "PAYMENT_IN"
    PAYMENT_OUT = "PAYMENT_OUT"
    TRADE_IN = "TRADE_IN"
    RETURN_OUT = "RETURN_OUT"
    EXCHANGE = "EXCHANGE"

class PartyTypeEnum(str, Enum):
    CUSTOMER = "CUSTOMER"
    SUPPLIER = "SUPPLIER"

class NotificationTypeEnum(str, Enum):
    PAYMENT_REMINDER = "PAYMENT_REMINDER"
    ACCESSORY_PENDING = "ACCESSORY_PENDING"
    BALANCE_CLEAR = "BALANCE_CLEAR"
    OVERDUE_ALERT = "OVERDUE_ALERT"
    VENDOR_PAYMENT_DUE = "VENDOR_PAYMENT_DUE"

# ============================================================================
# BRAND SCHEMAS
# ============================================================================
class BrandBase(BaseModel):
    name: str
    logo_url: Optional[str] = None

class BrandCreate(BrandBase):
    pass

class BrandUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None

class Brand(BrandBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# MODEL SCHEMAS
# ============================================================================
class ModelBase(BaseModel):
    brand_id: int
    name: str
    storage_variants: Optional[str] = None
    color_variants: Optional[str] = None
    avg_market_price: Optional[float] = None

class ModelCreate(ModelBase):
    pass

class ModelUpdate(BaseModel):
    brand_id: Optional[int] = None
    name: Optional[str] = None
    storage_variants: Optional[str] = None
    color_variants: Optional[str] = None
    avg_market_price: Optional[float] = None

class Model(ModelBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# PARTY SCHEMAS (Customer & Supplier)
# ============================================================================
class PartyBase(BaseModel):
    name: str
    phone: str
    type: PartyTypeEnum
    cnic: Optional[str] = None
    address: Optional[str] = None
    is_active: bool = True

class PartyCreate(PartyBase):
    pass

class PartyUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    cnic: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None

class Party(PartyBase):
    id: int
    current_balance: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# MOBILE INVENTORY SCHEMAS
# ============================================================================
class MobileInventoryBase(BaseModel):
    model_id: int
    purchased_from: Optional[int] = None
    imei: Optional[str] = None
    storage: Optional[str] = None
    color: Optional[str] = None
    condition: ConditionEnum
    patch_details: Optional[dict] = None
    used_condition: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    status: MobileStatusEnum = MobileStatusEnum.IN_STOCK
    purchase_date: Optional[date] = None

class MobileInventoryCreate(MobileInventoryBase):
    pass

class MobileInventoryUpdate(BaseModel):
    imei: Optional[str] = None
    storage: Optional[str] = None
    color: Optional[str] = None
    condition: Optional[ConditionEnum] = None
    patch_details: Optional[dict] = None
    used_condition: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    status: Optional[MobileStatusEnum] = None

class MobileInventory(MobileInventoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# ACCESSORIES INVENTORY SCHEMAS
# ============================================================================
class AccessoriesInventoryBase(BaseModel):
    mobile_id: Optional[int] = None
    source_party_id: int
    type: AccessoryTypeEnum
    status: AccessoryStatusEnum = AccessoryStatusEnum.WITH_DEVICE
    expected_date: Optional[date] = None
    delivered_date: Optional[date] = None
    notes: Optional[str] = None

class AccessoriesInventoryCreate(AccessoriesInventoryBase):
    pass

class AccessoriesInventoryUpdate(BaseModel):
    status: Optional[AccessoryStatusEnum] = None
    expected_date: Optional[date] = None
    delivered_date: Optional[date] = None
    notes: Optional[str] = None

class AccessoriesInventory(AccessoriesInventoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# TRANSACTION SCHEMAS
# ============================================================================
class TransactionBase(BaseModel):
    party_id: int
    mobile_id: Optional[int] = None
    party_type: PartyTypeEnum
    transaction_type: TransactionTypeEnum
    quantity: int = 1
    unit_price: Optional[float] = None
    total_amount: float
    transaction_date: date
    notes: Optional[str] = None

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    notes: Optional[str] = None

class Transaction(TransactionBase):
    id: int
    balance_after: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# DEAL ACCESSORIES SCHEMAS
# ============================================================================
class DealAccessoryBase(BaseModel):
    transaction_id: int
    accessory_type: AccessoryTypeEnum
    included: str = "YES"
    pending_from: Optional[str] = None
    promised_date: Optional[date] = None
    delivered_date: Optional[date] = None

class DealAccessoryCreate(DealAccessoryBase):
    pass

class DealAccessoryUpdate(BaseModel):
    included: Optional[str] = None
    pending_from: Optional[str] = None
    promised_date: Optional[date] = None
    delivered_date: Optional[date] = None

class DealAccessory(DealAccessoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# NOTIFICATION SCHEMAS
# ============================================================================
class NotificationBase(BaseModel):
    party_id: int
    transaction_id: Optional[int] = None
    type: NotificationTypeEnum
    message_en: str
    message_ur: str
    scheduled_at: Optional[datetime] = None

class NotificationCreate(NotificationBase):
    pass

class NotificationUpdate(BaseModel):
    status: Optional[str] = None
    sent_at: Optional[datetime] = None

class Notification(NotificationBase):
    id: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# SUMMARY SCHEMAS (for reports and dashboards)
# ============================================================================
class DailySummary(BaseModel):
    date: date
    total_sales: float
    total_purchases: float
    cash_in: float
    cash_out: float
    profit: float

class CustomerLedger(BaseModel):
    customer_id: int
    customer_name: str
    phone: str
    total_purchased: float
    total_paid: float
    current_balance: float
    transactions: List[Transaction] = []

class SupplierLedger(BaseModel):
    supplier_id: int
    supplier_name: str
    phone: str
    total_purchased: float
    total_paid: float
    current_balance: float
    transactions: List[Transaction] = []

class InventoryStats(BaseModel):
    total_in_stock: int
    total_sold: int
    total_reserved: int
    total_trade_in: int
    by_brand: dict = {}
    by_condition: dict = {}
