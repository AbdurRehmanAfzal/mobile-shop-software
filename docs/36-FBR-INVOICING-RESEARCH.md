# 36 · FBR invoicing — research and plan (2026-11-05)

The owner shared a sample Tier-1 POS receipt and asked how FBR invoicing works, because our bills
must follow it. Sources:
- FBR's own "POS Integration — FAQs" (download1.fbr.gov.pk, 2020);
- PRAL's "Technical Specification for DI API" (download1.fbr.gov.pk, 2025, 50 pages);
- news / vendor guides, marked as such.

Rates and deadlines change by SRO, so a tax adviser must confirm them before go-live.

## 1. There are two FBR systems — not one

| | A. POS integration (IMS) | B. Digital Invoicing (DI) |
|---|---|---|
| Who | **Tier-1 retailers** (Sales Tax Act s.2(43A)): a chain-store unit; a shop in an **air-conditioned mall / plaza / centre** (not a kiosk); electricity bill > Rs 1.2 million in 12 months; wholesaler-cum-retailer importing in bulk; a shop of 1,000 sq ft or more | **Sales-tax-registered persons** notified by FBR (SRO 69(I)/2025, SRO 709(I)/2025 and later). Started with corporates / importers; vendor guides say it is widening to all registered persons |
| When | Every sale, at the counter, in real time | Every sales-tax invoice, in real time |
| How | Register each counter (POS) in IRIS → **POS ID**. Each bill goes to FBR through the IMS service (cloud, or the local "fiscal component" on the PC). FBR returns an **FBR invoice number** | Get a **security token** (valid 5 years) from IRIS. `POST https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata` with `Authorization: Bearer <token>`; `…/validateinvoicedata_sb` validates first. The same URL serves sandbox and production; the token decides which |
| On the bill | FBR invoice number + **QR code**; the POS service fee line (**Re 1 per invoice**, SRO 1006(I)/2021, collected from the customer, deposited with the return) | **DI logo** + **QR code** (version 2, 25×25, printed 1 × 1 inch) + the DI invoice number (e.g. `7000007DI1747119701593`) |
| Returns | Software must handle returns / exchanges; otherwise debit / credit notes in Annex-I. Entries in Annex-C can never be deleted | Debit note with `invoiceRefNo` = the original DI number |
| Penalty | Not integrating: Rs 1 million, then sealing; input tax cut 15%. Skipping the system: up to Rs 500,000 or 200% of the tax, and jail up to 2 years. **The software vendor who allows skimming is liable too** | Per the SROs (vendor guides differ — confirm) |

**The owner's sample is system A** (a Tier-1 POS receipt). It shows:
- NTN, STRN, date and time, cashier, shift, POS / counter;
- the lines;
- "Total Excl. GST", "GST Total", "Sub Total", "Grand Total", payment, change;
- GST by schedule ("3rd Schedule");
- the amount in words;
- the QR code with the FBR invoice number.

## 2. What it means for a mobile shop

| What the shop sells | Sales tax on the shop's bill | DI sale type / scenario |
|---|---|---|
| **Mobile phones** | **Ninth Schedule: sales tax is paid by the importer / manufacturer only, and none is charged on later supplies.** The retailer may pass on the tax it paid in its price. The FBR FAQ says this in so many words | "Mobile Phones" (SN015) |
| Chargers, covers, cables, other accessories | Standard rate. This was 17% in the 2020 FAQ; vendor guides now say 18% — confirm | "Goods at standard rate" — SN026 for sale to the end consumer by a retailer |
| Items with a printed retail price (3rd Schedule) | Tax on the retail price | "3rd Schedule Goods" — SN027 |
| **Repairs** | A service. Provincial sales tax on services (PRA / SRB / KPRA / BRA), **not FBR** | — (FBR's "Services" scenarios are for FED / ST mode; repairs follow the province) |

So for most phone sales the FBR line shows **no tax added**, but the sale is still reported (and for Tier-1 shops the invoice still carries the FBR number and QR). Accessories carry GST. That matches what we already built: a per-item GST % on taxed bills (ADR from 2026-11-03). What is missing is the **tax category per line** and the **transmission**.

Who among our customers must do this:
- Most mobile shops in Pakistan are small and **not Tier-1**, but shops in air-conditioned plazas / malls (many mobile markets) and chains **are**.
- Registered businesses that sell to other businesses (wholesale dealers) fall under DI.
- For the rest, a clean tax invoice (NTN, STRN, GST split, amount in words) is a nice-to-have.

## 3. Our receipt today vs. the sample

| On the sample | In our app today |
|---|---|
| Shop name, address, phone, NTN, STRN | ✅ business profile (docs/30) |
| FBR POS ID | ✅ printed when set (Settings → Tax registration) |
| Date, **time**, invoice no. | date and no. ✅; time — check per template |
| Cashier, counter / shift | ❌ cashier name not on the bill |
| Lines: name, price, qty, amount | ✅ |
| Total excl. GST / GST total / grand total | partly: subtotal, discount, "Tax 18%" or "Tax (by item)", total |
| GST by schedule / category | ❌ |
| Payment method, **change** | method ✅, change ❌ |
| Amount **in words** | ❌ |
| **FBR invoice number + QR** | ❌ (`invoices.fbr_invoice_no` column exists, nothing fills or prints it) |
| POS service fee Re 1 | ❌ |
| DI logo | ❌ |

## 4. Proposed design (to build after the owner's go-ahead)

Rules:
- Additive only, **off by default per shop**, and nothing about a bill changes for a shop that does not switch it on (ADR-048 style).
- Credentials (POS ID, DI token) are stored server-side only and never sent to the browser or the APK.

1. **Shop setting "FBR"**: Off / POS integration (Tier-1) / Digital Invoicing, plus sandbox or production. Fields: POS ID (IMS) or DI token, NTN / STRN (already there), province, and the business activity (retailer / distributor) that sets the allowed scenarios.
2. **Tax category per item and phone line**:
   - Mobile phone (Ninth Schedule, no tax added);
   - Standard rate;
   - 3rd Schedule (retail price);
   - Exempt;
   - Service (repair, provincial).
   Each with its PCT / HS code (phones `8517.1300` — confirm) and unit of measure. Defaults: phones and tablets with SIM → Mobile phone; accessories → standard rate.
3. **Transmission queue**:
   - A paid bill is posted to FBR right away. Offline or on error it waits in a queue and is retried (the app already works offline).
   - The bill keeps its own number; the FBR number is added when it arrives, into `fbr_invoice_no` plus a new status / response log table.
   - Never re-posted once accepted (IMS `Code 100` / DI `statusCode 00`).
   - Returns post as credit notes against the original number; voids likewise. Nothing is deleted.
4. **Printing**:
   - FBR invoice number, QR (version 2, 1 × 1 inch), the FBR POS or DI logo;
   - GST split by category, total excl. tax, the Re 1 POS fee (IMS shops), amount in words, cashier, time, change.
   - A bill waiting for its FBR number prints "FBR number pending" and can be reprinted later.
5. **Screens**:
   - Settings card with a "Test connection (sandbox)" button;
   - per-bill FBR status (sent / waiting / rejected with FBR's message);
   - a "waiting for FBR" list;
   - the shop audit Tax tab gains FBR-reported totals.
6. **Tests**: sandbox scenarios SN026 / SN027 / SN015 and a credit note; a unit test that the JSON totals equal the bill to the paisa (`billTax` already mirrors server rounding).

## 5. What we need from the owner before building

- [ ] A test business with **NTN + STRN** and IRIS access, to get:
  - a **DI sandbox token** (IRIS → Digital Invoicing → integration / sandbox), and/or
  - a **test POS ID** (IRIS → POS client registration, sandbox).
- [ ] A tax adviser's confirmation of:
  - the current standard rate;
  - phones under the Ninth Schedule at retail;
  - PCT codes;
  - whether repairs bills need the provincial (PRA / SRB) system too.
- [ ] Which customers to target first: Tier-1 plaza shops (POS / IMS) or registered dealers (DI). The recommendation is **DI first**: it is FBR's current direction, it has a documented 2025 spec and a sandbox, and IMS can follow with the same queue.

## 6. Without FBR credentials we can already do (small, safe)

- On every bill:
  - the amount in words;
  - the cashier's name and the time;
  - "Total excl. tax / Tax / Grand total", split by tax category when there is tax;
  - change given.
- The tax category on items, with phones defaulting to "Mobile phone (tax paid at import)" and no tax added.

## Sources
- FBR, POS Integration — Frequently Asked Questions: https://download1.fbr.gov.pk/Docs/20201201313212651FAQs-POSIntegration.pdf
- PRAL, Technical Specification for DI API (2025): https://download1.fbr.gov.pk/Docs/20256201364855300TechnicalDocumentationforDIAPI.pdf
- Re 1 POS service fee: https://www.brecorder.com/news/amp/40113971 · https://propakistani.pk/2021/10/01/fbr-imposes-service-charges-on-pos-invoices-for-monitoring-sales/
- SRO 709(I)/2025 overview (vendor): https://taxit.pk/blog/sro-709-explained-for-business-owners
- Tier-1 POS integration guides (vendor): https://bacoconsultants.com/blogs/fbr-pos-integration-tier-1-retailers-2026 · https://amalerp.com/blog/fbr-pos-integration-tier-1-retailers
- IMS / POS developer notes (community): https://github.com/RKUsamaAli/FBR-Integration-Kit
