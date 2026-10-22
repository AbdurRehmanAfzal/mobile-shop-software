# 02 — Functional Requirements

IDs are stable; reference them in commits, tests and progress notes (e.g. `FR-DEV-04`).
Priority: **P0** = needed for first paying shop, **P1** = within 3 months after, **P2** = later.

## Module A — Tenancy, Auth, Staff (`FR-AUTH`)
| ID | Requirement | Pri |
|---|---|---|
| FR-AUTH-01 | Sign-up creates an **organisation** and its first **shop**; the signing-up user is **owner**. | P0 |
| FR-AUTH-02 | Login by phone number + password (email optional). JWT access + refresh tokens. | P0 |
| FR-AUTH-03 | Roles: `owner`, `manager`, `salesman`, `technician`. Permission matrix in `04-DATA-MODEL.md`. | P0 |
| FR-AUTH-04 | Owner can add/disable staff users, set role, set PIN for fast switch on a shared shop device. | P0 |
| FR-AUTH-05 | An organisation can have several shops; a user is assigned to one or more shops; active shop is selectable. | P1 |
| FR-AUTH-06 | Audit log: every create/update/delete records user, shop, time, entity, before/after. | P0 |
| FR-AUTH-07 | Subscription plan per organisation (trial/basic/pro/chain) with feature flags and limits. | P1 |

## Module B — Master data (`FR-MST`)
| ID | Requirement | Pri |
|---|---|---|
| FR-MST-01 | Global catalogue of brands and models (seeded, bilingual names) + shop-specific additions. | P0 |
| FR-MST-02 | Storage, colour, condition lists (bilingual). | P0 |
| FR-MST-03 | Parties: one table for **customers, suppliers and other shops**; a party can play any role; phone unique per shop; CNIC optional; photos. | P0 |
| FR-MST-04 | Shop settings: name (EN/UR), address, phone, logo, currency PKR, tax settings, receipt footer, WhatsApp/SMS sender, invoice numbering. | P0 |

## Module C — Devices and inventory (`FR-DEV`)
| ID | Requirement | Pri |
|---|---|---|
| FR-DEV-01 | A **device** is one physical phone identified by IMEI1 (IMEI2/serial optional). One device row forever; re-purchases reuse the same row. | P0 |
| FR-DEV-02 | Device attributes: brand/model, storage, colour, condition (`box_pack`, `open_box`, `used`, `patched`), PTA status (`pta_approved`, `non_pta`, `jv`), SIM time (for non-PTA/JV), warranty (months + start), cost price, asking price, notes, photos. | P0 |
| FR-DEV-03 | Device **status** state machine: `in_stock`, `on_loan`, `sold`, `in_repair`, `faulty`, `returned_to_supplier`, `with_customer_for_approval`. Transitions only via events. | P0 |
| FR-DEV-04 | Every change is a **device event** (append-only): `purchased`, `verified`, `loaned_out`, `loan_returned`, `sold`, `sale_returned`, `sent_to_repair`, `repair_returned`, `marked_faulty`, `returned_to_supplier`, `price_changed`, `note`. Each event stores party, amounts, user, timestamp, reference to the ledger entry. | P0 |
| FR-DEV-05 | **Device history** screen: timeline of all events for an IMEI, including events from previous ownership cycles, with balances per party. | P0 |
| FR-DEV-06 | IMEI search across the whole shop (and, in chain plan, across the organisation): "has this IMEI been here before?" | P0 |
| FR-DEV-07 | Stock list with filters (status, condition, PTA, brand, price range, age in stock) and stock valuation. | P0 |
| FR-DEV-08 | Bulk new-stock entry from a supplier invoice (many devices, scan IMEI via camera or type). | P1 |
| FR-DEV-09 | Low-stock and ageing-stock alerts. | P1 |

## Module D — Verification (`FR-VER`)
| ID | Requirement | Pri |
|---|---|---|
| FR-VER-01 | Purchase of a used device from a walk-in requires a **verification record**: seller party (name, phone, CNIC number), CNIC front/back photos, seller photo, device photos. | P0 |
| FR-VER-02 | Checklist with result per check: eGadget (link opens portal, user records `clear` / `flagged` / `not_checked` + screenshot), PTA status, physical condition notes. | P0 |
| FR-VER-03 | Printable bilingual **purchase declaration** (seller affirms ownership, signs). | P0 |
| FR-VER-04 | Flagged devices cannot be sold (hard block, owner override with reason logged). | P0 |
| FR-VER-05 | Automated IMEI lookups via official APIs when/if available (PTA DIRBS SMS 8484 format helper now). | P2 |

## Module E — Transactions and ledger (`FR-TXN`)
| ID | Requirement | Pri |
|---|---|---|
| FR-TXN-01 | **Ledger** is append-only. Every money-affecting action creates ledger entries against a party account, a cash/bank account, and optionally a device. | P0 |
| FR-TXN-02 | Party balance = sum of ledger entries (positive = party owes shop, negative = shop owes party). Never stored as editable. Cached column allowed only if recomputed from ledger. | P0 |
| FR-TXN-03 | **Purchase** (from supplier, walk-in customer, or another shop): devices and/or accessories, total, paid now, remainder on credit, payment method. | P0 |
| FR-TXN-04 | **Sale** to customer or other shop: device/accessories, price, discount, tax, paid now, remainder on credit, accessories given/pending. Generates invoice. | P0 |
| FR-TXN-05 | **Payment in / out** against a party, allocated FIFO to open balances or to a specific invoice/device. | P0 |
| FR-TXN-06 | **Loan out** (`amanat`) to another shop: device leaves stock, no money; **loan settle**: either returned (device back) or sold-by-them (becomes a sale to that shop party at agreed price, with partial payment). | P0 |
| FR-TXN-07 | **Exchange**: new device price − trade-in value + previous balance − paid = new balance; the traded-in device enters stock as a purchase from that customer with verification. | P0 |
| FR-TXN-08 | **Sale return** and **purchase return** (to supplier) with reversing ledger entries. | P0 |
| FR-TXN-09 | **Expenses** with categories (rent, electricity, salaries, advances, tea, misc.), cash/bank, receipts photo. | P0 |
| FR-TXN-10 | **Cash book**: opening balance, cash in/out, bank/easypaisa/jazzcash accounts, day-close with counted cash vs expected. | P0 |
| FR-TXN-11 | Void/correct: only by reversing entry with reason; original stays. Owner/manager only. | P0 |
| FR-TXN-12 | Invoice numbering per shop, sequential, gap-free, prefix configurable. | P0 |

## Module F — Accessories (`FR-ACC`)
| ID | Requirement | Pri |
|---|---|---|
| FR-ACC-01 | Accessory items with SKU, category, quantity, cost, price, reorder level; bilingual names. | P0 |
| FR-ACC-02 | **Per-device bundle**: what came with the device (box, charger, cable, earphones, other) and condition; what is pending from vendor with expected date. | P0 |
| FR-ACC-03 | At sale: what is given to customer, what is pending to customer with promised date; pending list with reminders. | P0 |
| FR-ACC-04 | Accessory-only sales and purchases hit stock quantities and the ledger. | P0 |

## Module G — Repairs (`FR-REP`)
| ID | Requirement | Pri |
|---|---|---|
| FR-REP-01 | Repair job for a customer device (not stock) or for a stock device. Fields: customer, device (IMEI optional for customer devices), fault (bilingual quick-picks + text), accessories received with it, condition photos, estimate, advance, promised date, assigned technician. | P0 |
| FR-REP-02 | Status flow: `received` → `diagnosed` → `waiting_parts` → `in_progress` → `repaired` → `delivered` / `returned_unrepaired` / `unclaimed`. Each change logged with user and time. | P0 |
| FR-REP-03 | Parts used reduce parts stock; labour amount; final bill; payment via ledger; repair warranty days. | P0 |
| FR-REP-04 | Job sheet print (customer copy + shop copy) and WhatsApp status updates ("aapka mobile tayyar hai"). | P0 |
| FR-REP-05 | Outside-technician jobs: stock device sent out, cost recorded as expense/payable to that technician party. | P1 |
| FR-REP-06 | Technician performance and repair revenue reports. | P1 |

## Module H — Tax / FBR (`FR-TAX`)
| ID | Requirement | Pri |
|---|---|---|
| FR-TAX-01 | Shop tax settings: enabled, rate %, inclusive/exclusive, NTN/STRN printed on invoice. | P0 |
| FR-TAX-02 | Tax computed per invoice line, rounded per FBR rules (2 dp), stored on the invoice. | P0 |
| FR-TAX-03 | Tax report by period (taxable sales, tax collected). | P0 |
| FR-TAX-04 | FBR POS integration (invoice registration, FBR invoice number + QR on receipt) for notified shops. | P2 |

## Module I — Reports and notifications (`FR-RPT`)
| ID | Requirement | Pri |
|---|---|---|
| FR-RPT-01 | Dashboard: today's sales, purchases, cash in hand, receivables, payables, stock count/value, repairs pending, pending accessories, alerts. | P0 |
| FR-RPT-02 | Reports: sales, purchases, profit (per device: sale − cost − repair cost), cash flow, expenses, party statements/ageing, stock, repairs, staff, tax. Date range, export PDF/Excel. | P0 |
| FR-RPT-03 | Scheduled email reports (daily close, weekly summary) to owner. | P1 |
| FR-RPT-04 | WhatsApp messages (Meta Cloud API; SMS fallback): payment receipt, balance reminder, repair ready, pending accessory reminder, invoice PDF. Bilingual templates. | P1 |
| FR-RPT-05 | Party statement share via WhatsApp/PDF. | P1 |

## Module J — Printing (`FR-PRT`)
| ID | Requirement | Pri |
|---|---|---|
| FR-PRT-01 | Thermal 58/80 mm receipt and A4 invoice templates, bilingual, IMEI, tax, QR, shop logo; print via browser print dialog (any OS printer). | P0 |
| FR-PRT-02 | Repair job sheet, purchase declaration, party statement, delivery note. | P0 |
| FR-PRT-03 | Direct ESC/POS printing from the Android app via Bluetooth/USB. | P2 |

## Module K — Platform (`FR-PLT`)
| ID | Requirement | Pri |
|---|---|---|
| FR-PLT-01 | Bilingual UI (EN/UR, RTL Urdu, Latin digits), switchable per user; Urdu is the default. | P0 |
| FR-PLT-02 | PWA: installable on Android/iOS/desktop, cached shell, works on slow networks. | P0 |
| FR-PLT-03 | Native Android/iOS builds from the same codebase via Capacitor (camera, share, print). | P1 |
| FR-PLT-04 | Local/offline install: same backend + SQLite on a shop PC, single tenant, no internet required. | P1 |
| FR-PLT-05 | Cloud sync for local installs (event-log based, conflict-free for append-only data). | P2 |
| FR-PLT-06 | Backups: nightly DB backup, one-click restore (local), point-in-time (cloud). | P1 |
| FR-PLT-07 | Data export (Excel/CSV) of everything that belongs to the shop. | P1 |
| FR-PLT-08 | **Premium, modern visual design**: a documented design system (colour tokens, Urdu+Latin type scale, spacing, elevation, motion, icon set, light/dark) approved by the owner before Phase 1 screens; every screen built from it. Acceptance: shopkeeper test group rates it "modern" (v1 failed this with ~50 users). | P0 |

## Module L — AI (`FR-AI`)
| ID | Requirement | Pri |
|---|---|---|
| FR-AI-01 | Chat assistant (Urdu/English) answering questions over the shop's own data via tool calls (sales, balances, IMEI history). | P1 |
| FR-AI-02 | Photo → IMEI / CNIC fields (vision extraction) during purchase. | P1 |
| FR-AI-03 | Resale price suggestion from the shop's and catalogue history. | P2 |
| FR-AI-04 | Draft reminder messages in the customer's language. | P2 |

## Worked example: S2/S3 Nokia chain (acceptance test)
1. Purchase from walk-in Ali, Rs. 1,000, verification done → device D1 `in_stock`, ledger: cash −1,000; event `purchased`.
2. Loan to Shop B → D1 `on_loan` (party Shop B), no ledger money; event `loaned_out`.
3. Shop B reports sold for Rs. 1,500, pays 500 → event `sold` (buyer Shop B), ledger: Shop B owes +1,500, cash +500 → Shop B balance +1,000? **No**: agreed price between us and Shop B is what we invoice (say Rs. 1,000); Shop B pays 500 → balance +500. Their resale price is theirs. D1 `sold`.
4. Device comes back (Shop B returns it) → `sale_returned`: reverse the 1,000 invoice → Shop B balance = +500 − 1,000 = −500? **No**: return credits 1,000 → Shop B balance 500 − 1,000 = −500 means we owe Shop B 500, which is wrong because they already paid 500 of 1,000. Correct: balance after sale +1,000, after payment +500, after return −500 (we owe them their 500 back) **unless** the owner chooses to keep the 500 as earned (e.g. loan fee). Both options must be offered on the return screen: refund now / keep as credit / keep as income. D1 back `in_stock`.
5. Sell to Sara for Rs. 1,500, paid in full → event `sold`, cash +1,500, D1 `sold`. Profit view on D1 = 1,500 − 1,000 (+ any kept income).
Device history shows all 5 steps with parties and balances. Tests in `backend/tests/test_scenarios.py` must encode this.
