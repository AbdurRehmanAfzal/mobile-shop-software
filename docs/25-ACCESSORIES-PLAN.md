# 25 · Accessories purchase parameters — audit, gap table, migration plan, status

Owner brief: `docs/24-ACCESSORIES-SPEC.md` (Addendum 5, 2026-10-31). Decision record: ADR-037 in
`docs/10-DECISIONS.md`. This file is the living plan: read it before touching
`backend/app/modules/accessories`, the misc lines of `purchases` / `sales`, or
`frontend/src/features/accessories`.

## 1. What existed before (audit, 2026-10-31)

| Area | Where | Fields / behaviour |
|---|---|---|
| Item master | `accessories` (`modules/accessories/models.py`) | `sku` (unique per shop, auto `NAME8-001`), `barcode`, `barcode_type`, `manufacturer_code` (ADR-036), `name`, `name_ur`, `category` (16 kinds + the shop's own words), `qty`, `avg_cost` (weighted average), `price`, `reorder_level`, `is_active` |
| Movements | `accessory_movements` | one row per change: `qty_delta`, `qty_after`, `reason` purchase / sale / repair / adjust / return / void, `unit_cost`, `document_type` + `document_id`, `note`, `user_id`, `at` — already append-only |
| Purchase line | `purchase_lines` | `kind=misc`, `accessory_id`, `description`, `qty`, `unit_cost`, `discount_share`, `net_cost`; stock moved at `net/qty`, INVENTORY debit; supplier, date, discount, paid / remaining on `purchases` + ledger |
| Sale line | `invoice_lines` | `accessory_id`, `qty`, `unit_price`, `discount_share`, `tax_share`, `line_total`, `cost` (= avg cost × qty → COGS), `warranty_days`; below-cost needs `below_cost_ok` + VIEW_COST |
| Returns / void | `returns/service.py`, `sales.void_invoice` | movements `return` / `void`, costs reversed |
| Screens | `AccessoriesPage`, `StockItemPicker`, `PurchaseWizard`, `SaleWizard` | name / kind / price / reorder / opening qty+cost; quick add in the purchase picker; qty guard in the sale |
| Reports | `reports/service.py` | top sellers group misc by `accessory_id`; stock summary / ageing are phones only |
| Settings | `shops.sale_rules` (ADR-030) | `below_asking` and `asking_change` rules (allow / manager / pin) — reused for the item minimum price |

## 2. Gap table (target §A–C vs. what existed)

| Field / behaviour | Exists today? | Where | Action |
|---|---|---|---|
| Name, category (shop can add) | yes | `accessories.name/category` | keep |
| Brand / manufacturer | no | — | **add** `brand` (indexed) |
| Compatible device / model | no | — | **add** `compatible` (free text) + `compatible_model_ids` (JSON links into the model list) |
| Quality grade | no | — | **add** `grade` (default `unspecified`; list configurable in `shops.item_prefs.grades`) |
| Variant: color, size, capacity, connector, wattage | no | — | **add** the five columns; a variant is its own row (own SKU, barcode, stock, prices) — no separate variant table |
| SKU auto / manual | yes | `sku` | keep |
| Manufacturer barcode / UPC | yes | `manufacturer_code` (ADR-036) | keep (reused as the UPC) |
| Internal barcode | yes | `barcode`, `barcode_type` | keep |
| Supplier SKU(s), several suppliers | no | — | **add** table `accessory_supplier_skus` (party_id, sku) |
| Warranty days / terms / by whom | partial | `invoice_lines.warranty_days` only at sale time | **add** `warranty_days`, `warranty_terms`, `warranty_by` on the item (the sale line pre-fills from it) |
| Unit of measure + packaging | no | `qty` was implicitly pieces | **add** `unit` (always `piece` = base), `pack_units` per item; shop table in `item_prefs.units` (dozen 12, box, carton); purchase line gets `pack_unit`, `pack_qty` |
| Cost per piece | yes | `avg_cost` | keep (weighted average); purchase batches keep every cost |
| Wholesale price | no | — | **add** `wholesale_price` |
| Retail price | yes | `price` | keep (= retail) |
| Minimum sale price | no | — | **add** `min_price`; below it → `sale_rules.below_asking` gate (manager / PIN), same as a phone under its asking price |
| Promo price + dates | no | — | **add** `promo_price`, `promo_from`, `promo_to` |
| Margin % / profit | partial | computed nowhere | **add** in the API output (`profit`, `margin_pct`, `stock_value`), not stored |
| Pricing by fixed amount or markup % | no | — | **add** `pricing_mode`, `markup_pct` (price recomputed from cost after each purchase, rounded to Rs. 10) |
| Tax class / GST, inclusive flag | partial | shop-level tax only | **add** optional `tax_rate`, `tax_inclusive` on the item (stored and shown; the invoice still uses the shop rate — see assumptions) |
| On-hand, reorder level | yes | `qty`, `reorder_level` | keep |
| Maximum stock | no | — | **add** `max_stock` (feeds the suggested order quantity) |
| Shelf / rack location | no | — | **add** `location` |
| Active / inactive | yes | `is_active` | keep |
| "Show in sale screen" | no | — | **add** `show_in_sale` |
| Image, notes | no | — | **add** `image_path`, `description` |
| Purchase: date, supplier, qty, cost, discount, paid, remaining | yes | `purchases` + ledger | keep |
| Purchase: supplier invoice number | partial | `purchases.reference` (free text) | **add** `supplier_invoice_no` (reference stays for anything else) |
| Purchase: unit (dozen / box) + auto cost per piece | no | — | **add** `MiscLineIn.unit`; the service converts to pieces and per-piece cost |
| Purchase: extra costs (freight) spread over lines | no | — | **add** `purchases.extra_costs`, `extra_costs_note`, `purchase_lines.extra_cost_share` |
| Purchase: batch / lot reference | no | — | **add** `purchase_lines.batch_ref` |
| Cost history per purchase, batches with "still left" | no | only the average | **add** table `accessory_batches` (qty_in, qty_left, unit_cost, party, date, document, pack); every incoming movement opens one, every outgoing one empties the oldest first |
| Valuation method setting (avg / FIFO) | no | — | **add** `shops.item_prefs.valuation`; FIFO costs the sale from the batches, average stays the default |
| Barcode + labels on purchase save | yes | ADR-036 | keep; "Print item labels" button on the purchase result |
| Quick-add inside the purchase | yes | `StockItemPicker` | keep; now the full `ItemForm` with "More details" |
| Duplicate detection | no | — | **add** `GET /accessories/similar` + warning box in the form |
| Immutable movements incl. adjustment with mandatory reason | partial | `note` optional | **change** `AdjustIn.note` required (≥ 2 chars) |
| Transfer between locations | no | — | **skip** — single-location shops; `location` is a shelf label, moving a box between racks is not a stock event |
| Product timeline (purchases from whom, paid / remaining, sales to whom, returns, adjustments, price changes) | partial | movements only | **add** `GET /accessories/{id}/timeline` + `accessory_price_changes` table |
| Customer / dealer pages include item purchases and sales | yes | statement, journey, documents | keep (purchases and invoices with misc lines already appear) |
| Sale: retail vs wholesale pre-fill | no | — | **add** `parties.wholesale` + `GET /accessories/{id}/price?party_id=` |
| Sale: asking / minimum / below-cost rules | partial | below-cost only | **add** minimum-price gate; below-cost now also checked for items |
| Sale: negative stock only if the setting allows | partial | always blocked | **add** `item_prefs.allow_negative_stock` |
| Warranty start / end per sold item | partial | `warranty_days` on the line | **add** `invoice_lines.warranty_until`; a claim is checked by invoice number or by scanning the item |
| Search by name / brand / model / SKU / barcode / supplier SKU | partial | name, name_ur, sku | **extend** `q` |
| Filters: category, brand, supplier, grade, low, out of stock, location | partial | category, low | **add** the rest |
| Reports: low stock by supplier, valuation, fast / slow, profit by category / brand, dead stock, supplier summary | no | — | **add** `/accessories/reports/*` + `AccessoryReportsPage` |
| Bulk import / export | yes | `docs/18`, `modules/bulk` | keep; item template gains the optional columns brand, grade, color, fits, wholesale price, minimum price, warranty days, shelf |
| Bulk price update by % | no | — | **add** `POST /accessories/bulk-price` |
| Bulk barcode label print | yes | ADR-036 label page | keep |

## 3. Migration plan (additive only, ADR-037)

Revision `a8b0c2d4e6f8_accessory_params` after `f7a9b1c3d4e6` (barcodes):

1. `accessories` + 28 nullable / defaulted columns (`grade='unspecified'`, `unit='piece'`,
   `warranty_days=0`, `pricing_mode='fixed'`, `show_in_sale=1`), index on `brand`.
2. New tables `accessory_batches`, `accessory_price_changes`, `accessory_supplier_skus`
   (all with `shop_id`, FK cascade on the item).
3. `purchases` + `supplier_invoice_no`, `extra_costs`, `extra_costs_note`;
   `purchase_lines` + `pack_unit`, `pack_qty`, `extra_cost_share`, `batch_ref`;
   `invoice_lines` + `warranty_until`; `parties` + `wholesale`; `shops` + `item_prefs`.
4. **Backfill** inside the migration: every item with `qty > 0` and no batch gets one batch
   `source=opening`, `batch_ref="Opening stock"`, `qty_in = qty_left = qty`,
   `unit_cost = avg_cost`, dated at its first movement. Idempotent (items with a batch are
   skipped); re-runnable even after a half-applied run on SQLite (every column / table / index is
   checked before it is added, nothing is ever dropped). `POST /accessories/backfill-batches`
   does the same later for any item that somehow has stock and no batch.
5. Nothing is renamed or dropped. Existing invoices, purchases, ledger entries and movements are
   untouched; `qty` keeps meaning pieces, `price` keeps meaning retail.

Deploy: `alembic upgrade head` (VPS, after the pull). Verified on the local dev DB: 57 items with
stock → 57 "Opening stock" batches.

## 4. What was built (2026-10-31)

Backend — `modules/accessories/stock.py` (new): prefs, units, price tiers, markup, batches (FIFO
consume), supplier SKUs, duplicate search, timeline, reports. `service.py`: `move()` opens / empties
batches, honours `allow_negative_stock`, puts the exact FIFO total on the movement; `create` /
`update` take the product card and log price changes. `router.py`: `/options`, `/similar`,
`/lookup`, `/bulk-price`, `/backfill-batches`, `/reports/{low-stock,valuation,movers,profit,
dead-stock,suppliers}`, `/{id}/price`, `/{id}/timeline`, `/{id}/batches`, list filters
`brand / grade / supplier_id / location / out_only / sale_only`. Purchases: `unit`, `batch_ref`,
`supplier_invoice_no`, `extra_costs` (spread like the discount, added to the supplier total and to
the item cost). Sales: tier price helper, minimum price → `below_asking` approval, below cost →
`below_cost_ok`, `warranty_until`, FIFO / average cost. Parties: `wholesale`. Shops: `item_prefs`.

Frontend — `features/accessories/{types.ts, ItemForm.tsx, AccessoriesPage.tsx,
AccessoryDetailPage.tsx, AccessoryReportsPage.tsx}`; routes `/accessories/:id`,
`/accessories/reports`; `StockItemPicker` uses `ItemForm` for the quick add; `PurchaseWizard`
unit chips (piece / dozen / box / carton with the per-piece cost), supplier bill no., freight,
"Print item labels"; `SaleWizard` dealer / promo / retail pre-fill that follows the customer,
minimum-price warning, negative stock per setting; `PartyForm` dealer switch; Settings → "Item
settings" card (valuation, negative stock, units). Strings in en / ur / roman.

Tests — `backend/tests/test_accessory_params.py` (9: five dozen → 60 pieces + supplier balance +
freight, weighted average + batches + timeline, pieces from a dozen + overselling blocked / allowed,
dealer price + minimum price approval + below cost, returns / adjustments keep rows, backfill
idempotent, supplier SKU lookup + duplicate warning, FIFO, markup + bulk price + reports);
`frontend/e2e/items.spec.ts`.

## 5. Assumptions (owner to confirm or change)

1. **Freight / loading is owed to the supplier** on the same bill (added to the purchase total and
   to the supplier's balance). If the transporter is paid separately, enter the bill without
   freight and record the transport as an expense.
2. **Minimum price uses the existing "below asking price" rule** (Settings → sale rules: allow /
   manager / PIN). Below *cost* keeps its own, stricter rule (owner / manager must confirm the
   loss) for items too.
3. **A variant is its own item** (own SKU / barcode / stock / prices), as the brief asks; there is
   no parent-child grouping. Brand + name + colour + capacity are the way to tell them apart,
   and the duplicate warning compares those.
4. **Markup pricing** rounds the sale price to the nearest Rs. 10 and recomputes it after every
   purchase that changes the average cost (the change is in the price history).
5. **Item GST rate is stored and shown but the invoice still applies the shop's tax setting**
   (per-line tax classes would change the FBR invoice totals and the tax report; left for an
   explicit decision).
6. **Promo price beats the dealer price** while its dates are running; dealer price beats retail;
   the seller can always overtype the price (the minimum-price rule still applies).
7. **FIFO** is a valuation setting per shop; it changes the cost put on new sales (and so the
   profit), not past invoices. Default stays weighted average.
8. **Negative stock** is off by default; when on, the extra pieces are costed at the average and
   the batch list shows nothing left.
9. **Transfers between locations** are not stock events (single-shop stock; `location` is a
   shelf label) — skipped.
10. **Supplier SKU lookup** is case-insensitive and may be narrowed to one supplier
    (`?supplier_id=`); the purchase picker's search box already matches it.
11. **Opening batches** are dated at the item's first movement (or today) and cost at the
    current average — the only cost known for old stock.
