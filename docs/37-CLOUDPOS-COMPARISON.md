# 37 · CloudPOS mobile-shop system — comparison, pricing and gaps (owner 2026-11-16)

Source: `cloudpos.pk/mobile-shop-management-system` (the whole page, read 2026-11-16). What they
*claim* on the page is compared with what our software *does* today. Nothing here was tested inside
their product. ADR-092 records what was changed on our side.

## 1. Their pricing

| | Basic | Business Pro | Enterprise | Custom |
|---|---|---|---|---|
| Per year | Rs. 25,000 (2,083 / month) | Rs. 50,000 (4,167 / month) | Rs. 80,000 (6,667 / month) | on request |
| Setup, one time | Rs. 10,000 | Rs. 20,000 | Rs. 35,000 | — |
| **First year in all** | **Rs. 35,000** | **Rs. 70,000** | **Rs. 115,000** | — |
| Users / branches | 1 user, 1 branch | 1–3 users, 1 branch | 1–10 users, multi-branch | unlimited |
| Headline features | POS billing, products, basic stock, customers, basic reports, expenses | + IMEI, repairs, udhaar, warranty, easy load, returns, barcodes, suppliers, roles, loyalty, advanced reports | + transfers, quotations, price groups, price drop, card discounts, wholesale, accounting, commission, mobile apps, HR, assets, data migration | custom modules, API, integrations |

- Billing is yearly only, with a **minimum 1-year contract**. The free trial is **7 days**.
- **Add-ons** (extra):
  - extra branch: Rs. 20,000 / year;
  - WhatsApp bill sharing: Rs. 5,000 / month;
  - SMS alerts: Rs. 5,000;
  - extra user: Rs. 5,000 / month;
  - admin / POS mobile app: Rs. 20,000;
  - data migration: Rs. 10,000;
  - attendance machine: Rs. 15,000;
  - e-commerce (Shopify / website): Rs. 40,000;
  - Daraz: Rs. 10,000;
  - Meta: Rs. 10,000;
  - dedicated support: Rs. 10,000 / month.
- IMEI tracking, udhaar and repairs are **not** in their Basic plan.

## 2. Our pricing (as shown on the landing page; owner's decision 2026-11-16)

| | Basic | Pro | Chain |
|---|---|---|---|
| Per month | Rs. 2,500 | Rs. 4,000 | Rs. 7,000 |
| A year paid at once (10 months) | Rs. 25,000 | Rs. 40,000 | Rs. 70,000 |
| Setup, one time | Rs. 5,000 | Rs. 8,000 | Rs. 15,000 |
| **First year in all** (yearly + setup) | **Rs. 30,000** | **Rs. 48,000** | **Rs. 85,000** |
| Their nearest plan, first year | Rs. 35,000 | Rs. 70,000 | Rs. 115,000 |

Before 2026-11-16 the prices were 1,500 / 3,000 / 6,000 a month with no setup fee.

**Add-ons** (services; every plan's features are unchanged):
- we enter the shop's old stock: Rs. 5,000 once;
- a visit to the shop for installation and staff training: Rs. 5,000 once;
- offline install on the shop's computer: Rs. 5,000 once;
- priority support on a phone call: Rs. 1,000 / month.

- Our trial is 14 days. Shops can pay month by month, and there is no per-user fee.
- The Android app, WhatsApp bill sharing and the Excel download are included.
- IMEI, udhaar, ID-card verification and the phone's history are in **every** plan.

**What was done (ADR-092)**:
- The prices are no longer fixed in code. **Super admin → Website prices** sets, per plan, the monthly price and a one-time setup fee, plus the yearly offer, the trial days and add-ons with their prices.
- The landing page now shows them the way a buyer compares:
  - the per-month price with "paid for the year";
  - a setup-fee line ("No setup fee" today);
  - "Everything in Basic, plus …" lists;
  - an "In every plan, at no extra charge" block;
  - an add-ons table, shown only when add-ons exist.
- The owner then set the numbers above (2026-11-16); they are the defaults in `public/pricing.py`.

## 3. Feature by feature

**We have it** (their claim → where it is in ours):
- **IMEI and stock**: IMEI sales and tracking, dual IMEI, new / used, brand / model / colour / storage variants, battery health and condition, accessories (batches, FIFO, dozen / box), stock age and low-stock alerts, barcode stickers and scanning, stock count with the scanner, tally sheets.
- **Repairs**: repair jobs with status, parts and cost; own technician or outside lab; repairs of own stock; a public status link.
- **Sales and money**: cash / udhaar sales, advance and part payments, installments with a guarantor, exchange and returns, retail / wholesale / promo prices and a minimum price for accessories, daily hisaab, profit, expenses, cash and bank accounts, outstanding balances.
- **Branches and staff**: multi-branch with stock transfers, roles and per-staff access, staff reports, attendance (hazri).
- **People**: customer / supplier khata with aging, WhatsApp reminders and bills.
- **Accounts and tax**: ledger, profit and loss, balance sheet, item GST, FBR Digital Invoicing.
- **Reports and control**: activity and login logs, deleted-entry log (kept as Deleted), Excel import and export, an Excel backup, offline mode, OTP at sign-up and owner-approved phones, an AI assistant.

**We have it and their page does not mention it**:
- ID-card (CNIC) verification of the seller with a signed declaration, and a chain-of-custody history for every used phone.
- PTA DIRBS check saved on the phone.
- Urdu, Roman Urdu and English, with a "?" explanation on every field.
- Len-den (money given / taken with no bill).
- A QR on every bill that the customer can check.
- Locked (iCloud / FRP) phones and parts use.
- Tablets and smart watches with their own specs.
- Sticker designer with a live preview.
- Edit / Delete on every entry, with what it will do shown first.
- A one-PC Windows install.
- A shop audit with drill-down.

**Gaps — they list it, we do not have it** (suggested order for a mobile shop in Pakistan):

| # | Gap | Why it matters | Size |
|---|---|---|---|
| 1 | **Easy load / mobile load and packages** | Almost every mobile shop sells load. It needs a daily float per network, sales and commission. | medium |
| 2 | **Warranty tracking with expiry and claims** | We store warranty days on the bill. There is no "under warranty?" lookup by IMEI, no expiry list and no claim record. | small–medium |
| 3 | **Quotations** | A price quote that turns into a bill. Useful for wholesale and corporate buyers. | small |
| 4 | **Sales commission and targets** | Per-salesman commission (per phone / % of profit) and monthly targets. We have staff reports but no commission. | medium |
| 5 | **Customer loyalty (points)** | Points on a sale, redeemed on the next. | medium |
| 6 | **SMS alerts** | We send on WhatsApp only. SMS needs a paid gateway. | small (plus a provider) |
| 7 | **Price-drop management** | When a brand cuts a price: stock on hand × the drop, and claims on the dealer. We keep a price-change history only. | medium |
| 8 | **Bank card / payment-method discounts** | A discount by card or bank offer. | small |
| 9 | **Price groups for phones** | Dealer / wholesale price lists per customer group. Accessories have tiers; phones do not. | medium |
| 10 | **Assets and advanced HR / payroll** | Shop assets register; payroll beyond salary-as-expense and hazri. | medium |
| 11 | **Online selling links** (Shopify / website, Daraz, Meta) | Stock sync with online channels. | large |
| 12 | **SRB / KPRA** | Provincial sales-tax links (services). We have FBR only. | medium |
| 13 | **Attendance machine** | Biometric device import. | small–medium |

## 4. Their page against ours (what to learn)

- They lead with pain points and a 52-feature list in seven groups. Ours leads with what is unique and with screens. Both work; ours now also lists the newest round first.
- Their pricing has clear per-plan limits (users, branches) and an add-on price list. Ours now has the same shape, with the add-ons editable.
- They show awards and "hundreds of retailers". We have no proof block yet (count of shops, testimonials). This needs real numbers and quotes from the owner.

## 5. Decisions for the owner

1. **Prices, setup fee, add-ons**: decided 2026-11-16 (section 2). Change them any time in Super admin → Website prices.
2. **Which gaps to build first**: still open. Suggested 1 (easy load), 2 (warranty), 3 (quotations), 4 (commission).
