# Mobile Shop Management System — Installation & Setup Guide

## ✅ Step 1: Database Setup — COMPLETED

### What's been created:

#### 1. **Database Models** (`backend/app/models.py`)
All SQLite tables with proper relationships:
- `brands` — Mobile phone brands (Apple, Samsung, OnePlus, Vivo, Google Pixel)
- `models` — Phone models (iPhone 14, Galaxy S23, etc.)
- `parties` — Customers & Suppliers unified table
- `mobile_inventory` — Stock with condition tracking (BOX_PACK, PATCHED, USED)
- `accessories_inventory` — Separate tracking for Box, Charger, Earphones, etc.
- `transactions` — All transaction types (SALE, PURCHASE, PAYMENT_IN, PAYMENT_OUT, TRADE_IN, RETURN_OUT, EXCHANGE)
- `deal_accessories` — Accessories included/pending per transaction
- `notifications` — WhatsApp/SMS notifications (bilingual)

#### 2. **Pydantic Schemas** (`backend/app/schemas.py`)
Complete request/response models for all entities with:
- Proper enums for all status fields
- Type hints and validations
- Config for SQLAlchemy integration

#### 3. **Database Configuration** (`backend/app/database.py`)
- SQLite engine setup
- Session management
- Table initialization functions
- Reset/drop utilities for development

#### 4. **Initial Data** (`backend/app/utils/seed_data.py`)
Pre-loaded with:
- 5 brands: Apple, Samsung, OnePlus, Vivo, Google Pixel
- 17 popular phone models with realistic Pakistani prices
- Auto-seeded on app startup

#### 5. **FastAPI Application** (`backend/main.py`)
- Health check endpoints
- CORS enabled for frontend development
- Automatic database initialization on startup
- Auto-seed data on first run

### Project Structure:
```
backend/
├── main.py                 # FastAPI app entry point
├── requirements.txt        # Python dependencies
├── config/
│   ├── settings.py         # App configuration
│   └── .env.example        # Environment template
├── app/
│   ├── __init__.py
│   ├── models.py           # SQLAlchemy models (8 tables)
│   ├── schemas.py          # Pydantic schemas
│   ├── database.py         # SQLite connection & init
│   ├── utils/
│   │   ├── __init__.py
│   │   └── seed_data.py    # Initial brands & models
│   ├── routes/             # (To be created: API endpoints)
│   ├── services/           # (To be created: Business logic)
│   └── config/             # Configuration files
└── tests/                  # (To be created: Unit tests)
```

---

## 🚀 How to Run the Backend

### Prerequisites
- Python 3.8+
- pip (Python package manager)

### Step 1: Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Step 2: Create Environment File
```bash
cp config/.env.example .env
```
Edit `.env` with your shop details and optional Twilio credentials.

### Step 3: Run the Backend
```bash
cd ..
uvicorn main:app --reload
```

Backend will start at: **http://localhost:8000**

### First Run Output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
✓ Database tables created successfully!
✓ Added 5 brands
✓ Added 17 models
🚀 Mobile Shop Management System started!
📱 Shop: Mobile Shop
📍 City: Lahore
📞 Phone: +92XXXXXXXXX
```

### API Endpoints Available Now:
- `GET /` — System status
- `GET /health` — Health check

---

## 📱 Database Schema Overview

### Balance Calculation Logic (Critical!)

#### **Customer** (Receivable — Hamein Milna Hai)
```
current_balance = SALE amount - TRADE_IN received - PAYMENT_IN received
- Positive = customer owes us
- Zero = account cleared ✅
```

Example:
- Ahmed buys iPhone for Rs. 50,000 → balance +50,000
- Pays Rs. 30,000 → balance +20,000
- Pays Rs. 20,000 → balance 0 ✅

#### **Supplier** (Payable — Humein Dena Hai)
```
current_balance = PURCHASE amount - RETURN_OUT - PAYMENT_OUT
- Positive = we owe supplier
- Zero = account cleared ✅
```

Example:
- Buy 5 iPhones for Rs. 2,50,000 → balance +2,50,000
- Pay Rs. 1,50,000 → balance +1,00,000
- Pay remaining → balance 0 ✅

---

## 🎯 Transaction Types Supported

| Type | From | To | Effect |
|------|------|-----|--------|
| SALE | Inventory | Customer | Customer balance +amount |
| PURCHASE | Supplier | Inventory | Supplier balance +amount |
| PAYMENT_IN | Customer | Shop | Customer balance -amount |
| PAYMENT_OUT | Shop | Supplier | Supplier balance -amount |
| TRADE_IN | Customer | Inventory | Customer balance -trade_in_value |
| RETURN_OUT | Inventory | Supplier | Supplier balance -amount |
| EXCHANGE | (Composite) | (Composite) | See SCENARIO 2 in CLAUDE.md |

---

## 📊 Database Schema Details

### Brands Table
```sql
id (PK) | name | logo_url | created_at
1       | Apple | ... | 2024-01-01
2       | Samsung | ... | 2024-01-01
```

### Parties Table (Customers & Suppliers)
```sql
id (PK) | name | phone | type | current_balance | is_active | created_at
1       | Ahmed Khan | 03001234567 | CUSTOMER | 20000 | true | 2024-01-01
2       | Rehman Traders | 03009876543 | SUPPLIER | 100000 | true | 2024-01-01
```

### Mobile Inventory
```sql
id | model_id | purchased_from | imei | storage | color | 
condition | patch_details | cost_price | selling_price | status
1  | 5        | 2             | 123... | 256GB  | Black | 
BOX_PACK | null | 75000 | 130000 | IN_STOCK
```

### Accessories Inventory
```sql
id | mobile_id | source_party_id | type | status | expected_date | delivered_date
1  | 1         | 2              | BOX  | WITH_DEVICE | null | null
2  | null      | 2              | CHARGER | PENDING_VENDOR | 2024-02-01 | null
```

### Transactions
```sql
id | party_id | mobile_id | party_type | transaction_type | 
quantity | total_amount | balance_after | transaction_date
1  | 1        | 1        | CUSTOMER   | SALE | 
1        | 130000      | 130000        | 2024-01-15
```

---

## ✨ Features Implemented

✅ Database schema with all 8 tables
✅ SQLAlchemy ORM models
✅ Pydantic validation schemas
✅ SQLite with offline-first design
✅ Proper foreign key relationships
✅ Check constraints for data integrity
✅ Auto-timestamp fields
✅ Seed data with 5 brands, 17 models
✅ CORS enabled for frontend
✅ Settings from environment variables

---

## 🔧 Next Steps (Priority Order from CLAUDE.md)

2. FastAPI backend — CRUD routes for parties & inventory
3. React frontend — BilingualLabel component
4. Dashboard screen
5. Add Mobile flow
6. Sale flow (step by step)
7. Purchase flow
8. Payment In / Payment Out
9. Customer & Supplier ledger
10. Exchange/upgrade flow
11. Accessories tracking
12. Reports
13. Notifications (WhatsApp/SMS)
14. Pending items tracker

---

## 🗄️ Database File Location

SQLite database is stored at: `backend/shop.db`

To reset database (development only):
```python
from app.database import reset_db
reset_db()
```

---

## 📝 Environment Variables (.env)

```
# Database
DATABASE_URL=sqlite:///./shop.db

# API
API_HOST=0.0.0.0
API_PORT=8000
API_DEBUG=True

# Twilio SMS/WhatsApp (optional for now)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Shop Settings
SHOP_NAME=Your Shop Name
SHOP_CITY=Your City
SHOP_PHONE=+92XXXXXXXXX
SHOP_EMAIL=shop@example.com
```

---

## 🎓 Database Tables At A Glance

```
brands (5)
├─ Apple
├─ Samsung
├─ OnePlus
├─ Vivo
└─ Google Pixel

models (17)
├─ iPhone 14, 14 Pro, 15, 13 (Apple)
├─ Galaxy A54, A74, S23, S24 (Samsung)
├─ Nord 2, Nord 3, 12 (OnePlus)
├─ V25, V27, X90 (Vivo)
└─ Pixel 7, Pixel 8 (Google)

parties (customer + supplier unified)
├─ type: CUSTOMER or SUPPLIER
└─ current_balance auto-calculated

mobile_inventory
├─ status: IN_STOCK | SOLD | RESERVED | TRADE_IN
├─ condition: BOX_PACK | PATCHED | USED
└─ patch_details: JSON (for PATCHED phones)

accessories_inventory
├─ type: BOX | CHARGER | EARPHONES | CABLE | AIRPODS | OTHER
└─ status: WITH_DEVICE | IN_SHOP | PENDING_VENDOR | PENDING_CUSTOMER | DELIVERED

transactions (all transaction types)
├─ party_type: CUSTOMER or SUPPLIER
├─ transaction_type: SALE | PURCHASE | PAYMENT_IN | PAYMENT_OUT | TRADE_IN | RETURN_OUT | EXCHANGE
└─ balance_after: auto-calculated

deal_accessories (accessories per transaction)
├─ included: YES | NO | PENDING
└─ pending_from: VENDOR or SHOP

notifications (WhatsApp/SMS, bilingual)
├─ type: PAYMENT_REMINDER | ACCESSORY_PENDING | BALANCE_CLEAR | OVERDUE_ALERT | VENDOR_PAYMENT_DUE
├─ message_en: English message
├─ message_ur: Urdu message (اردو)
└─ status: PENDING | SENT | FAILED
```

---

## ✅ Database Implementation Checklist

- [x] SQLite database engine setup
- [x] 8 tables with proper relationships
- [x] Foreign key constraints
- [x] Check constraints for data integrity
- [x] Auto-timestamp fields (created_at, updated_at)
- [x] Index on frequently queried fields (phone, imei)
- [x] JSON field for patch details
- [x] Bilingual notification support (EN + UR)
- [x] Pydantic schemas for validation
- [x] Seed data with 5 brands & 17 models
- [x] Configuration from environment
- [x] CORS enabled for frontend

**Database setup is 100% complete! Ready for API routes development.**

