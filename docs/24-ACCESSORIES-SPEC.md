# 24 · Accessories purchase parameters — owner brief (verbatim, 2026-10-31)

> Pasted by the owner as "ADDENDUM 5". Kept word for word; the current-field audit, the gap table,
> the migration plan, decisions and status live in `docs/25-ACCESSORIES-PLAN.md`.

## ADDENDUM 5: Accessories purchase parameters — audit existing fields FIRST, then upgrade

### 0. Do this BEFORE writing any code (mandatory)
1. Find how accessories (chargers, cables, covers, glass protectors, earphones/handsfree, power banks, batteries, speakers, memory cards, OTG, holders, etc.) are currently modeled and entered in this codebase: models/tables, purchase screen, stock screen, sale screen, invoice, reports, barcode (see previous addendum).
2. List the CURRENT fields in a table.
3. Compare them against the TARGET fields in section A below and output a gap table with these columns: Field | Exists today? (yes/no/partial) | Where | Action (keep / rename / add / migrate / skip, with a reason).
4. Show me this table and your migration plan, then proceed without waiting. Do not duplicate fields that already exist under another name; reuse them. Do not drop or rename existing columns in a way that loses data.

### A. TARGET accessory parameters (based on what mobile-shop POS/inventory systems track, plus needs of Pakistani shops)
Product (master) level:
- Name, category (charger, cable, cover/case, glass/protector, handsfree/earphones, Bluetooth device, power bank, battery, speaker, memory card/USB, holder/stand, other; shopkeeper can add categories), brand/manufacturer.
- Compatible device/model(s): free text + optional links to a model list (e.g. "iPhone 14/15", "Samsung A series"), searchable.
- Quality grade/condition: Original, Company/OEM, A-Grade, Copy/China, Used (configurable list).
- Variant attributes: color, size, capacity (mAh/GB), connector type (Type-C/Lightning/Micro-USB), wattage; each variant has its own SKU, barcode, stock and prices.
- SKU (auto-generated pattern, optional manual), manufacturer barcode/UPC (optional), our internal barcode (from Addendum 4), supplier SKU(s) (support several suppliers per item).
- Warranty: none / days / months, warranty terms text, and whether the warranty is shop or supplier.
- Unit of measure and packaging: piece, dozen, box, carton, with a conversion (e.g. 1 dozen = 12 pieces, 1 carton = 120 pieces). Allow purchase in dozen/box and sale in pieces; stock always stored in the base unit (piece).
- Prices: cost price (per piece), wholesale price, retail price, minimum allowed sale price, optional promo price with start/end date. Margin % and profit auto-calculated and shown. Pricing by fixed amount or by markup %.
- Tax class / GST rate (optional, off by default), tax inclusive/exclusive flag.
- Stock control: on-hand quantity, reorder level (low stock warning), optional maximum stock, shelf/rack location, active/inactive, "show in sale screen" flag.
- Image (optional), notes/description.

Purchase (per purchase line) level — each purchase is recorded separately, not just a stock number:
- Date, supplier/dealer, supplier invoice number, product/variant, quantity + unit (dozen/box/piece), cost per unit entered by user, total, discount, extra costs (freight/loading) with option to spread over lines, paid amount, remaining amount (feeds the existing ledger/give-and-take history), batch/lot reference.
- Auto-calculate cost per piece when bought in dozen/box.
- Update cost price using the shop's chosen valuation method (setting: Weighted Average default, FIFO optional). Keep the cost history of every purchase (never overwrite): the product page must show each purchase batch with date, supplier, quantity, cost, and how many are still left.
- Auto-generate barcode/labels on purchase save (Addendum 4), with option "print N labels".
- Option to quick-add a NEW accessory right inside the purchase screen without leaving it.
- Duplicate detection: warn if a similar name/brand/model/color already exists.

### B. History and ledger integration (core principle of this software)
- Every accessory movement is a dated, immutable entry: purchase in, sale out, sale return, purchase return, stock adjustment (damage/lost/count correction with mandatory reason), transfer between locations if applicable.
- Product detail page shows a full timeline: each purchase (from whom, qty, cost, paid/remaining), each sale (to whom, qty, price, invoice), returns, adjustments, price changes (cost, retail, min price history), and current stock + stock value.
- Customer/dealer detail pages must include accessories purchases and sales in their history and balances, same as mobiles.
- Sale screen: scan or search accessory, quantity, price pre-filled with retail price (wholesale price if the customer is marked as wholesale/dealer), obey the asking-vs-sale-price override rules and the minimum price / below-cost approval rules from Addendum 2. Prevent selling more than in stock unless the owner setting allows negative stock.
- Warranty: on sale, record warranty start/end per sold item so a later claim/return can verify it by scanning or by invoice number.

### C. Search, filters, reports
- Search by name, brand, model compatibility, SKU, barcode, supplier SKU. Filters: category, brand, supplier, grade, low stock, out of stock, location.
- Reports: low-stock/reorder list (grouped by supplier, with a ready purchase list), stock valuation (cost and retail value), fast/slow moving accessories, profit by category/brand, dead stock (not sold for X days), supplier-wise purchase summary.
- Bulk tools: import/export accessories via CSV/Excel (with a template), bulk price update by percentage, bulk barcode label print.

### D. Migration and compatibility
- Add new fields via migrations with safe defaults; backfill existing accessories (unit = piece, grade = unspecified, cost batches created from the current stock using the current cost price as an opening-stock batch, clearly marked "Opening stock").
- Existing invoices, ledgers and history must remain untouched and still display correctly.
- Keep Urdu/English labels for all new fields.
- Keep the purchase form SIMPLE: only name, quantity+unit, cost, supplier and paid amount are required; everything else is optional or collapsed under "More details", because shopkeepers often buy in a hurry.

### E. Tests
- Purchase 5 dozen of a cable at a given cost: stock = 60 pieces, cost per piece correct, ledger shows supplier remaining correctly after a partial payment.
- Two purchases at different costs: weighted average cost correct; each batch visible in history.
- Sale of pieces from a dozen-purchased stock reduces stock correctly; sale above stock is blocked (or allowed only if the setting is on).
- Wholesale price used for dealer customers, retail price for others; below-minimum price needs approval.
- Return and adjustment entries keep history and never delete rows.
- Migration/backfill is idempotent and loses no data.
- Supplier SKU lookup in the purchase screen finds the right product.

At the end, show me the final field list that was added or reused, any field you skipped and why, and every assumption you made.
