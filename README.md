# Mobile Shop Management System 📱

A complete bilingual (English + Urdu RTL) mobile phone shop management system for Pakistani mobile shops. Offline-first design for non-technical shopkeepers.

## ✅ Step 1: Database Setup — COMPLETED

### What's Been Built

```
DATABASE SCHEMA: 8 TABLES
├── brands (5)
├── models (17)
├── parties (customers & suppliers)
├── mobile_inventory
├── accessories_inventory
├── transactions
├── deal_accessories
└── notifications (bilingual)

FEATURES:
✅ SQLite offline-first design
✅ Proper foreign key relationships
✅ Data validation with Pydantic
✅ Balance auto-calculation
✅ Bilingual notification support (EN + اردو)
✅ Pre-loaded with 5 brands & 17 models
✅ Complete FastAPI application setup
```

### Quick Start

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt
cd ..

# 2. Run backend
uvicorn main:app --reload

# Expected output:
# ✓ Database tables created successfully!
# ✓ Added 5 brands
# ✓ Added 17 models
# 🚀 Mobile Shop Management System started!
```

### Project Structure

```
mobile-shop-system/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── requirements.txt         # Dependencies
│   ├── .env                     # Configuration
│   ├── config/
│   │   ├── settings.py          # App config
│   │   └── .env.example         # Template
│   └── app/
│       ├── models.py            # 8 SQLAlchemy models
│       ├── schemas.py           # Pydantic validation
│       ├── database.py          # SQLite setup
│       ├── utils/
│       │   └── seed_data.py     # Initial data
│       ├── routes/              # (Next: API endpoints)
│       └── services/            # (Next: Business logic)
│
├── frontend/                   # (React app - next)
├── claude.md                   # Project specification
├── SETUP.md                    # Installation guide
├── DATABASE_SCHEMA_SUMMARY.md  # Schema details
├── STEP1_COMPLETE.md           # Completion checklist
└── README.md                   # This file
```

---

## Database Schema Overview

### Master Data (Pre-loaded)

#### brands (5 rows)
- Apple
- Samsung
- OnePlus
- Vivo
- Google Pixel

#### models (17 rows)
- **Apple:** iPhone 13, 14, 14 Pro, 15
- **Samsung:** Galaxy A54, A74, S23, S24
- **OnePlus:** Nord 2, Nord 3, 12
- **Vivo:** V25, V27, X90
- **Google Pixel:** Pixel 7, 8

### Party Management

#### parties
- Unified customer & supplier table
- Auto-calculated balance
- Contact info: phone, CNIC, address
- Status tracking

### Inventory

#### mobile_inventory
- Condition: BOX_PACK, PATCHED, USED
- Status: IN_STOCK, SOLD, RESERVED, TRADE_IN
- IMEI, storage, color tracking
- Cost & selling price
- Patch details (for refurbished)

#### accessories_inventory
- Types: BOX, CHARGER, EARPHONES, CABLE, AIRPODS, OTHER
- Status: WITH_DEVICE, IN_SHOP, PENDING_VENDOR, PENDING_CUSTOMER, DELIVERED
- Vendor & delivery tracking

### Financial

#### transactions
- Types: SALE, PURCHASE, PAYMENT_IN, PAYMENT_OUT, TRADE_IN, RETURN_OUT, EXCHANGE
- Auto-calculated balance after each transaction
- Quantity, unit price, total amount
- Transaction date & notes

#### deal_accessories
- Tracks which accessories included per transaction
- Pending status & delivery dates

### Communication

#### notifications
- Bilingual: English + Urdu (اردو)
- Types: PAYMENT_REMINDER, ACCESSORY_PENDING, BALANCE_CLEAR, OVERDUE_ALERT, VENDOR_PAYMENT_DUE
- Status: PENDING, SENT, FAILED
- Ready for Twilio integration

---

## Balance Calculation Logic

### Customer (Receivable — Hamein Milna Hai)
```
balance = SALE - TRADE_IN - PAYMENT_IN

Positive = customer owes us
Zero = account clear ✅

Example:
- Sold iPhone: +130,000
- Customer paid: -50,000
- Customer paid: -30,000
- Trade-in: -20,000
- Balance: 30,000 (owes us)
```

### Supplier (Payable — Humein Dena Hai)
```
balance = PURCHASE - RETURN_OUT - PAYMENT_OUT

Positive = we owe supplier
Zero = account clear ✅

Example:
- Bought phones: +250,000
- Returned: -90,000
- Paid: -100,000
- Balance: 60,000 (we owe)
```

---

## API Endpoints (So Far)

- `GET /` — System status
- `GET /health` — Health check

More endpoints coming in Step 2 (FastAPI Routes)

---

## Configuration

### Environment Variables (.env)

```
DATABASE_URL=sqlite:///./shop.db
API_HOST=0.0.0.0
API_PORT=8000
API_DEBUG=True

# Optional: Twilio for SMS/WhatsApp
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token

# Shop Settings
SHOP_NAME=Mobile Shop
SHOP_CITY=Lahore
SHOP_PHONE=+92XXXXXXXXX
SHOP_EMAIL=shop@example.com
```

---

## Technology Stack

- **Backend:** FastAPI + Python
- **Database:** SQLite (offline-first)
- **Frontend:** React + Tailwind CSS (next)
- **ORM:** SQLAlchemy
- **Validation:** Pydantic
- **API Type:** RESTful
- **Notifications:** Twilio (SMS/WhatsApp)
- **Font:** Noto Nastaliq Urdu (Google Fonts)

---

## Key Features

✅ **Offline-First Design**
- No internet required
- Works on any device
- Fast local database

✅ **Complete Inventory Management**
- Track by brand, model, condition
- Separate accessories tracking
- Pending item monitoring

✅ **Financial Tracking**
- Customer receivables
- Supplier payables
- Partial payments
- Trade-in exchanges

✅ **Bilingual Interface**
- English + Urdu (اردو)
- RTL support for Urdu
- Noto Nastaliq font

✅ **Non-Technical Users**
- Simple, step-by-step flows
- Auto-calculations
- Big buttons, clear text
- No jargon

---

## Next Steps (Priority Order)

1. ✅ **Database Setup** — COMPLETED
2. **FastAPI Routes** — CRUD for parties, inventory, transactions
3. **React Frontend** — BilingualLabel component
4. **Dashboard** — Home screen, daily summary
5. **Add Mobile** — Inventory entry
6. **Sale Flow** — Step-by-step sales
7. **Purchase Flow** — Buy from suppliers
8. **Payments** — Payment in/out
9. **Ledgers** — Customer/supplier history
10. **Exchange** — Trade-in upgrade
11. **Accessories** — Pending tracking
12. **Reports** — Daily/Weekly/Monthly/Yearly
13. **Notifications** — WhatsApp/SMS
14. **Pending Tracker** — Accessories pending

---

## Important Notes

- SQLite file: `backend/shop.db`
- All amounts in Pakistani Rupees (Rs.)
- All numbers in English (123, not ١٢٣)
- Dates in DD/MM/YYYY format
- Database is completely offline
- No internet required for operation

---

## Documentation

- **SETUP.md** — Installation & setup guide
- **DATABASE_SCHEMA_SUMMARY.md** — Detailed schema documentation
- **STEP1_COMPLETE.md** — Implementation checklist
- **claude.md** — Complete project specification

---

## Database Implementation Status

**✅ STEP 1: DATABASE SETUP — 100% COMPLETE**

The system has:
- 8 properly designed tables
- Full data validation
- Seed data (5 brands, 17 models)
- Bilingual notification support
- Offline-first SQLite design
- FastAPI application ready
- Complete documentation

**Ready for Step 2: FastAPI Routes Development**

---

## Getting Help

For detailed information:
- Read `SETUP.md` for installation instructions
- Read `DATABASE_SCHEMA_SUMMARY.md` for schema details
- Read `STEP1_COMPLETE.md` for implementation checklist
- Read `claude.md` for complete project specification

---

Built with ❤️ for Pakistani mobile shops
