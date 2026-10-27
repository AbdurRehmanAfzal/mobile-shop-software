# 01 — Business Requirements (Business Document)

Owner: Abdur Rehman Afzal · Status: Living document · Last updated: 2026-10-22

## 1. Vision
A complete, easy-to-use, bilingual (English + Urdu) mobile-shop management platform for Pakistan,
sold as SaaS (cloud) and also installable locally (offline), with Android and iOS apps, that
**solves the used-mobile problem no existing software handles**.

One sentence: *"Har mobile ki poori kahani, har paise ka hisaab, ek aasaan app mein."*

## 2. The problem
Pakistani mobile shopkeepers (often with little formal or computer education) currently use a diary or Excel. Existing POS software:
- is hard to use (English-only, accountant-style screens);
- cannot handle **used mobiles**: a single device moves between customers, neighbouring shops and repair labs many times, with partial payments at each step;
- gives no help with **verification** of a used device bought from a walk-in customer (stolen-phone risk), so there is no proof trail (CNIC, photos, IMEI check);
- has no repair module, no per-device accessories tracking, no AI;
- has no multi-shop support and no FBR tax handling.

## 3. Target users
| Persona | Needs |
|---|---|
| Shop owner (malik) | Full control, reports, cash flow, staff limits, tax |
| Salesman (staff) | Fast sale / purchase / payment entry on a phone, no accounting knowledge |
| Repair technician | Repair queue, status updates, parts used, charges |
| Chain owner | One account, several shops, consolidated reports |

Non-functional expectations: Urdu-first UI, large buttons, step-by-step flows, auto-calculation, works on a phone, works without internet when installed locally. **Look and feel must be premium and modern**: the v1 prototype was shown to ~50 shopkeepers and judged "not modern, not luxury"; visual quality is a selling point of the SaaS, not optional polish.

## 4. Core business scenarios (must be modelled exactly)

### S1. Walk-in used-mobile purchase with verification
Shopkeeper buys a used Nokia from a walk-in customer for Rs. 1,000. Before buying, the shopkeeper verifies:
- IMEI on the Punjab Police **eGadget** portal (https://egadget.punjab.gov.pk) — manual today, the app records the result and a screenshot;
- **PTA** status: PTA-approved / Non-PTA / JV. Non-PTA and JV devices have a **SIM time** (how long the device keeps working on a local SIM);
- Customer identity: **CNIC number, CNIC photos (front/back), customer photo, phone number**, optionally a signed declaration (printed form).
All of this is attached to the device record so the shop has proof the device was not stolen.

### S2. Device moves between shops before being sold ("udhaar / amanat")
A neighbouring shopkeeper takes the Nokia "to show a customer" without paying. The device must show as **OUT ON LOAN to Shop B** (not in stock, not sold), with date and who took it.
Later Shop B sells it and pays Rs. 500; Rs. 500 remains due. Shop B is a **party** with a receivable balance of Rs. 500 tied to that device.

### S3. The same device comes back and is sold again
The Nokia returns (Shop B's customer returned it; Shop B returned it to us). Shop B still owes Rs. 500. We then sell it to another customer for Rs. 1,500.
The device history must show every hop: bought from X (verified), loaned to Shop B, sold by Shop B, returned, sold to Y for 1,500. Balances must stay correct at each step.

### S4. Credit sale with partial payments
Customer buys for Rs. 50,000, pays 30,000 now, 10,000 later, 10,000 later → balance 0. Every payment is dated, balance auto-computed, WhatsApp/SMS receipt per payment, "account clear" alert.

### S5. Exchange / upgrade
Customer returns an old device (trade-in value) and takes a new one; the previous balance carries forward. Exact arithmetic in `02-FUNCTIONAL-REQUIREMENTS.md`.

### S6. Supplier credit purchase and returns
Buy stock from a supplier on credit, pay in instalments, return unsold units; supplier payable balance adjusts.

### S7. Accessories per device
At purchase (new or used) record exactly what came with the device: box, charger, cable, earphones/AirPods, other; condition; what is pending from the vendor (expected date). At sale time record what was given to the customer and what is still pending to the customer. Separately, plain accessory stock (chargers, covers, glass) is sold on its own.

### S8. Repair lab
Customer leaves a device for repair: fault description, estimate, advance, promised date, status (received → diagnosed → waiting parts → repaired → delivered / returned unrepaired), parts used (from parts stock), labour, final bill, warranty on repair. Also the shop's own stock devices sent to an outside technician, and stock devices flagged faulty.

### S9. New stock
Box-pack devices from suppliers with IMEI, PTA status, warranty (months, from date), purchase price, batch. Same inventory table as used devices, distinguished by condition.

### S10. Tax (FBR)
Shop-configurable sales tax %, tax-inclusive or exclusive pricing, tax shown on invoice, tax reports by period. Later: FBR POS integration (invoice registration and QR) for shops notified by FBR.

### S11. Multi-tenant SaaS
Many shops on one cloud instance; each shop's data fully isolated; an owner can have several shops; subscription plans. The same software installs locally for a single shop (offline), with optional cloud sync later.

### S12. Reports and communication
Daily/weekly/monthly sales, purchases, profit, cash flow, expenses, receivables/payables ageing, stock valuation, repair revenue, staff performance, tax. Delivered in-app, by email (PDF) and by WhatsApp.

### S13. Staff
Owner creates staff users with roles and permissions (a salesman cannot see profit or delete). Attendance, salary and advances as expenses. Audit log of who did what.

### S14. Invoice printing
Thermal receipt (58 mm / 80 mm) and A4 invoice, bilingual, with shop logo, IMEI, tax, QR; works with any printer via the browser/OS print dialog.

### S15. AI assistant (differentiator)
Ask in Urdu/English: "aaj kitni sale hui?", "Ahmed ka balance?", "yeh IMEI pehle aaya tha?"; suggest resale price from history; read IMEI/CNIC from a photo (OCR); draft WhatsApp reminders.

## 5. Success criteria
- A shopkeeper with no computer background completes a used-mobile purchase with verification in under 2 minutes on a phone.
- Device history for any IMEI is one tap away and always correct.
- Customer/supplier/shop-party balances are always derivable from the ledger and match printed statements.
- Works on a Rs. 15,000 Android phone and on a Windows PC in the shop.
- Serves 100+ shops on one cloud instance with zero data leakage.

## 6. Out of scope (for now)
Bank integration, e-commerce storefront, dedicated barcode hardware beyond the phone camera, double-entry accounting beyond cash-basis books.

## 7. Monetisation (SaaS)
Per-shop monthly subscription (Basic / Pro / Chain). Local offline licence as one-time fee plus optional cloud-sync subscription. 14-day free trial.
