# 40 · Accessories business mode — audit, what was built, what is left (owner brief 2026-11-19)

The brief ("Accessories Business Mode") asks to extend the live software for accessories-only
shops, mobile + accessories shops and wholesale accessory businesses — audit first, reuse what
exists, build only proven gaps, never disturb the shops that are live. The owner's own priority
for now: *whoever wants accessories with mobiles gets it ticked in Super Admin; whoever wants
accessories alone (three or four shops have asked) gets that; the same for laptops.* Decision
record: ADR-109. This is the report the brief asks for after phases 1 and 2.

## 1. The four foundation questions

| Question | Answer | Evidence in the code |
|---|---|---|
| Does the inventory support several product types? | **Yes.** Two tracking strategies already live side by side. | Serialized units: `devices` (phone / tablet / watch / laptop by `category`, one row per IMEI or serial, immutable `device_events`). Counted goods: `accessories` (quantity in pieces, `accessory_batches` per incoming lot, `accessory_movements` for every change). A purchase or sale bill carries both kinds of line. |
| Is there a branch-wise inventory and stock-movement foundation? | **Yes, with limits.** | Every branch is a `shops` row with its own stock, khata and books inside one `organisations` row; `transfers` moves units and items between branches at cost through an equity account (never income). Limits: a transfer is immediate (no request / approval / in-transit state) and there is no "warehouse" type — a warehouse is a branch. |
| Can the accounting engine handle retail and wholesale? | **Yes.** | One append-only double-entry ledger for every document. An item has `price` (retail), `wholesale_price`, `min_price`, `promo_price`; a customer marked `wholesale` gets the wholesale price (`accessories/stock.py` price rule); cost is snapshotted on every bill line, so later cost changes never rewrite profit. Limit: no report splits sales into retail and wholesale. |
| Can a tenant-level feature configuration be added safely? | **Yes — it existed.** | `organisations.modules` (set per shop in the existing Super Admin, enforced by `admin/modules.assert_module` on the API and hidden in the app). The one missing switch was "this shop does not trade mobiles"; it is added as one more tick (§3). |

## 2. Brief versus the software

✅ exists · 🟡 partly · ❌ missing · ➕ added now.

| Brief § | Item | State | Where / note |
|---|---|---|---|
| 2 | Business profile: mobile-only (existing behaviour) | ✅ | every shop today; unchanged |
| 2 | Mobile + accessories | ✅ | module `accessories` (in every plan) |
| 2 | Accessories-only | ➕ | tick "Without mobiles" + `accessories` (§3) |
| 2 | Laptop-only, laptops + accessories | ➕ | tick "Without mobiles" + `laptops` (ADR-108) |
| 2 | Configured in the existing Super Admin, enforced on the API | ➕ | same module ticks; `new_device` refuses a phone |
| 2 | Sales model retail / wholesale / both | 🟡 | works per customer (`parties.wholesale`); not a shop-level setting |
| 2 | Location model: single shop, branches | ✅ | shops in one organisation; My shops |
| 2 | Warehouses | 🟡 | a warehouse is a branch; no separate type |
| 3 | The "Accessory or watch bought" form and every field listed | ✅ | `accessories` product card (ADR-037): name, kind (+ own kinds), prices, reorder, brand, colour, fits, quality, size, capacity, connector, watts, warranty and by whom, pieces per box / carton, fixed or markup pricing, wholesale / minimum / promo price, GST, maximum stock, shelf, notes, supplier codes |
| 3 | Sections, category-dependent fields | 🟡 | the form folds the extra fields under "More details"; not split by kind |
| 3 | SKU and barcode per item, supplier codes, preferred supplier | ✅ | `sku`, `barcode` (ADR-036), `accessory_supplier_skus` |
| 3 | Parent product with variants (colour / connector / model) | ➕ | ADR-118 (2026-11-20): variants are items of one group (`variant_group`, `variant`), made together or added later; a built-in list of 2,480 accessories fills the card |
| 3 | Subcategories | ❌ | one level of kinds (the shop adds its own) |
| 3 | Creating a product does not add stock; opening stock explicit | ✅ | `opening_qty` is a separate, explicit field (tested: a new item has 0) |
| 4 | Quantity tracking for accessories, IMEI / serial for devices | ✅ | as above |
| 4 | Batch tracking | ✅ | `accessory_batches`; oldest leaves first |
| 4 | Units: piece / box / carton / own units, conversion to pieces | ✅ | `pack_units`, `shops.item_prefs.units`; stock is always pieces |
| 4 | Unit and factor kept on the purchase line | ✅ | `purchase_lines.pack_unit / pack_qty` |
| 4 | Selling by box / carton | 🟡 | sold in pieces (the count is typed); no unit chooser on the sale |
| 4 | One stock-movement service, no direct quantity writes | ✅ | `accessories/stock.py` |
| 5 | Cost, retail, wholesale, minimum, promo, fixed or markup, GST | ✅ | item card; price history `accessory_price_changes` |
| 5 | Quantity-tier pricing (1–9, 10–49, 50+) | ❌ | only retail / wholesale / promo |
| 5 | Customer-specific prices | ❌ | only the wholesale flag per customer |
| 5 | Minimum-price rule with permission | ✅ | `below_asking` rule; below cost needs the owner |
| 5 | Costing method inspected, not assumed | ✅ | weighted average or FIFO per shop (`item_prefs.valuation`) |
| 6 | Supplier, supplier bill no., date, cost, payment, credit, balance, history | ✅ | purchases + khata |
| 6 | Partial receiving of an order | ❌ | a purchase is received in full when saved |
| 6 | Several suppliers per product | ✅ | supplier codes per supplier |
| 7 | Sale: search by name / SKU / barcode, scanner, kind filter | ✅ | sale screen, `useScan` |
| 7 | Retail / wholesale price by customer, discounts with permission | ✅ | |
| 7 | Cash, bank, wallets, credit, partial payment, receipt, history | ✅ | |
| 7 | Compatibility ("fits") search | 🟡 | free text and linked models on the item; not a sale filter |
| 8 | Sale return, purchase return, partial, exchange, reasons, condition | ✅ | ADR-097, ADR-101 |
| 8 | Return preview and reversal preview from the real posting | ✅ | ADR-102 (`returns/preview.py`) |
| 8 | Undo as compensating entries, no double reversal, dependents checked | ✅ | ADR-099, ADR-100 |
| 9 | Branch stock, transfers at cost, no revenue on a transfer | ✅ | ADR-046 |
| 9 | Transfer request / approval / in-transit | ❌ | a transfer is immediate |
| 9 | Branch permissions | ✅ | a user sees only the shops he is linked to |
| 9 | Consolidated report over branches | ❌ | also listed in docs/38 |
| 10 | Sales, purchases, profit, best sellers, slow / dead stock, low stock, valuation, balances, returns, expenses, cash flow, staff | ✅ | Reports, Shop Audit, Accessories → Reports |
| 10 | Retail versus wholesale report | ❌ | docs/38 phase 2 |
| 10 | Overstock (above maximum stock) | 🟡 | `max_stock` is stored; no report line |
| 11 | Focused accessories navigation and home | ➕ | §3 |
| 12 | Tenant isolation, roles, audit log | ✅ | every query by `shop_id`; `audit_log` |

## 3. What was built now (phases 1 and 2)

**One new switch, in the existing module list: "Without mobiles (accessories / laptops only)"**
(`no_mobiles`). It is never part of a plan and is absent for every existing shop, so nothing
changes for them. The provider's ticks now describe what a shop trades:

| Shop | Ticks in Super Admin → the shop → Modules |
|---|---|
| Mobile shop (as today) | nothing to do |
| Mobiles + accessories | "Accessories" (already in every plan) |
| Mobiles + laptops | "Laptops" |
| Accessories only | "Accessories" + "Without mobiles" |
| Laptops only | "Laptops" + "Without mobiles" |
| Laptops + accessories | "Laptops" + "Accessories" + "Without mobiles" |

- **Server.** `admin/modules.lines(org)` says what the shop trades. A shop without mobiles cannot
  add a phone, tablet or smart watch (`new_device` → 403 `module_off`, on old stock and on a
  purchase bill). "Without mobiles" with neither accessories nor laptops is refused. A package
  bought on the fees page no longer removes what only the provider switches (laptops, login
  activity, without-mobiles) — before, such an order would have taken them away.
- **App, for a shop without phones and laptops (accessories only).** Home searches items and shows
  "Items in stock"; the Stock tab, the Stock job and F6 open the items; Add stock has only "From a
  dealer" and "Add accessory" (no device, no locked phone, no "Buy a customer's phone"); Sell
  starts on the items; the More page has no IMEI search, phone stock, old phone stock or brand /
  model list; the words say "stock" and "items", not "phone".
- **App, for a laptop-only shop.** The same wording; the device form offers only Laptop; the stock
  and sale filters show only Laptops.
- **Nothing is deleted or hidden on the server.** A shop switched to "without mobiles" keeps the
  phones it has and can still sell them; switched back, it is a mobile shop again.

Tests: `tests/test_business_lines.py` (5), `e2e/accessories-only.spec.ts`.

## 4. What is left — proposed phases (the owner orders them)

1. **Accessories for every kind of device.** A "made for" on an item (mobile / laptop / tablet /
   watch / any) with a filter, and built-in kinds for laptop goods (laptop charger, battery, bag,
   keyboard, mouse, RAM, SSD, screen, adapter). Today a shop adds its own kinds and writes "fits".
2. **Variants.** One product with colour / connector / model variants, each its own SKU, barcode
   and stock. The biggest gap for cover and glass sellers.
3. **Wholesale selling.** Quantity-tier prices per item (configurable thresholds), selling by box /
   carton with the unit kept on the bill line, a retail-versus-wholesale report.
4. **Customer-specific prices.**
5. **Transfers with request, dispatch, in-transit and receipt**; a warehouse as a kind of branch.
6. **Consolidated reports over branches**; overstock line.
7. **Purchase orders with partial receiving.**
8. **An accessories dashboard of its own** (top items, low stock, dead stock on the first screen)
   and the add-item form split by kind.

## 5. Risks, deployment, rollback

- **Risk to live shops:** none found. The switch is opt-in and absent everywhere; the tests walk
  every plan and a hand-picked module list and confirm a phone can still be added.
- **Migration:** none.
- **Deploy:** as always (backup first). **Rollback:** redeploy the previous version; a shop that
  was given "Without mobiles" would then show the mobile side again (the old code ignores the tick).
- **Known limits of this phase:** an accessories-only shop still meets the word "phone" in a few
  deeper screens (some report headings and help texts); the reports themselves are correct.
