# Mobile Shop Management System — Project Context

## Project Overview
A bilingual (English + Urdu RTL) mobile phone shop management system
for Pakistani mobile shops. Designed for NON-TECHNICAL users — shopkeepers
who have zero technical knowledge. UI must be so simple that anyone can use it.

## Target Users
- Mobile phone shopkeepers in Pakistan
- Non-technical users — no English/computer knowledge required
- Users who currently use diary or Excel for tracking

## UI/UX Rules (CRITICAL)
- Bilingual: English label (small, top) + اردو label (large, bottom, RTL)
- Urdu font: Noto Nastaliq Urdu (Google Fonts)
- Urdu direction: RTL (right-to-left) ALWAYS — never LTR
- Mobile-first design (shopkeeper uses phone, not laptop)
- Step-by-step flows — never show everything at once
- Auto-calculate all amounts — user never manually calculates
- Big buttons, clear text, no jargon
- Success/error messages in both languages
- Numbers always in English (123, not ١٢٣)

---

## Tech Stack
- Backend: FastAPI + Python
- Database: SQLite (offline-first, no internet required)
- Frontend: React + Tailwind CSS
- Notifications: WhatsApp Business API / SMS gateway
- Font: Noto Nastaliq Urdu (Google Fonts)
- Deployment: Local machine (runs in browser, no internet needed)

---

## Business Scenarios (READ CAREFULLY)

### SCENARIO 1 — Simple Credit Sale (Customer Side)
Customer buys mobile on credit, pays in multiple partial payments.

Example:
- Customer Ahmed buys iPhone 13 for Rs. 50,000
- Pays Rs. 30,000 on Day 1 → Balance: Rs. 20,000
- Pays Rs. 10,000 on Day 15 → Balance: Rs. 10,000
- Pays Rs. 10,000 on Day 30 → Balance: Rs. 0 (CLEAR)

System must:
- Record every partial payment with date
- Auto-calculate running balance
- Send WhatsApp/SMS on each payment received
- Alert when balance is fully cleared

---

### SCENARIO 2 — Mobile Exchange / Upgrade (Customer Side)
Customer returns old mobile and takes new one. Old balance carries forward.

Example:
- Ahmed had iPhone 12 (Rs. 1,00,000), paid Rs. 50,000, balance Rs. 50,000
- Returns iPhone 12 (trade-in value: Rs. 80,000)
- Takes iPhone 14 (price: Rs. 2,00,000)

Calculation:
  iPhone 14 price:          Rs. 2,00,000
  Trade-in credit (12):   - Rs.   80,000
  Previous balance:       + Rs.   50,000
  Already paid:           - Rs.   50,000
  ─────────────────────────────────────
  New Balance:              Rs. 1,20,000

---

### SCENARIO 3 — Simple Credit Purchase (Supplier Side)
Shopkeeper buys mobile from supplier on credit.

Example:
- Shopkeeper buys 5x iPhone 13 from Rehman Traders
- Total: Rs. 2,50,000, Pays Rs. 1,50,000
- Balance payable to supplier: Rs. 1,00,000
- Shopkeeper pays in parts over time

---

### SCENARIO 4 — Supplier Exchange / Return
Shopkeeper returns unsold mobiles to supplier, takes new models.

Example:
- Returns 2x iPhone 13 (value Rs. 90,000) to supplier
- Takes 3x iPhone 15 (Rs. 2,10,000) from same supplier
- Previous payable balance: Rs. 1,00,000

Calculation:
  Previous balance payable:  Rs. 1,00,000
  Return credit:           - Rs.   90,000
  New purchase:            + Rs. 2,10,000
  ─────────────────────────────────────
  New balance payable:       Rs. 2,20,000

---

### SCENARIO 5 — Accessories Tracking
Mobiles may come with partial or no accessories. Track separately.

Accessories: Box, Charger, Earphones, Cable, Airpods, Other

Cases:
A) Complete: device + box + charger + earphones ✅
B) Kit Short: device + box only (charger missing from vendor)
C) Device only: no box, no accessories
D) Accessories pending from vendor: promise to deliver later
E) Sale without accessories: customer gets device, accessories stay in shop
F) Box pending from vendor at time of sale: promise to customer later

System must track:
- What accessories came with purchase (from vendor)
- What accessories given to customer (at sale)
- What is pending from vendor (with expected date)
- What is pending to customer (with promised date)
- What is in shop (customer's accessories not yet collected)

---

### SCENARIO 6 — Bulk Purchase (Multiple Brands/Models)
Shopkeeper buys multiple brands from one vendor in single transaction.

Example from Malik Wholesale:
- 3x Apple iPhone 13    @ Rs. 45,000 each = Rs. 1,35,000
- 2x Apple iPhone 14    @ Rs. 1,20,000 each = Rs. 2,40,000
- 5x Samsung Galaxy A54 @ Rs. 55,000 each = Rs. 2,75,000
- 2x OnePlus Nord 3     @ Rs. 65,000 each = Rs. 1,30,000
Total: Rs. 7,80,000 | Paid: Rs. 5,00,000 | Balance: Rs. 2,80,000

---

## Mobile Classification

### Brands Supported
Apple, Samsung, OnePlus, Vivo, Google Pixel
(System must allow adding new brands)

### Condition Types
1. BOX_PACK — Brand new sealed
2. PATCHED — Repaired/Refurbished
   - Patch details: Screen / Battery / Back Panel / Face ID / Camera / Other
3. USED — Second hand
   - Sub-condition: Good / Average / Poor

Every brand can have all three conditions.

---

## Database Schema

### Table: brands
```
id          INTEGER PRIMARY KEY
name        TEXT NOT NULL          -- Apple, Samsung, OnePlus, Vivo, Google
logo_url    TEXT
```

### Table: models
```
id                INTEGER PRIMARY KEY
brand_id          INTEGER REFERENCES brands(id)
name              TEXT NOT NULL          -- iPhone 14 Pro
storage_variants  TEXT                   -- 128GB,256GB,512GB
color_variants    TEXT                   -- Black,White,Gold
avg_market_price  REAL
```

### Table: parties
```
id               INTEGER PRIMARY KEY
name             TEXT NOT NULL
phone            TEXT
cnic             TEXT
address          TEXT
type             TEXT CHECK(type IN ('CUSTOMER','SUPPLIER'))
current_balance  REAL DEFAULT 0
-- CUSTOMER: positive = they owe us
-- SUPPLIER: positive = we owe them
created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
```

### Table: mobile_inventory
```
id               INTEGER PRIMARY KEY
model_id         INTEGER REFERENCES models(id)
purchased_from   INTEGER REFERENCES parties(id)
imei             TEXT UNIQUE
storage          TEXT               -- 128GB, 256GB
color            TEXT               -- Midnight Black
condition        TEXT CHECK(condition IN ('BOX_PACK','PATCHED','USED'))
patch_details    TEXT               -- JSON: {"screen":true,"battery":false,"back":true}
used_condition   TEXT CHECK(used_condition IN ('GOOD','AVERAGE','POOR'))
cost_price       REAL
selling_price    REAL
status           TEXT CHECK(status IN ('IN_STOCK','SOLD','RESERVED','TRADE_IN'))
purchase_date    DATE
created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
```

### Table: accessories_inventory
```
id               INTEGER PRIMARY KEY
mobile_id        INTEGER REFERENCES mobile_inventory(id)
source_party_id  INTEGER REFERENCES parties(id)
type             TEXT CHECK(type IN ('BOX','CHARGER','EARPHONES','CABLE','AIRPODS','OTHER'))
status           TEXT CHECK(status IN (
                   'WITH_DEVICE',
                   'IN_SHOP',
                   'PENDING_VENDOR',
                   'PENDING_CUSTOMER',
                   'DELIVERED'
                 ))
expected_date    DATE               -- kab milegi (if pending from vendor)
delivered_date   DATE               -- kab mili / di
notes            TEXT
```

### Table: transactions
```
id                INTEGER PRIMARY KEY
party_id          INTEGER REFERENCES parties(id)
mobile_id         INTEGER REFERENCES mobile_inventory(id)  -- nullable
party_type        TEXT CHECK(party_type IN ('CUSTOMER','SUPPLIER'))
transaction_type  TEXT CHECK(transaction_type IN (
                    'SALE',          -- customer ko mobile diya
                    'PURCHASE',      -- vendor se mobile liya
                    'PAYMENT_IN',    -- customer ne paisa diya
                    'PAYMENT_OUT',   -- vendor ko paisa diya
                    'TRADE_IN',      -- customer ka mobile liya (exchange)
                    'RETURN_OUT',    -- vendor ko mobile wapis kiya
                    'EXCHANGE'       -- upgrade transaction header
                  ))
quantity          INTEGER DEFAULT 1
unit_price        REAL
total_amount      REAL
balance_after     REAL               -- auto-calculated after transaction
transaction_date  DATE
notes             TEXT
created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
```

### Table: deal_accessories
```
id               INTEGER PRIMARY KEY
transaction_id   INTEGER REFERENCES transactions(id)
accessory_type   TEXT CHECK(accessory_type IN ('BOX','CHARGER','EARPHONES','CABLE','AIRPODS','OTHER'))
included         TEXT CHECK(included IN ('YES','NO','PENDING'))
pending_from     TEXT CHECK(pending_from IN ('VENDOR','SHOP'))
promised_date    DATE
delivered_date   DATE               -- NULL = not yet delivered
```

### Table: notifications
```
id               INTEGER PRIMARY KEY
party_id         INTEGER REFERENCES parties(id)
transaction_id   INTEGER REFERENCES transactions(id)
type             TEXT CHECK(type IN (
                   'PAYMENT_REMINDER',
                   'ACCESSORY_PENDING',
                   'BALANCE_CLEAR',
                   'OVERDUE_ALERT',
                   'VENDOR_PAYMENT_DUE'
                 ))
message_en       TEXT               -- English message
message_ur       TEXT               -- Urdu message
status           TEXT CHECK(status IN ('PENDING','SENT','FAILED'))
scheduled_at     DATETIME
sent_at          DATETIME
```

---

## Balance Calculation Logic

### Customer (Receivable — hamein milna hai):
- SALE → balance increases (customer owes us more)
- TRADE_IN received → balance decreases (credit to customer)
- PAYMENT_IN → balance decreases (customer paid)
- Balance positive = customer owes us
- Balance zero = account clear

### Supplier (Payable — humein dena hai):
- PURCHASE → balance increases (we owe supplier more)
- RETURN_OUT → balance decreases (supplier credited us)
- PAYMENT_OUT → balance decreases (we paid supplier)
- Balance positive = we owe supplier
- Balance zero = account clear

---

## Reports Required

### Time-based Reports
- Daily: cash in, cash out, sales, purchases, profit
- Weekly: sales by day (bar chart), best sellers, credit summary
- Monthly: full P&L, brand-wise, condition-wise breakdown
- Yearly: month-by-month, annual totals, top customers/vendors

### Product Reports
- Best selling: by day / week / month / year
- Slow moving: mobiles in stock 30+ days
- Brand performance: units sold, revenue, profit per brand
- Condition analysis: box pack vs patched vs used sales

### Party Reports
- Customer ledger: full transaction history, balance
- Supplier ledger: full purchase history, payable balance
- Defaulters list: customers with overdue payments

### Inventory Reports
- Current stock: by brand, model, condition
- Low stock alerts
- Trade-in mobiles in stock
- Pending accessories (from vendors, to customers)

---

## Notification Messages (Bilingual)

### Payment Reminder (Customer)
EN: "Dear {name}, Rs. {amount} payment is due today. Please visit the shop."
UR: "محترم {name}، آج Rs. {amount} کی ادائیگی باقی ہے۔ دکان پر تشریف لائیں۔"

### Overdue Alert (Customer)
EN: "Dear {name}, your payment of Rs. {amount} is {days} days overdue."
UR: "محترم {name}، آپ کی Rs. {amount} کی ادائیگی {days} دن سے باقی ہے۔"

### Balance Clear
EN: "Dear {name}, your account is now clear. Thank you! 🎉"
UR: "محترم {name}، آپ کا حساب صاف ہو گیا۔ شکریہ! 🎉"

### Accessory Pending (To Customer)
EN: "Dear {name}, your {item} for {mobile} is ready for collection."
UR: "محترم {name}، آپ کا {item} ({mobile}) دکان پر آ گیا ہے۔"

### Vendor Payment Due (To Shopkeeper)
EN: "Reminder: Rs. {amount} is due to {vendor} today."
UR: "یاد دہانی: آج {vendor} کو Rs. {amount} دینے ہیں۔"

---

## App Screens

1. Dashboard — home screen, daily summary, pending alerts
2. Sale — step-by-step mobile sale flow
3. Purchase — step-by-step mobile purchase from vendor
4. Payment In — record customer payment
5. Payment Out — record vendor payment
6. Customers — list, search, individual ledger
7. Suppliers — list, search, individual ledger
8. Inventory — stock list, filter by brand/condition
9. Add Mobile — add new mobile to inventory
10. Reports — daily/weekly/monthly/yearly
11. Pending — accessories pending tracker
12. Settings — shop name, WhatsApp number, language preference

---

## Project Folder Structure

```
mobile-shop-system/
├── backend/
│   ├── main.py               # FastAPI app entry point
│   ├── database.py           # SQLite connection, table creation
│   ├── models.py             # Pydantic models
│   ├── routers/
│   │   ├── parties.py        # customer & supplier endpoints
│   │   ├── inventory.py      # mobile inventory endpoints
│   │   ├── transactions.py   # sale, purchase, payment endpoints
│   │   ├── accessories.py    # accessories tracking endpoints
│   │   ├── reports.py        # all report endpoints
│   │   └── notifications.py  # notification endpoints
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css         # Urdu font import, RTL styles
│   │   ├── components/
│   │   │   ├── BilingualLabel.jsx   # English + Urdu label component
│   │   │   ├── BilingualButton.jsx  # English + Urdu button
│   │   │   └── BilingualAlert.jsx   # English + Urdu alert
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── Sale.jsx
│   │       ├── Purchase.jsx
│   │       ├── PaymentIn.jsx
│   │       ├── PaymentOut.jsx
│   │       ├── Customers.jsx
│   │       ├── Suppliers.jsx
│   │       ├── Inventory.jsx
│   │       ├── AddMobile.jsx
│   │       ├── Reports.jsx
│   │       ├── Pending.jsx
│   │       └── Settings.jsx
│   ├── package.json
│   └── tailwind.config.js
│
└── CLAUDE.md                 # This file
```

---

## Development Priority Order

Build in this exact order:

1. Database setup (SQLite + all tables)
2. FastAPI backend — basic CRUD for parties & inventory
3. React frontend — BilingualLabel component first
4. Dashboard screen
5. Add Mobile flow
6. Sale flow (step by step)
7. Purchase flow
8. Payment In / Payment Out
9. Customer & Supplier ledger screens
10. Exchange/upgrade flow
11. Accessories tracking
12. Reports (daily first, then weekly/monthly/yearly)
13. Notifications (WhatsApp/SMS)
14. Pending items tracker

---

## Important Notes for Development

- SQLite file stored at: ./backend/shop.db
- Backend runs on: http://localhost:8000
- Frontend runs on: http://localhost:5173
- CORS must be enabled for local development
- All amounts in Pakistani Rupees (Rs.)
- Date format: DD/MM/YYYY (Pakistani standard)
- All Urdu text must have dir="rtl" and font-family Noto Nastaliq Urdu
- Never use sudo with npm install
- Run `uvicorn main:app --reload` for backend
- Run `npm run dev` for frontend