# Mobile Shop Management System — API Endpoints Documentation

## Overview

Complete REST API for Mobile Shop Management System. All endpoints use JSON format and return standardized responses.

**Base URL:** `http://localhost:8000`

---

## 🏥 Health Check

### System Status
```
GET /
```
Returns system status and shop information.

**Response:**
```json
{
  "message": "Mobile Shop Management System API",
  "shop": "Mobile Shop",
  "city": "Lahore",
  "status": "running"
}
```

### Health Check
```
GET /health
```
Returns database and API health status.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected"
}
```

---

## 📱 Brands & Models

### Get All Brands
```
GET /api/brands/
```
Returns list of all mobile phone brands.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Apple",
    "logo_url": "...",
    "created_at": "2024-01-01T00:00:00"
  },
  ...
]
```

### Get Brand by ID
```
GET /api/brands/{brand_id}
```

### Create Brand
```
POST /api/brands/
```
**Body:**
```json
{
  "name": "Brand Name",
  "logo_url": "https://..."
}
```

### Update Brand
```
PUT /api/brands/{brand_id}
```

### Get All Models
```
GET /api/brands/models
```
Returns all phone models.

### Get Models by Brand
```
GET /api/brands/brand/{brand_id}/models
```
Returns models for a specific brand.

### Get Model by ID
```
GET /api/brands/models/{model_id}
```

### Create Model
```
POST /api/brands/models
```
**Body:**
```json
{
  "brand_id": 1,
  "name": "iPhone 14 Pro",
  "storage_variants": "128GB,256GB,512GB,1TB",
  "color_variants": "Space Black,Silver,Gold,Deep Purple",
  "avg_market_price": 220000
}
```

### Update Model
```
PUT /api/brands/models/{model_id}
```

---

## 👥 Parties (Customers & Suppliers)

### Create Party (Customer or Supplier)
```
POST /api/parties/
```
**Body:**
```json
{
  "name": "Ahmed Khan",
  "phone": "03001234567",
  "type": "CUSTOMER",
  "cnic": "12345-1234567-1",
  "address": "Main Bazaar, Lahore",
  "is_active": true
}
```

### Get All Parties
```
GET /api/parties/
```
Optional parameters:
- `party_type`: "CUSTOMER" or "SUPPLIER"
- `is_active`: true or false

**Example:**
```
GET /api/parties/?party_type=CUSTOMER&is_active=true
```

### Get All Customers
```
GET /api/parties/customers
```

### Get All Suppliers
```
GET /api/parties/suppliers
```

### Get Party by ID
```
GET /api/parties/{party_id}
```

### Search Party by Phone
```
GET /api/parties/search/phone/{phone}
```

### Update Party
```
PUT /api/parties/{party_id}
```
**Body (optional fields):**
```json
{
  "name": "New Name",
  "phone": "03009876543",
  "cnic": "...",
  "address": "...",
  "is_active": true
}
```

### Deactivate Party
```
PATCH /api/parties/{party_id}/deactivate
```
Soft delete (sets is_active to false).

### Get Party Balance
```
GET /api/parties/{party_id}/balance
```

**Response:**
```json
{
  "party_id": 1,
  "name": "Ahmed Khan",
  "phone": "03001234567",
  "type": "CUSTOMER",
  "current_balance": 50000,
  "balance_status": "OWES US",
  "updated_at": "2024-01-15T10:30:00"
}
```

**balance_status** values:
- `CLEAR` — Account is clear
- `OWES US` — Customer owes us (CUSTOMER type only)
- `WE OWE` — We owe supplier (SUPPLIER type only)

---

## 📦 Inventory

### Add Mobile to Stock
```
POST /api/inventory/mobiles
```
**Body:**
```json
{
  "model_id": 5,
  "purchased_from": 2,
  "imei": "123456789012345",
  "storage": "256GB",
  "color": "Midnight Black",
  "condition": "BOX_PACK",
  "patch_details": null,
  "used_condition": null,
  "cost_price": 80000,
  "selling_price": 130000,
  "status": "IN_STOCK",
  "purchase_date": "2024-01-01"
}
```

**Condition types:**
- `BOX_PACK` — Brand new
- `PATCHED` — Refurbished (include patch_details as JSON)
- `USED` — Second-hand (include used_condition)

**Status types:**
- `IN_STOCK` — Available for sale
- `SOLD` — Already sold
- `RESERVED` — On hold
- `TRADE_IN` — Received in exchange

### Get Mobiles in Stock
```
GET /api/inventory/mobiles
```
Optional parameters:
- `status`: "IN_STOCK", "SOLD", "RESERVED", "TRADE_IN"
- `condition`: "BOX_PACK", "PATCHED", "USED"

**Example:**
```
GET /api/inventory/mobiles?status=IN_STOCK&condition=BOX_PACK
```

### Get Mobile by ID
```
GET /api/inventory/mobiles/{mobile_id}
```

### Search Mobile by IMEI
```
GET /api/inventory/mobiles/search/imei/{imei}
```

### Update Mobile
```
PUT /api/inventory/mobiles/{mobile_id}
```
**Body (optional fields):**
```json
{
  "imei": "...",
  "storage": "...",
  "color": "...",
  "condition": "...",
  "cost_price": 80000,
  "selling_price": 130000,
  "status": "SOLD"
}
```

### Add Accessory to Inventory
```
POST /api/inventory/accessories
```
**Body:**
```json
{
  "mobile_id": 1,
  "source_party_id": 2,
  "type": "BOX",
  "status": "WITH_DEVICE",
  "expected_date": null,
  "delivered_date": null,
  "notes": "Original box included"
}
```

**Accessory types:**
- `BOX` — Device box
- `CHARGER` — Power charger
- `EARPHONES` — Earphones/headphones
- `CABLE` — USB cable
- `AIRPODS` — Apple AirPods
- `OTHER` — Other accessories

**Accessory status:**
- `WITH_DEVICE` — Came with device
- `IN_SHOP` — Stored separately in shop
- `PENDING_VENDOR` — Vendor to deliver
- `PENDING_CUSTOMER` — Customer to collect
- `DELIVERED` — Delivered

### Get All Accessories
```
GET /api/inventory/accessories
```
Optional parameters:
- `status`: Accessory status
- `accessory_type`: Accessory type

### Get Accessory by ID
```
GET /api/inventory/accessories/{accessory_id}
```

### Get Accessories for a Mobile
```
GET /api/inventory/accessories/mobile/{mobile_id}
```

### Update Accessory
```
PUT /api/inventory/accessories/{accessory_id}
```

### Get Inventory Statistics
```
GET /api/inventory/stats/summary
```

**Response:**
```json
{
  "total_in_stock": 45,
  "total_sold": 120,
  "total_reserved": 3,
  "total_trade_in": 5,
  "by_status": {
    "IN_STOCK": 45,
    "SOLD": 120,
    "RESERVED": 3,
    "TRADE_IN": 5
  },
  "by_condition": {
    "BOX_PACK": 35,
    "PATCHED": 8,
    "USED": 2
  },
  "inventory_value": 3600000
}
```

### Get Pending Accessories
```
GET /api/inventory/stats/pending-accessories
```

**Response:**
```json
{
  "total_pending": 5,
  "pending_from_vendor": 3,
  "pending_from_customer": 2,
  "vendor_pending_items": [...],
  "customer_pending_items": [...]
}
```

### Get Low Stock Items
```
GET /api/inventory/stats/low-stock?min_count=5
```

---

## 💰 Transactions

### Create Transaction
```
POST /api/transactions/
```
**Body:**
```json
{
  "party_id": 1,
  "mobile_id": 5,
  "party_type": "CUSTOMER",
  "transaction_type": "SALE",
  "quantity": 1,
  "unit_price": 130000,
  "total_amount": 130000,
  "transaction_date": "2024-01-15",
  "notes": "Good condition"
}
```

**Transaction types:**
- `SALE` — Sold to customer
- `PURCHASE` — Bought from supplier
- `PAYMENT_IN` — Customer paid
- `PAYMENT_OUT` — Paid supplier
- `TRADE_IN` — Received device (exchange)
- `RETURN_OUT` — Returned to supplier
- `EXCHANGE` — Upgrade transaction

**Note:** party_type must match party's type.

**Response:**
```json
{
  "id": 1,
  "party_id": 1,
  "mobile_id": 5,
  "party_type": "CUSTOMER",
  "transaction_type": "SALE",
  "quantity": 1,
  "unit_price": 130000,
  "total_amount": 130000,
  "balance_after": 130000,
  "transaction_date": "2024-01-15",
  "notes": "Good condition",
  "created_at": "2024-01-15T10:30:00",
  "updated_at": "2024-01-15T10:30:00"
}
```

### Get Transactions
```
GET /api/transactions/
```
Optional parameters:
- `party_id`: Filter by party
- `transaction_type`: Filter by type
- `start_date`: From date (YYYY-MM-DD)
- `end_date`: To date (YYYY-MM-DD)

**Example:**
```
GET /api/transactions/?party_id=1&transaction_type=SALE&start_date=2024-01-01&end_date=2024-01-31
```

### Get Transaction by ID
```
GET /api/transactions/{transaction_id}
```

### Get Party Transactions
```
GET /api/transactions/party/{party_id}
```

### Quick Sale
```
POST /api/transactions/quick-sale
```
**Body:**
```json
{
  "customer_id": 1,
  "mobile_id": 5,
  "price": 130000,
  "transaction_date": "2024-01-15",
  "notes": "Sold"
}
```

**Response:**
```json
{
  "status": "success",
  "transaction": {...},
  "customer_balance": 130000
}
```

### Quick Payment In (Customer Payment)
```
POST /api/transactions/quick-payment-in
```
**Body:**
```json
{
  "customer_id": 1,
  "amount": 50000,
  "transaction_date": "2024-01-15",
  "notes": "Cash payment"
}
```

**Response:**
```json
{
  "status": "success",
  "transaction": {...},
  "customer_balance": 80000,
  "balance_clear": false
}
```

### Quick Payment Out (Supplier Payment)
```
POST /api/transactions/quick-payment-out
```
**Body:**
```json
{
  "supplier_id": 2,
  "amount": 100000,
  "transaction_date": "2024-01-15",
  "notes": "Bank transfer"
}
```

**Response:**
```json
{
  "status": "success",
  "transaction": {...},
  "supplier_balance": 150000,
  "balance_clear": false
}
```

### Get Daily Statistics
```
GET /api/transactions/stats/daily?target_date=2024-01-15
```

**Response:**
```json
{
  "date": "2024-01-15",
  "sales": {
    "count": 5,
    "total_amount": 650000
  },
  "purchases": {
    "count": 2,
    "total_amount": 400000
  },
  "cash_in": 200000,
  "cash_out": 100000,
  "net_cash": 100000,
  "profit_estimate": 250000
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message"
}
```

### Common HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 404 | Not Found |
| 422 | Unprocessable Entity |
| 500 | Server Error |

### Example Error Response

```json
{
  "detail": "Party not found"
}
```

---

## Data Types & Formats

### Amounts (Rs.)
All monetary amounts in Pakistani Rupees as floating-point numbers.
```
"total_amount": 130000.00
```

### Dates
Date format: `YYYY-MM-DD`
```
"transaction_date": "2024-01-15"
```

### DateTime
DateTime format: ISO 8601
```
"created_at": "2024-01-15T10:30:00"
```

### Phone Numbers
Pakistani format with country code optional.
```
"phone": "03001234567"
```

---

## Balance Calculation

### Customer (Receivable)
```
balance = SALE - TRADE_IN - PAYMENT_IN
```
- Positive = customer owes us
- Zero = account clear
- Negative = we owe customer (rare)

### Supplier (Payable)
```
balance = PURCHASE - RETURN_OUT - PAYMENT_OUT
```
- Positive = we owe supplier
- Zero = account clear
- Negative = supplier owes us (rare)

---

## API Usage Examples

### Example 1: Create Customer and Record Sale

```bash
# 1. Create customer
curl -X POST http://localhost:8000/api/parties/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ahmed Khan",
    "phone": "03001234567",
    "type": "CUSTOMER"
  }'

# Response: customer_id = 1

# 2. Record sale
curl -X POST http://localhost:8000/api/transactions/quick-sale \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "mobile_id": 5,
    "price": 130000,
    "transaction_date": "2024-01-15"
  }'

# 3. Record payment
curl -X POST http://localhost:8000/api/transactions/quick-payment-in \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "amount": 50000,
    "transaction_date": "2024-01-20"
  }'

# 4. Check balance
curl http://localhost:8000/api/parties/1/balance
```

### Example 2: Add Inventory and Check Stock

```bash
# 1. Add mobile to inventory
curl -X POST http://localhost:8000/api/inventory/mobiles \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": 5,
    "purchased_from": 2,
    "imei": "123456789012345",
    "storage": "256GB",
    "color": "Midnight Black",
    "condition": "BOX_PACK",
    "cost_price": 80000,
    "selling_price": 130000,
    "status": "IN_STOCK",
    "purchase_date": "2024-01-01"
  }'

# 2. Get inventory summary
curl http://localhost:8000/api/inventory/stats/summary

# 3. Get in-stock items
curl http://localhost:8000/api/inventory/mobiles?status=IN_STOCK
```

---

## Rate Limiting & Performance

Currently no rate limiting. In production, implement:
- Request throttling per IP
- Authentication tokens
- API key management

---

## Swagger Documentation

Interactive API documentation available at:
```
http://localhost:8000/docs
```

ReDoc documentation available at:
```
http://localhost:8000/redoc
```

---

## Version Information

- **API Version:** 1.0.0
- **Database:** SQLite
- **Framework:** FastAPI
- **Python:** 3.8+

