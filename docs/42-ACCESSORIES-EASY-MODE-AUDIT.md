# 42 · Accessories — Easy Mode audit (owner brief 2026-11-21)

The owner sent a long specification ("Accessories Shop Purchase, Inventory & Sales Module") with
one instruction on top: **understand the existing accessories module from the shopkeeper's side,
find every screen where he struggles or types what he should not have to, and reorganise what
exists into an Easy Mode — advanced fields under expandable sections — without removing anything
and without building a parallel module. Purchase first.** Two complaints came with it (§1).

This is the audit the brief asks for before code, the phase that was built with it, and what is
left for the owner to order. It continues `docs/40-ACCESSORIES-MODE-AUDIT.md` (2026-11-19).
Decision record: ADR-123. Marks: ✅ exists · 🟡 partly · ❌ missing · ➕ built in this round
(2026-11-20 / 21: ADR-118, 121, 122, 123).

## 1. The two complaints, as seen on the screen

Looked at as an accessories-only shop on a phone-sized screen (screenshots taken, then removed).

| Complaint | What was on the screen | Cause | Now |
|---|---|---|---|
| "Accessories are not in Stock; we found them under the options." | `/stock` showed the phones' screen — IMEI search, "Check IMEI", "All stock 0", "Available to sell 0", an empty list — with **Accessories** as one chip among others. | The bottom tab went to the items (ADR-109), but every other way to "Stock" (the Home chip, a link, the browser's back) opened the phones' screen. | ➕ A shop without phones and laptops has one stock: `/stock` opens its items from any link, the screen is titled "Stock", there is no "All stock" chip. |
| The same, in a shop that has mobiles too | "All stock" listed and counted only devices; its search did not find an accessory. | Devices and items are two lists. | ➕ On "All stock" the accessories are a block above the phones — pieces in stock, low, finished, the first items with their count — and the search box finds them. |
| "On Purchase we see *From a dealer* and *Buy a customer's phone*, and *Add device* — we deal only in accessories." | With mobiles ticked for the shop: both source cards and "Add device". With only accessories ticked: one card, "From a dealer", still asked as a question. | (a) **That shop still has Mobiles ticked** — the provider must untick it (three ticks in `/control`, ADR-122); this cannot be done from the code. (b) A question with one answer. | ➕ (b) An accessories shop is asked "Which dealer did you buy from?" straight away. (a) is on the owner's list (docs/29). |
| — found while looking | The sale's first step said "Which phone?" in an accessories shop. | One wording for every shop. | ➕ "What are you selling?" |

## 2. Where a shopkeeper struggled, screen by screen

| Screen | Struggle | State |
|---|---|---|
| Purchase → what was bought | Two buttons that read alike (stock item / typed line); sixteen kind chips before anything; "Nothing found" for a new shop | ➕ ADR-121: one search (own items + built-in list), chips only for a long list, a hint under the typed line |
| Purchase → new item | A third screen with every field of the product card; pieces and cost asked afterwards on the bill | ➕ ADR-121: four numbered steps, the rest under "More details", pieces and cost asked there |
| New item — writing the card | Name, kind, brand, watts, connector typed by hand for every item | ➕ ADR-118: 2,480 built-in lines and "… for <model>" lines fill the card |
| One product in several colours | One unrelated item per colour, typed each time | ➕ ADR-118: variants ticked once, each its own stock |
| Stock | §1 | ➕ ADR-121 / ADR-123 |
| Purchase → from whom | §1 | ➕ ADR-123 |
| Sale → first step | "Which phone?"; two buttons that read alike (item / typed line) | ➕ wording; the two buttons are 🟡 (the typed line is used by shops — kept) |
| Items → New item (outside a purchase) | The full card on one screen | ➕ ADR-126: the same four numbered steps |
| Item page | Long: card, kinds, batches, timeline | ➕ ADR-126: lots and history start short; the details card is as it was |
| Home (accessories shop) | Fine: "Items in stock", Sell, Add stock | ✅ |

## 3. The specification, section by section

Not re-verified line by line in this round where marked †: taken from docs/24, docs/25, docs/40 and the ADRs.

| § | Asked | State | Where / note |
|---|---|---|---|
| 2 | Do not rebuild; no second accounting or stock engine; additive migrations | ✅ | one ledger, `accessories` + batches + movements; migrations `a3c5e7f9b1d2`, `b4d6f8a0c2e4` additive |
| 4 | Product: name, SKU auto, barcode auto / typed, kind, brand, fits, description, active | ✅ | product card (ADR-037) † |
| 4 | Product image | 🟡 | `image_path` exists; no upload in the item form † |
| 4 | Colour, size, quality, warranty, wholesale / minimum / promo price | ✅ | under "More details" † |
| 4 | Custom attributes; attributes shown by category | 🟡 | ADR-127: a new item is asked its kind's own details (watts and plug, the phone it fits …); attributes the shop defines itself are ❌ |
| 4 | Variants, each its own SKU, barcode and stock | ➕ | ADR-118; colour and size together since ADR-127 |
| 4 | Categories: create, edit | ✅ | sixteen kinds + the shop's own word |
| 4 | Sub-categories; activate / deactivate a category | ❌ | one level |
| 5.1 | Supplier: search by name / phone, create inside the wizard | ✅ | `PartyPicker` |
| 5.1 | Supplier balance and past purchases shown while picking | 🟡 | on the person's page, one tap away; not inside the picker |
| 5.1 | Supplier bill number, notes | ✅ | under "Discount, bill no." † |
| 5.2 | Category cards before the product | ➕ | ADR-124 (owner 2026-11-21: "search bhi rakho aur category ka card bhi"): the kinds are cards under the search — a second way in, not a forced step |
| 5.3 | Existing product: search, scan, one tap onto the bill, quantity and cost | ✅ | |
| 5.3 | New product inside the purchase, SKU and barcode made by the system | ➕ | ADR-121 |
| 5.3 | Per line: quantity, cost, selling price, expected profit | ➕ | ADR-124: under each item line — what the line comes to, what a piece sells for and earns (the selling price itself is changed on the item) |
| 5.3 | Line discount | ➕ | ADR-124: an amount off one line, folded under "+ Discount on this line" |
| 5.4 | Many products, several kinds, one bill; edit / remove a line | ✅ | |
| 5.5 | Summary; paid now, part, or on credit | ✅ | † |
| 5.5 | Several payment methods on one purchase | 🟡 | not checked in this round |
| 5.5 | Freight / other expenses, in the stock cost or as an expense | ✅ | **corrected 2026-11-21**: it exists — "Freight / loading" under "Discount, bill no.", spread over the lines into the stock cost (`extra_costs`, owner addendum 5). The first version of this table said ❌; that was wrong |
| 5.5 | Tax on a purchase | ❌ | a stated limit of the product (no purchase tax) |
| 5.6 | Review before saving; atomic posting | ✅ | the review sheet with its tick; one transaction |
| 5.6 | Save as draft | ✅ | the wizard keeps what was typed until saved or cleared |
| 5.6 | A saved purchase is corrected by reversal, not edited in place | ✅ | ADR-099 / correction of a bill † |
| 6 | Auto-next: dealer → items → quantity → cost → next item | 🟡 | a tap on an item puts it on the bill; a new item's form asks pieces and cost in order; focus does not jump field to field |
| 7 | Easy Mode: big buttons, few required fields, automatic totals, plain words, advanced under a fold | 🟡 → ➕ | done for the purchase; item page and the items' own "New item" still the full card |
| 8 | Quantity stock apart from IMEI stock; every change a movement with its document | ✅ | `stock.py` † |
| 8 | Low / out alerts, adjustments with a reason, count, valuation, branch transfer | ✅ | † |
| 9 | Units: piece / dozen / box / carton, stock always in pieces | ✅ | buying; selling by box is 🟡 (pieces are typed) † |
| 10 | Fast sale: scan, search, cart, customer, discount, part payment, udhaar, hold, receipt | ✅ | the sale screen; on a phone it is three steps, on a wide screen one page † |
| 10 | Retail / wholesale price by customer | ✅ | † |
| 11 | Sale return, return to supplier, reasons, condition, linked to the bill | ✅ | ADR-097, ADR-101 † |
| 11 | Exchange of one accessory for another | 🟡 | a return plus a sale; the Exchange screen is for an old phone coming in † |
| 12 | One accounting engine, balanced entries, source reference on each | ✅ | † |
| 13 | Purchase, sales, stock and profit reports | ✅ | Reports list (ADR-111), Accessories → Reports † |
| 13 | By category; retail against wholesale | 🟡 / ❌ | docs/38 phase 2 † |
| 14 | Module on / off per shop; tenant isolation | ✅ | ADR-109, ADR-122 |
| 14 | A permission per action (apply discount, override price, adjust stock …) | ❌ | four roles (owner, manager, salesman, technician) with fixed rights and the price rules of `sale_rules` |
| 16 | Thermal receipt, A4 bill, preview, PDF | ✅ | † |
| 17 | Plain validation messages; no stock below zero unless allowed | ✅ | † |
| 19 | Tests | ✅ for what was built | each ADR lists its tests; the full backend suite passed on 2026-11-21 |

## 4. What was built in this round (Phase A — purchase and stock made easy)

ADR-118 (built-in list, variants), ADR-121 (one search, four-step form, stock chips with counts),
ADR-122 (three ticks for what a shop trades, "not in your package"), ADR-123 (stock is the items
for an accessories shop, accessories inside "All stock" and its search, no "where from" question,
"What are you selling?"). No existing screen, route, button or field was removed; nothing in the
books or in stock handling changed.

## 5. What is left — for the owner to order

1. **Phase B — the rest of the purchase**: ➕ done 2026-11-21 (ADR-124): what a line comes to, what
   a piece sells for and earns, a discount per line; freight already existed. Still open: the
   supplier's balance inside the picker; focus that moves field to field.
2. **Phase C — items outside a purchase**: ➕ done 2026-11-21 (ADR-126): the four-step form for
   "New item" on the items' screen; the item page shows the variant in its header and starts the
   lots and history short. Still open: a picture for an item.
3. **Phase D — the product master**: ➕ done 2026-11-21 (ADR-127): details by kind in the new-item
   form; colour and size together, a pair per item. Still open: sub-categories.
4. **Phase E — selling**: sell by box / carton with the unit on the bill; accessory-for-accessory
   exchange in one screen; quantity-tier prices.
5. **Phase F — rights**: a permission per action.
6. **Category cards** (spec §5.2): ➕ done 2026-11-21 (ADR-124), under the search.

Each phase is additive and off for a shop until it is used; none needs a destructive migration.

## 6. Risks, deployment, rollback (this round)

- **Risk to live shops**: no data or posting change. Visible changes for an ordinary mobile shop:
  the accessories block above the phones on "All stock" (three rows), the counts on the type
  chips, and one locked chip for a line it does not have.
- **Migrations**: none in ADR-121 / 122 / 123 (ADR-117 and ADR-118 added one nullable column and two).
- **Rollback**: redeploy the previous version; nothing stored depends on the new screens.
