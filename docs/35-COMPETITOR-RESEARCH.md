# 35 · Competitor research — Pakistani mobile-shop / POS software (2026-11-04)

Owner asked to explore HysabOne, Moneypex, BluePrimes and the Capterra POS listings. Everything below
comes from the vendors' own public pages (marketing claims, not tested) and Capterra, read on
2026-11-04. Prices change; check again before quoting them to a customer.

## 1. Who they are

| | HysabOne | Moneypex | BluePrimes | Mobile Shop (ours) |
|---|---|---|---|---|
| What it is | Cloud accounting + inventory, with industry pages (mobile shop, electronics, pharmacy…) | General POS with industry pages (retail, mobile shop, pharmacy, restaurant, shoes) | Offline desktop POS + online suite, 12 modules (accounting, retail, pharmacy, hotel, fuel…) | Built only for mobile shops |
| Price (from) | **Rs. 3,499 / month** on the mobile-shop page; the POS page says **Rs. 6,563 / month billed yearly** (the two pages disagree) | **Rs. 1,500 / month** (retail POS page) or **Rs. 2,500 / month** (mobile-shop page) + paid add-ons; 10% off yearly | Not published ("save 90% on the first year" offer, demo on WhatsApp / Zoom) | **Rs. 1,500 / 3,000 / 6,000 a month** (basic / pro / chain); yearly = 10 months |
| Add-ons | — | Inventory Rs. 1,000, user Rs. 500, extra shop Rs. 1,500, extra terminal Rs. 1,000, label printing Rs. 500, stock app Rs. 500, FBR Rs. 1,000 (each a month) | — | None; the plan decides the modules |
| Trial | 14 days, no card | 7 days | 15 days | 14 days |
| Users | Unlimited | Rs. 500 per extra user | — | By plan |
| Claimed customers | "500+ Pakistani businesses" | "thousands of retailers" | "1,000+ retailers and wholesalers" | — |

> A Moneypex shop that needs inventory, 2 extra users, labels and FBR pays about
> Rs. 2,500 + 1,000 + 1,000 + 500 + 1,000 = **Rs. 6,000 a month**. On our pricing the same shop is on
> **pro, Rs. 3,000**. That makes a good line for sales.

## 2. Mobile-shop features, side by side

✅ = claimed on their page · — = not mentioned · ours from the code / `docs/06-PROGRESS.md`.

| Feature | HysabOne | Moneypex | BluePrimes | Ours |
|---|---|---|---|---|
| IMEI on purchase and sale, search by IMEI | ✅ | ✅ (several IMEIs per item) | — | ✅ IMEI 1 + 2, scan, "seen before?" check |
| Full phone history (purchase → sale → return → repair) | ✅ "track phone history" | ✅ "purchase to sale" | — | ✅ immutable device events, own page per phone |
| Used phones bought from customers | mentioned only | "tracks used phones" | — | ✅ |
| CNIC check, seller photo, signed declaration | — | — | — | ✅ **unique**: CNIC scan, photos, eGadget, on-screen signature, printed declaration |
| PTA / Non-PTA / JV, lock checks (iCloud / FRP) | — | — | — | ✅ **unique** |
| Repairs (job card, status, technician) | ✅ | ✅ tickets, quote, status | — | ✅ + **outside repair labs** with trips and charges, repair sticker |
| Installments (qist) | ✅ EMI, reminders | ✅ | — | ✅ with reminders |
| Trade-in / exchange | ✅ | margins on trade-ins | — | ✅ exchange flow |
| Warranty | ✅ claims | ✅ dates stored | — | ✅ warranty until, checked by invoice / scan |
| Accessories by piece / dozen / box, batches | ✅ (no detail) | ✅ inventory add-on | ✅ inventory | ✅ FIFO batches, units, minimum price |
| Udhaar khata, len-den (money with no bill) | ledgers | "credit" | accounting ledgers | ✅ khata + **len-den** + WhatsApp reminders |
| Loans of phones to other shops (amanat) | — | — | — | ✅ **unique** |
| Shop audit (every figure opens its rows) | reports | analytics | trial balance | ✅ 13-tab audit |
| Urdu interface | — | — | — (Roman Urdu in marketing only) | ✅ **Urdu (Nastaliq) + English + Roman**, "?" help in all three |
| Offline | ✅ POS syncs later | ✅ offline mode; offline desktop = custom quote | ✅ offline desktop is their core | ✅ PWA offline + one-PC Windows version |
| Mobile app | ✅ iOS + Android (dashboard, 12 reports) | stock-tracking app (Rs. 500 add-on) | — (offline POS is a zip download) | ✅ full app on Android (APK), PWA on iPhone; **not on Play Store yet** |
| WhatsApp messages to customers | notifications | — | — | ✅ receipts, reminders, night report |
| **FBR / PRA live e-invoicing** | "FBR-ready records" | ✅ **FBR digital invoicing + PRA** (Rs. 1,000 add-on) | ✅ **real-time FBR POS / e-invoicing** | ⚠️ **gap**: NTN / STRN / FBR POS ID on bills and a manual FBR invoice no.; live sending to FBR (PRAL) not built |
| Multi-branch, stock transfer between branches | ✅ per-branch stock + transfers | extra shop add-on | ✅ multiple branches | ✅ branches + switcher; ⚠️ phone / stock transfer between branches not confirmed |
| Accounting (chart of accounts, trial balance) | ✅ core strength | — | ✅ | partial: cash / bank accounts, ledger, P&L, audit; no chart of accounts / trial balance |
| User guide in three languages | — | — | — | ✅ PDF user manual en / ur / roman (2026-11-03) |

## 3. Global names on Capterra (for reference)

The Capterra "cell phone / repair POS" listings are US / Europe products with few reviews. They are
not sold for Pakistan, and none has Urdu, PKR, udhaar or CNIC verification.
- **CellSmart POS**: 4.5 / 5 from 18 reviews; cell-phone retail, inventory and repair tracking.
- **RepairDesk**: repair-shop POS, with Pakistani roots and an engineering team in Lahore.
- **CellStore**, **Repair Spots**, **RepairFlow**, **RO App**: repair-ticket POS, ratings from very few users.

## 4. What this means for us

**Where we are clearly ahead** (say these on the landing page and in sales calls):
1. Verification of used phones: CNIC, photos, eGadget, PTA, lock checks and the seller's on-screen signature. No Pakistani competitor shows any of it.
2. Urdu (Nastaliq) as a real interface, plus Roman, with "?" help and a three-language manual.
3. Things only a phone shop needs: amanat to other shops, outside repair labs, len-den, a history for every phone.
4. Price: everything in one plan from Rs. 1,500 / 3,000. Moneypex reaches Rs. 6,000+ once add-ons are counted, and HysabOne starts at Rs. 3,499–6,563.

**Gaps worth closing** (owner to decide the order):
1. **FBR / PRA live e-invoicing (PRAL)**: Moneypex and BluePrimes sell it. Larger shops in tier-1 cities that must report will ask for it. Already listed as ❌ in `06-PROGRESS.md` (FR-TAX-04).
2. **Play Store listing**: HysabOne has iOS and Android apps in the stores. Our Android app is a direct APK (see `29-OWNER-PENDING.md` G).
3. **Stock transfer between branches**: for chain-plan owners (to confirm, then build if missing).
4. **Simple accounting reports** (trial balance, chart of accounts) for shops whose accountant asks, as the HysabOne / BluePrimes market expects.
5. **Social proof**: competitors show customer counts and logos; our landing has none yet. Add numbers and 2–3 shopkeeper quotes once real shops are live.
6. **Trial without a card / instant start**: HysabOne says "setup in 10 minutes". Our shops are opened by the super admin from a request, so a quick reply on WhatsApp matters.

## 5. Recommended updates, in order (owner question 2026-11-04)

Rule for every item: additive only. Every item is a new table or column, a new screen or a new tab, and anything that changes behaviour is behind a per-shop switch that is off by default. Existing flows, data and tests stay as they are; one release per item.

| # | Update | Why (competitor) | Size | Why it cannot break anything |
|---|---|---|---|---|
| 1 ✅ 2026-11-04 | Accounting reports: trial balance, balance sheet (cash-flow per account already existed) | HysabOne and BluePrimes sell "accounts" | small | read-only, derived from the existing ledger; a new tab |
| 2 ✅ 2026-11-04 | Phone / accessory transfer between branches | HysabOne branch transfers | medium | a new device event "transfer"; accessories move their oldest batch; sale and purchase untouched |
| 3 | Play Store release | HysabOne has store apps | medium | build and pages only (API 36, AAB, privacy / deletion); the app screens do not change |
| 4 | FBR / PRA live e-invoicing | Moneypex and BluePrimes | large | per-shop switch, off by default; bills without it print as today; queued when offline |
| 5 ✅ 2026-11-05 | Repair status link for the customer | HysabOne customer notifications | small | a public read-only page by REP number; the repair flow is unchanged |
| 6 | Landing: customer count, quotes, faster trial | every competitor shows social proof | small | landing content; a self-start trial only if the owner wants it (OTP already exists) |

Not to copy: per-add-on pricing (Moneypex) — keeping everything in one plan is our advantage.

## Sources
- HysabOne mobile shop: https://hysabone.com/industries/mobile-shop/
- HysabOne POS / pricing: https://hysabone.com/pos-software-pakistan/
- Moneypex mobile shop POS: https://moneypex.com/pk/mobile-shop-pos-software
- Moneypex retail POS: https://www.moneypex.com/pk/retail-pos
- BluePrimes: https://blueprimes.com
- Capterra CellSmart POS: https://www.capterra.ca/software/150535/cellsmart-pos
- Capterra CellStore: https://www.capterra.com/p/157041/CellStore-Software/reviews/
