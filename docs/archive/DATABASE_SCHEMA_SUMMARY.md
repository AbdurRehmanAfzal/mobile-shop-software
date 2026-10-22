# Database Schema — Complete Overview

## Architecture Overview

The Mobile Shop Management System uses **SQLite** for offline-first design with proper relationships and constraints.

```
┌─────────────────────────────────────────────────┐
│        MOBILE SHOP MANAGEMENT SYSTEM            │
│                   DATABASE                      │
└─────────────────────────────────────────────────┘

                    MASTER DATA
                        ↓
        ┌───────────────────────────────┐
        │   brands (5 brands)           │
        │   ├─ id (PK)                  │
        │   ├─ name (unique)            │
        │   └─ logo_url                 │
        └───────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │   models (17 models)          │
        │   ├─ id (PK)                  │
        │   ├─ brand_id (FK)            │
        │   ├─ name                     │
        │   ├─ storage_variants         │
        │   ├─ color_variants           │
        │   └─ avg_market_price         │
        └───────────────────────────────┘


                OPERATIONAL DATA
                        ↓
        ┌───────────────────────────────┐
        │   parties (unified)           │
        │   ├─ id (PK)                  │
        │   ├─ name                     │
        │   ├─ phone (unique, indexed)  │
        │   ├─ type (CUSTOMER/SUPPLIER) │
        │   └─ current_balance          │
        └───────────────────────────────┘
                ↙               ↘
    CUSTOMERS              SUPPLIERS


        ┌─────────────────────────────────┐
        │   mobile_inventory              │
        │   ├─ id (PK)                    │
        │   ├─ model_id (FK)              │
        │   ├─ purchased_from (FK)        │
        │   ├─ imei (unique, indexed)     │
        │   ├─ condition (enum)           │
        │   │   ├─ BOX_PACK               │
        │   │   ├─ PATCHED                │
        │   │   └─ USED                   │
        │   ├─ patch_details (JSON)       │
        │   ├─ cost_price                 │
        │   ├─ selling_price              │
        │   └─ status (enum)              │
        │       ├─ IN_STOCK               │
        │       ├─ SOLD                   │
        │       ├─ RESERVED               │
        │       └─ TRADE_IN               │
        └─────────────────────────────────┘
                        ↓
        ┌─────────────────────────────────┐
        │   accessories_inventory         │
        │   ├─ id (PK)                    │
        │   ├─ mobile_id (FK, nullable)   │
        │   ├─ source_party_id (FK)       │
        │   ├─ type (enum)                │
        │   │   ├─ BOX                    │
        │   │   ├─ CHARGER                │
        │   │   ├─ EARPHONES              │
        │   │   ├─ CABLE                  │
        │   │   ├─ AIRPODS                │
        │   │   └─ OTHER                  │
        │   ├─ status (enum)              │
        │   │   ├─ WITH_DEVICE            │
        │   │   ├─ IN_SHOP                │
        │   │   ├─ PENDING_VENDOR         │
        │   │   ├─ PENDING_CUSTOMER       │
        │   │   └─ DELIVERED              │
        │   ├─ expected_date              │
        │   └─ delivered_date             │
        └─────────────────────────────────┘


        ┌──────────────────────────────────┐
        │   transactions                   │
        │   ├─ id (PK)                     │
        │   ├─ party_id (FK)               │
        │   ├─ mobile_id (FK, nullable)    │
        │   ├─ party_type (enum)           │
        │   │   ├─ CUSTOMER                │
        │   │   └─ SUPPLIER                │
        │   ├─ transaction_type (enum)     │
        │   │   ├─ SALE                    │
        │   │   ├─ PURCHASE                │
        │   │   ├─ PAYMENT_IN              │
        │   │   ├─ PAYMENT_OUT             │
        │   │   ├─ TRADE_IN                │
        │   │   ├─ RETURN_OUT              │
        │   │   └─ EXCHANGE                │
        │   ├─ quantity                    │
        │   ├─ unit_price                  │
        │   ├─ total_amount                │
        │   ├─ balance_after               │
        │   ├─ transaction_date            │
        │   └─ notes                       │
        └──────────────────────────────────┘
                        ↓
        ┌──────────────────────────────────┐
        │   deal_accessories               │
        │   ├─ id (PK)                     │
        │   ├─ transaction_id (FK)         │
        │   ├─ accessory_type (enum)       │
        │   ├─ included (YES/NO/PENDING)   │
        │   ├─ pending_from (VENDOR/SHOP)  │
        │   ├─ promised_date               │
        │   └─ delivered_date              │
        └──────────────────────────────────┘


        ┌──────────────────────────────────┐
        │   notifications (Bilingual)      │
        │   ├─ id (PK)                     │
        │   ├─ party_id (FK)               │
        │   ├─ transaction_id (FK)         │
        │   ├─ type (enum)                 │
        │   │   ├─ PAYMENT_REMINDER        │
        │   │   ├─ ACCESSORY_PENDING       │
        │   │   ├─ BALANCE_CLEAR           │
        │   │   ├─ OVERDUE_ALERT           │
        │   │   └─ VENDOR_PAYMENT_DUE      │
        │   ├─ message_en                  │
        │   ├─ message_ur (اردو)           │
        │   ├─ status                      │
        │   └─ sent_at                     │
        └──────────────────────────────────┘
```

---

## Table Details

### 1. BRANDS TABLE
**Purpose**: Store mobile phone brands

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| name | TEXT | UNIQUE, NOT NULL | Apple, Samsung, OnePlus, Vivo, Google Pixel |
| logo_url | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Seed Data (5 rows)**:
- Apple
- Samsung
- OnePlus
- Vivo
- Google Pixel

---

### 2. MODELS TABLE
**Purpose**: Store phone models per brand

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| brand_id | INTEGER | FOREIGN KEY brands(id), NOT NULL | |
| name | TEXT | NOT NULL | e.g., "iPhone 14 Pro" |
| storage_variants | TEXT | | Comma-separated: "128GB,256GB,512GB" |
| color_variants | TEXT | | Comma-separated: "Black,White,Gold" |
| avg_market_price | REAL | | Pakistani Rupees |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Seed Data (17 rows)**:
- Apple: iPhone 13, 14, 14 Pro, 15
- Samsung: Galaxy A54, A74, S23, S24
- OnePlus: Nord 2, Nord 3, 12
- Vivo: V25, V27, X90
- Google Pixel: Pixel 7, 8

---

### 3. PARTIES TABLE
**Purpose**: Unified customer and supplier management

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| name | TEXT | NOT NULL | Customer or Supplier name |
| phone | TEXT | UNIQUE, NOT NULL, INDEXED | Pakistan number format |
| cnic | TEXT | | National ID |
| address | TEXT | | |
| type | TEXT | CHECK(type IN ('CUSTOMER', 'SUPPLIER')) | |
| current_balance | REAL | DEFAULT 0 | Auto-calculated |
| is_active | BOOLEAN | DEFAULT True | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Auto-update |

**Balance Logic**:
- **CUSTOMER**: Positive = owes us, Negative = we owe them (rare)
- **SUPPLIER**: Positive = we owe them, Negative = they owe us (rare)

---

### 4. MOBILE_INVENTORY TABLE
**Purpose**: Track individual devices in stock

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| model_id | INTEGER | FOREIGN KEY models(id), NOT NULL | |
| purchased_from | INTEGER | FOREIGN KEY parties(id) | Supplier ID |
| imei | TEXT | UNIQUE, INDEXED | Device serial |
| storage | TEXT | | "128GB", "256GB", "512GB" |
| color | TEXT | | "Midnight Black", "Gold", etc. |
| condition | TEXT | CHECK(condition IN ('BOX_PACK', 'PATCHED', 'USED')), NOT NULL | |
| patch_details | JSON | | {"screen":true, "battery":false, "back":true} |
| used_condition | TEXT | CHECK(used_condition IN ('GOOD', 'AVERAGE', 'POOR')) | For USED phones |
| cost_price | REAL | | Purchase price in PKR |
| selling_price | REAL | | Sale price in PKR |
| status | TEXT | CHECK(status IN ('IN_STOCK', 'SOLD', 'RESERVED', 'TRADE_IN')) | |
| purchase_date | DATE | | Date acquired |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Auto-update |

**Condition Breakdown**:
- **BOX_PACK**: Brand new, sealed
- **PATCHED**: Refurbished (details in JSON)
  - Possible patches: Screen, Battery, Back Panel, Face ID, Camera, Other
- **USED**: Second-hand with sub-condition (GOOD/AVERAGE/POOR)

---

### 5. ACCESSORIES_INVENTORY TABLE
**Purpose**: Track accessories separately from mobiles

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| mobile_id | INTEGER | FOREIGN KEY mobile_inventory(id), NULLABLE | Which device it came with |
| source_party_id | INTEGER | FOREIGN KEY parties(id), NOT NULL | Vendor |
| type | TEXT | CHECK(type IN ('BOX', 'CHARGER', 'EARPHONES', 'CABLE', 'AIRPODS', 'OTHER')), NOT NULL | |
| status | TEXT | CHECK(status IN ('WITH_DEVICE', 'IN_SHOP', 'PENDING_VENDOR', 'PENDING_CUSTOMER', 'DELIVERED')) | |
| expected_date | DATE | | When vendor will deliver (if pending) |
| delivered_date | DATE | | When actually received/delivered |
| notes | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Auto-update |

**Status Meanings**:
- **WITH_DEVICE**: Came with the phone, still with device
- **IN_SHOP**: Removed from device, stored in shop
- **PENDING_VENDOR**: Vendor promised to deliver later
- **PENDING_CUSTOMER**: Customer promised to pick later
- **DELIVERED**: Delivered to customer

---

### 6. TRANSACTIONS TABLE
**Purpose**: Record all financial transactions

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| party_id | INTEGER | FOREIGN KEY parties(id), NOT NULL | Customer or Supplier |
| mobile_id | INTEGER | FOREIGN KEY mobile_inventory(id), NULLABLE | Device sold/traded (nullable for payments) |
| party_type | TEXT | CHECK(party_type IN ('CUSTOMER', 'SUPPLIER')), NOT NULL | |
| transaction_type | TEXT | CHECK(transaction_type IN ('SALE', 'PURCHASE', 'PAYMENT_IN', 'PAYMENT_OUT', 'TRADE_IN', 'RETURN_OUT', 'EXCHANGE')), NOT NULL | |
| quantity | INTEGER | DEFAULT 1 | Units transacted |
| unit_price | REAL | | Price per unit |
| total_amount | REAL | NOT NULL | Total in PKR |
| balance_after | REAL | NOT NULL | Party's balance after this transaction |
| transaction_date | DATE | NOT NULL | |
| notes | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Auto-update |

**Transaction Types**:
- **SALE**: Sold device to customer
- **PURCHASE**: Bought device from supplier
- **PAYMENT_IN**: Customer paid us
- **PAYMENT_OUT**: We paid supplier
- **TRADE_IN**: Received device from customer (exchange)
- **RETURN_OUT**: Returned device to supplier
- **EXCHANGE**: Composite transaction (See CLAUDE.md Scenario 2)

---

### 7. DEAL_ACCESSORIES TABLE
**Purpose**: Track which accessories included in each transaction

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| transaction_id | INTEGER | FOREIGN KEY transactions(id), NOT NULL | |
| accessory_type | TEXT | CHECK(accessory_type IN ('BOX', 'CHARGER', 'EARPHONES', 'CABLE', 'AIRPODS', 'OTHER')), NOT NULL | |
| included | TEXT | CHECK(included IN ('YES', 'NO', 'PENDING')) | |
| pending_from | TEXT | CHECK(pending_from IN ('VENDOR', 'SHOP')), NULLABLE | Who will deliver |
| promised_date | DATE | | Expected delivery |
| delivered_date | DATE | | Actual delivery |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Auto-update |

**Use Case Example**:
- Transaction: Sold iPhone 14 to Ahmed
- Box: YES
- Charger: PENDING from VENDOR (expected 2024-02-01)
- Earphones: NO (customer didn't want)

---

### 8. NOTIFICATIONS TABLE
**Purpose**: Store SMS/WhatsApp messages (bilingual)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| party_id | INTEGER | FOREIGN KEY parties(id), NOT NULL | Customer/Supplier |
| transaction_id | INTEGER | FOREIGN KEY transactions(id), NULLABLE | Related transaction |
| type | TEXT | CHECK(type IN ('PAYMENT_REMINDER', 'ACCESSORY_PENDING', 'BALANCE_CLEAR', 'OVERDUE_ALERT', 'VENDOR_PAYMENT_DUE')), NOT NULL | |
| message_en | TEXT | NOT NULL | English message |
| message_ur | TEXT | NOT NULL | Urdu message (اردو) |
| status | TEXT | CHECK(status IN ('PENDING', 'SENT', 'FAILED')), DEFAULT 'PENDING' | |
| scheduled_at | DATETIME | | When to send |
| sent_at | DATETIME | | When actually sent |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Notification Types**:
1. **PAYMENT_REMINDER**: "Dear {name}, Rs. {amount} payment is due today."
2. **ACCESSORY_PENDING**: "Your {item} for {mobile} is ready."
3. **BALANCE_CLEAR**: "Your account is now clear. Thank you! 🎉"
4. **OVERDUE_ALERT**: "Your Rs. {amount} payment is {days} days overdue."
5. **VENDOR_PAYMENT_DUE**: "Rs. {amount} is due to {vendor} today."

---

## Key Features

### ✅ Relational Integrity
- All foreign keys enforced
- Cascade delete possible (future)
- Data consistency guaranteed

### ✅ Data Validation
- CHECK constraints on enum fields
- UNIQUE constraints on identifiers
- NOT NULL constraints on required fields
- SQLAlchemy ORM validation

### ✅ Performance
- Indexes on frequently queried fields:
  - `parties.phone` (UNIQUE INDEX)
  - `mobile_inventory.imei` (UNIQUE INDEX)
- Proper primary keys
- Optimal data types

### ✅ Business Logic Support
- Handles complex scenarios (exchange, trade-in)
- Separate accessories tracking
- Bilingual notifications
- JSON fields for flexible data

### ✅ Offline-First
- SQLite local database
- No internet dependency
- Fast queries
- Easy to backup

---

## Balance Calculation Formulas

### Customer Receivable Balance
```
balance = sum(SALE) - sum(TRADE_IN) - sum(PAYMENT_IN)

Example:
- Sold iPhone: +130,000
- Customer paid: -50,000
- Customer paid: -30,000
- Trade-in received: -20,000
- Balance: 30,000 (customer owes us)
```

### Supplier Payable Balance
```
balance = sum(PURCHASE) - sum(RETURN_OUT) - sum(PAYMENT_OUT)

Example:
- Bought 5 phones: +250,000
- Returned 2 phones: -90,000
- Paid supplier: -100,000
- Balance: 60,000 (we owe supplier)
```

---

## SQL for Common Queries

### Get customer balance
```sql
SELECT current_balance FROM parties 
WHERE id = ? AND type = 'CUSTOMER'
```

### Get all pending accessories
```sql
SELECT * FROM accessories_inventory 
WHERE status IN ('PENDING_VENDOR', 'PENDING_CUSTOMER')
ORDER BY expected_date, delivered_date
```

### Get transactions for customer
```sql
SELECT t.* FROM transactions t
WHERE t.party_id = ? AND t.party_type = 'CUSTOMER'
ORDER BY t.transaction_date DESC
```

### Get stock by brand and condition
```sql
SELECT m.name, COUNT(*) as count, mi.condition
FROM mobile_inventory mi
JOIN models m ON mi.model_id = m.id
WHERE mi.status = 'IN_STOCK'
GROUP BY m.name, mi.condition
```

---

## Total Records at Launch

| Table | Records | Notes |
|-------|---------|-------|
| brands | 5 | Pre-seeded |
| models | 17 | Pre-seeded |
| parties | 0 | To be added |
| mobile_inventory | 0 | To be added |
| accessories_inventory | 0 | To be added |
| transactions | 0 | To be added |
| deal_accessories | 0 | To be added |
| notifications | 0 | Generated as needed |

---

## Implementation Status

✅ Schema designed
✅ SQLAlchemy models created
✅ Pydantic schemas created
✅ Database initialization functions
✅ Seed data with brands & models
✅ CORS configured
✅ Environment configuration

⏳ API routes (Next Step)
⏳ Business logic services
⏳ Frontend integration
