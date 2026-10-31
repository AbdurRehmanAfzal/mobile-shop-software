# 18 · Bulk Excel import / export — plan (owner request 2026-10-31)

Owner: "bulk export / import for stock and sales — an Excel sheet the shopkeeper fills and uploads;
plan first which modules this is best for, from every angle, then build; add sample rows that
are easy to copy."

## 1. Where bulk import earns its place (and where it does not)

| Module | Verdict | Why |
|---|---|---|
| **Stock** (phones: opening stock and supplier purchases) | ✅ first | The biggest migration pain: a shop moving from a register or another app has hundreds of phones. One row per phone; rows with a supplier become purchase bills (grouped per supplier + date), rows without become opening stock. Reuses `add_opening_stock` / `create_purchase`, so events, ledger and verification status are exactly as if typed. |
| **People** (customers, suppliers, shops) with opening balances | ✅ first | The khata migration. One row per person; the opening balance posts through `post_party_opening_balance` (equity), direction stated in words. |
| **Items** (accessories: chargers, covers, …) with opening quantity | ✅ | Counted stock is a list by nature. Reuses `accessories.create` (opening qty + cost). |
| **Sales** (historical, by IMEI) | ✅ with guards | Useful to bring the last weeks of sales after the stock import, so profit and khata start right. One row per phone sold: the phone must be in stock in this app; the sale posts through `create_sale` (ledger, events, khata). Pending ID checks are overridden with the reason "bulk import" by the owner / manager who imports — it is recorded as a bypass like any other. |
| **Expenses** | ✅ | Monthly rent / bills lists; reuses `create_expense` with the seeded categories. |
| Payments / udhaar receipts | ⏸ later | Opening balances cover the migration; dated payments against specific bills need the bills first. |
| Returns, repairs, amanat, exchanges, installments | ❌ | State machines with documents behind them; a sheet cannot carry the steps safely. |
| Catalogue (brands / models) | implicit | Created on the fly from the stock sheet when "create missing brands / models" is ticked; shown in the preview as "will be created". |

**Export** already exists for stock, people, sales, purchases, expenses (CSV / Excel / PDF). Bulk adds
*round-trip* exports in the very same column layout as the import template (stock, people, items),
so a shop can download, correct in Excel and re-upload — and the same template is what a new shop fills.

## 2. The sheet, from the shopkeeper's side

- One workbook per kind, three sheets: **Data** (the only sheet to fill), **Help** (every column:
  what to write, required or not, examples, allowed words), **Lists** (brands, models, storages,
  colours, suppliers, categories — what the dropdowns read).
- **Three sample rows** at the top, yellow, in realistic Pakistani words (Vivo Y21 128 GB, 0300
  numbers, Rs. 35,000). They are recognisable by their sample IMEIs / phones, so an upload with the
  samples still in it just skips them with a note — nothing gets created from a sample.
- Headers in the shop's language (English or Urdu), one language per sheet; dates `dd-mm-yyyy` (or
  Excel dates); money in plain rupees; words like condition / PTA / type from dropdowns, but typed
  synonyms are accepted too (New, Box pack, نیا; Used, استعمال شدہ; PTA, Non-PTA, JV).
- CSV (UTF-8) is accepted as well as `.xlsx`.

## 3. Safety, from the owner's side

1. **Preview before anything is written**: every row comes back with ok / error / note and the
   message in the shop's language; totals (rows, phones, value) are shown; nothing is saved.
2. **All or nothing by default**: one transaction; a single bad row stops the import. The owner may
   tick "skip rows with errors" to import the good rows only.
3. **Duplicates**: an IMEI already active in the shop, or repeated in the file, is an error; a person
   with the same phone already exists → the row *uses* that person (no duplicate), said in the note.
4. **Same file twice**: the file's hash is remembered (`bulk_imports`); uploading it again warns
   "this file was imported on …" and needs a confirmation tick.
5. **Who and what**: every import leaves an audit row and a `bulk_imports` record (kind, file, rows
   ok / failed, who, when); every created document says `source: bulk` in its notes.
6. **Limits**: 2,000 rows per file, 5 MB; owner and manager only (`VIEW_COST`); every created
   record goes through the existing services, so shop scoping, ledger balance and device events are
   never bypassed.
7. **Sales guard rails**: the phone must be in stock and not on loan / approval; price below cost is
   refused unless the "allow selling under cost" tick is on; dates in the future are refused.

## 4. Build order

1. Backend `modules/bulk`: column specs + template builder (openpyxl, dropdowns), parser
   (xlsx / csv, tolerant headers), validators per kind, preview, commit with deferred commits
   (one transaction), `bulk_imports` table, routes `/api/v1/bulk/template/{kind}`,
   `/preview/{kind}`, `/import/{kind}`, `/export/{kind}`, `/imports`.
2. Frontend `/more/bulk` "Excel import / export": pick a kind → download template · export current
   → upload → preview table → options → import → result; history list. More tile + Settings link.
3. Tests: `test_bulk.py` (templates, every validator, grouping of purchases, opening balances,
   items, sales with override, expenses, rollback vs skip, duplicate file, 403), e2e `bulk.spec.ts`
   (download template, upload a CSV, preview, import, see the phones in stock).
4. Manuals §15f (en + roman), docs 06 / 09.

## 5. Column specs (Data sheet)

**stock**: IMEI 1* · IMEI 2 · Brand* · Model* · Storage · Colour · Condition* · PTA* · SIM time (months) · Cost (Rs.)* · Asking price (Rs.) · Supplier phone · Supplier name · Date · Paid now (Rs.) · Notes
**people**: Name* · Phone* · Type* (Customer / Supplier / Shop / Customer & supplier) · City · CNIC · Opening balance (Rs.) · Who owes (They owe us / We owe them) · Notes
**items**: Name* · Category · SKU · Quantity* · Unit cost (Rs.)* · Sale price (Rs.)* · Reorder at
**sales**: IMEI* · Sold for (Rs.)* · Paid now (Rs.)* · Customer phone · Customer name · Date · Notes
**expenses**: Date* · Category* · Amount (Rs.)* · Description · Account

Required columns are marked * in the header and listed on the Help sheet.

## 6. Status (2026-10-31)

Built as planned (ADR-034): `backend/app/modules/bulk/{spec,template,parse,service,models,router}.py`,
migration `d5e7f9a1b2c4`, `tests/test_bulk.py`; `frontend/src/features/more/BulkPage.tsx` at
`/more/bulk`, `e2e/bulk.spec.ts`; manuals §15f. Deviations from §2–3 worth knowing:

- Sample rows are recognised by their **yellow fill** in `.xlsx` (content matching alone collided
  with real data); CSV falls back to the sample IMEIs / phones / item names / full expense line.
- The sales override of pending ID checks (§1) was not needed: `create_sale` already handles the
  verification state the same way as the counter; a row that the sale service refuses comes back as
  that row's error and the import rolls back.
- Non-PTA / JV phones **require** the SIM time (the device schema insists), shown as a row error.
- `Paid now` on supplier rows is summed per supplier + date group into the one purchase bill.
- Form flags (`create_catalogue`, `skip_errors`, `allow_below_cost`) are sent as `"true"` / `"false"`
  text; a missing field means the default.

**Next (if asked)**: payments / udhaar receipts by sheet (needs the bills first), a Settings link,
an Urdu-mode e2e.
