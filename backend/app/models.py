from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text, Boolean, JSON, ForeignKey, CheckConstraint
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, date

Base = declarative_base()

# ============================================================================
# BRANDS TABLE
# ============================================================================
class Brand(Base):
    __tablename__ = "brands"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    logo_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<Brand {self.name}>"

# ============================================================================
# MODELS TABLE
# ============================================================================
class Model(Base):
    __tablename__ = "models"
    
    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False)
    name = Column(String, nullable=False)  # iPhone 14 Pro
    storage_variants = Column(String, nullable=True)  # 128GB,256GB,512GB
    color_variants = Column(String, nullable=True)  # Black,White,Gold
    avg_market_price = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<Model {self.name}>"

# ============================================================================
# PARTIES TABLE (Customers & Suppliers)
# ============================================================================
class Party(Base):
    __tablename__ = "parties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    cnic = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    type = Column(String, nullable=False)  # CUSTOMER or VENDOR
    current_balance = Column(Float, default=0.0)
    # CUSTOMER: positive = they owe us
    # VENDOR: positive = we owe them
    is_active = Column(Boolean, default=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint("type IN ('CUSTOMER', 'VENDOR', 'TRADE_IN')"),
    )
    
    def __repr__(self):
        return f"<Party {self.name} ({self.type})>"

# ============================================================================
# MOBILE INVENTORY TABLE
# ============================================================================
class MobileInventory(Base):
    __tablename__ = "mobile_inventory"

    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(Integer, ForeignKey("models.id"), nullable=False)
    purchased_from = Column(Integer, ForeignKey("parties.id"), nullable=True)  # supplier ID
    imei = Column(String, unique=True, nullable=True, index=True)
    storage = Column(String, nullable=True)  # 128GB, 256GB
    color = Column(String, nullable=True)  # Midnight Black
    condition = Column(String, nullable=False)  # BOX_PACK, PATCHED, USED
    patch_details = Column(JSON, nullable=True)  # {"screen":true,"battery":false,"back":true}
    used_condition = Column(String, nullable=True)  # GOOD, AVERAGE, POOR
    cost_price = Column(Float, nullable=True)
    selling_price = Column(Float, nullable=True)
    status = Column(String, default="IN_STOCK")  # IN_STOCK, SOLD, RESERVED, TRADE_IN
    purchase_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint("condition IN ('BOX_PACK', 'PATCHED', 'USED')"),
        CheckConstraint("used_condition IS NULL OR used_condition IN ('GOOD', 'AVERAGE', 'POOR')"),
        CheckConstraint("status IN ('IN_STOCK', 'SOLD', 'RESERVED', 'TRADE_IN')"),
    )

    def __repr__(self):
        return f"<MobileInventory {self.id} - {self.condition}>"

# ============================================================================
# ACCESSORIES INVENTORY TABLE
# ============================================================================
class AccessoriesInventory(Base):
    __tablename__ = "accessories_inventory"
    
    id = Column(Integer, primary_key=True, index=True)
    mobile_id = Column(Integer, ForeignKey("mobile_inventory.id"), nullable=True)
    source_party_id = Column(Integer, ForeignKey("parties.id"), nullable=False)  # vendor
    type = Column(String, nullable=False)  # BOX, CHARGER, EARPHONES, CABLE, AIRPODS, OTHER
    status = Column(String, default="WITH_DEVICE")  # WITH_DEVICE, IN_SHOP, PENDING_VENDOR, PENDING_CUSTOMER, DELIVERED
    expected_date = Column(Date, nullable=True)  # kab milegi (if pending from vendor)
    delivered_date = Column(Date, nullable=True)  # kab mili / di
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint("type IN ('BOX', 'CHARGER', 'EARPHONES', 'CABLE', 'AIRPODS', 'OTHER')"),
        CheckConstraint("status IN ('WITH_DEVICE', 'IN_SHOP', 'PENDING_VENDOR', 'PENDING_CUSTOMER', 'DELIVERED')"),
    )
    
    def __repr__(self):
        return f"<AccessoriesInventory {self.type} - {self.status}>"

# ============================================================================
# TRANSACTIONS TABLE
# ============================================================================
class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=False)
    mobile_id = Column(Integer, ForeignKey("mobile_inventory.id"), nullable=True)
    party_type = Column(String, nullable=False)  # CUSTOMER or SUPPLIER
    transaction_type = Column(String, nullable=False)  # SALE, PURCHASE, PAYMENT_IN, PAYMENT_OUT, TRADE_IN, RETURN_OUT, EXCHANGE
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, nullable=True)
    total_amount = Column(Float, nullable=False)
    amount_received = Column(Float, nullable=True)  # Amount actually received/paid (for partial payments)
    payment_method = Column(String, nullable=True)  # cash, cheque, transfer, card
    balance_after = Column(Float, nullable=False)  # auto-calculated after transaction
    transaction_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint("party_type IN ('CUSTOMER', 'SUPPLIER')"),
        CheckConstraint("transaction_type IN ('SALE', 'PURCHASE', 'PAYMENT_IN', 'PAYMENT_OUT', 'TRADE_IN', 'RETURN_OUT', 'EXCHANGE')"),
    )
    
    def __repr__(self):
        return f"<Transaction {self.transaction_type} - Rs.{self.total_amount}>"

# ============================================================================
# DEAL ACCESSORIES TABLE
# ============================================================================
class DealAccessory(Base):
    __tablename__ = "deal_accessories"
    
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    accessory_type = Column(String, nullable=False)  # BOX, CHARGER, EARPHONES, CABLE, AIRPODS, OTHER
    included = Column(String, default="YES")  # YES, NO, PENDING
    pending_from = Column(String, nullable=True)  # VENDOR, SHOP
    promised_date = Column(Date, nullable=True)
    delivered_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint("accessory_type IN ('BOX', 'CHARGER', 'EARPHONES', 'CABLE', 'AIRPODS', 'OTHER')"),
        CheckConstraint("included IN ('YES', 'NO', 'PENDING')"),
        CheckConstraint("pending_from IS NULL OR pending_from IN ('VENDOR', 'SHOP')"),
    )
    
    def __repr__(self):
        return f"<DealAccessory {self.accessory_type} - {self.included}>"

# ============================================================================
# NOTIFICATIONS TABLE
# ============================================================================
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    type = Column(String, nullable=False)  # PAYMENT_REMINDER, ACCESSORY_PENDING, BALANCE_CLEAR, OVERDUE_ALERT, VENDOR_PAYMENT_DUE
    message_en = Column(Text, nullable=False)
    message_ur = Column(Text, nullable=False)
    status = Column(String, default="PENDING")  # PENDING, SENT, FAILED
    scheduled_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint("type IN ('PAYMENT_REMINDER', 'ACCESSORY_PENDING', 'BALANCE_CLEAR', 'OVERDUE_ALERT', 'VENDOR_PAYMENT_DUE')"),
        CheckConstraint("status IN ('PENDING', 'SENT', 'FAILED')"),
    )

    def __repr__(self):
        return f"<Notification {self.type} - {self.status}>"

# ============================================================================
# MOBILE STORAGE OPTIONS TABLE
# ============================================================================
class MobileStorage(Base):
    __tablename__ = "mobile_storage"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # 16GB, 32GB, 64GB, 128GB, 256GB, 512GB, 1TB, 2TB, 4TB
    name_urdu = Column(String, nullable=True)  # اردو میں نام
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<MobileStorage {self.name}>"

# ============================================================================
# MOBILE COLOR OPTIONS TABLE
# ============================================================================
class MobileColor(Base):
    __tablename__ = "mobile_color"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # Black, White, Gold, Silver, etc.
    name_urdu = Column(String, nullable=True)  # اردو میں نام
    hex_code = Column(String, nullable=True)  # #000000 for color picker
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<MobileColor {self.name}>"
