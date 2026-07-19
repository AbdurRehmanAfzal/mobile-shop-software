"""Schema exports for the application."""

from app.schemas.schemas import (
    # Enums
    MobileConditionEnum,
    PTAStatusEnum,
    PartyTypeEnum,

    # Party schemas (Unified Customer/Supplier)
    PartyBase,
    PartyCreate,
    PartyUpdate,
    PartyResponse,

    # Customer schemas
    CustomerBase,
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerLedgerResponse,

    # Supplier schemas
    SupplierBase,
    SupplierCreate,
    SupplierUpdate,
    SupplierResponse,

    # Mobile Brand schemas
    MobileBrandBase,
    MobileBrandCreate,
    MobileBrandUpdate,
    MobileBrandResponse,

    # Mobile Model schemas
    MobileModelBase,
    MobileModelCreate,
    MobileModelUpdate,
    MobileModelResponse,

    # Mobile Inventory schemas
    MobileInventoryBase,
    MobileInventoryCreate,
    MobileInventoryUpdate,
    MobileInventoryResponse,

    # Accessory schemas
    AccessoryBase,
    AccessoryCreate,
    AccessoryUpdate,
    AccessoryResponse,

    # Purchase schemas
    PurchaseItemCreate,
    PurchaseCreate,
    PurchaseResponse,

    # Payment schemas
    PaymentCreate,
    PaymentResponse,

    # Exchange schemas
    ExchangeCreate,
    ExchangeResponse,

    # Reminder schemas
    ReminderCreate,
    ReminderResponse,

    # Transaction schemas
    TransactionCreate,
    TransactionResponse,

    # Dashboard schemas
    DashboardStats,

    # Quick Trade-In Request schema
    QuickTradeInRequest,
)

# Create aliases for backward compatibility
# These allow importing "Brand" instead of "MobileBrand" for response schemas
Brand = MobileBrandResponse
BrandCreate = MobileBrandCreate
BrandUpdate = MobileBrandUpdate

Model = MobileModelResponse
ModelCreate = MobileModelCreate
ModelUpdate = MobileModelUpdate

# Party alias pointing to PartyResponse
Party = PartyResponse

__all__ = [
    # Enums
    "MobileConditionEnum",
    "PTAStatusEnum",
    "PartyTypeEnum",

    # Party schemas (Unified)
    "PartyBase",
    "PartyCreate",
    "PartyUpdate",
    "PartyResponse",
    "Party",  # Alias

    # Customer schemas
    "CustomerBase",
    "CustomerCreate",
    "CustomerUpdate",
    "CustomerResponse",
    "CustomerLedgerResponse",

    # Supplier schemas
    "SupplierBase",
    "SupplierCreate",
    "SupplierUpdate",
    "SupplierResponse",

    # Mobile Brand schemas (with MobileBrand prefix)
    "MobileBrandBase",
    "MobileBrandCreate",
    "MobileBrandUpdate",
    "MobileBrandResponse",

    # Mobile Model schemas (with MobileModel prefix)
    "MobileModelBase",
    "MobileModelCreate",
    "MobileModelUpdate",
    "MobileModelResponse",

    # Backward compatibility aliases
    "Brand",
    "BrandCreate",
    "BrandUpdate",
    "Model",
    "ModelCreate",
    "ModelUpdate",

    # Mobile Inventory schemas
    "MobileInventoryBase",
    "MobileInventoryCreate",
    "MobileInventoryUpdate",
    "MobileInventoryResponse",

    # Accessory schemas
    "AccessoryBase",
    "AccessoryCreate",
    "AccessoryUpdate",
    "AccessoryResponse",

    # Purchase schemas
    "PurchaseItemCreate",
    "PurchaseCreate",
    "PurchaseResponse",

    # Payment schemas
    "PaymentCreate",
    "PaymentResponse",

    # Exchange schemas
    "ExchangeCreate",
    "ExchangeResponse",

    # Reminder schemas
    "ReminderCreate",
    "ReminderResponse",

    # Transaction schemas
    "TransactionCreate",
    "TransactionResponse",

    # Dashboard schemas
    "DashboardStats",

    # Quick Trade-In Request schema
    "QuickTradeInRequest",
]
