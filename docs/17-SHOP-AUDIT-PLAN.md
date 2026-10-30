# 17 · Shop Audit, Financial Intelligence & Advanced Reporting — implementation plan

Authoritative requirements: `docs/16-SHOP-AUDIT-SPEC.md` (owner brief, 2026-10-30).
This file is the living plan: gap analysis, design, phases, tasks, acceptance criteria and the
progress checklist. Update it at the end of every session (with `06-PROGRESS.md` and `09-SESSION-LOG.md`).

**Current phase: 3 (Periods & as-of balances) — P1 audit and P2 integrity done 2026-10-30.**
**Exact next task: P3-1 `core/periods.py` (presets + as-of + previous period), then P3-2 balances as-of, P3-3 `/shop-audit/overview`, P3-4 audit shell + overview screen.**

---

## 0. How to read this plan

- Status marks: ✅ done & verified · 🟡 partial · ⬜ missing · 🔧 exists, needs improvement.
- "Reuse" names the existing function / endpoint / screen that the feature builds on.
- Spec sections are referenced as §n (sections of `16-SHOP-AUDIT-SPEC.md`).
- Nothing in this plan changes or deletes existing records. Migrations are additive only
  (new nullable columns, new tables, new indexes).

---

## 1. Phase 1 — Codebase audit (done 2026-10-30)

### 1.1 Architecture summary (verified against code, not docs)

| Layer | What exists |
|---|---|
| Backend | FastAPI, SQLAlchemy 2, Alembic (chain ends `f1a3c5e7b9d2`), Postgres in prod / SQLite in tests and the one-PC build. 33 modules under `backend/app/modules/`. Tenancy: every table `shop_id`, `Ctx` carries shop + caps (`core/permissions.py`: `TRANSACT, VIEW_COST, VOID, EXPENSES, …, REPORTS_ALL, REPORTS_OWN, VERIFY_OVERRIDE`). Money `Numeric(14,2)` / `Decimal`. |
| Ledger | Append-only double entry (`ledger_groups` + `ledger_entries`, `LedgerGroup.reverses_group_id`). Accounts: `sales, purchases, inventory, cogs, discounts, tax_payable, repair_income, other_income, expense:<cat>, equity, suspense, party:<id>, cash:<id>`. Entries carry `party_id`, `cash_account_id`, `device_id`, `at` (backdated docs post at noon of their day, ADR-030). Balances are derived: `party_balance(until)`, `cash_balance(until)`, `account_total(from,to)`, `party_statement`, `cash_book`. Indexes: `(shop, account, at)`, `(shop, party, at)`, `(shop, document_type, document_id)`. 22 document types posted (invoice, purchase, payment, sale_return, purchase_return, expense, repair*, loan, exchange_refund, opening_*, stock_adjust, *_void …). **No `transfer` document type** (cash → bank deposits cannot be recorded). |
| Documents | `Invoice` (subtotal, discount, tax_rate, tax_inclusive, tax_amount, total, paid, cost_total, returned_total, cash_account_id, status open/paid/void, created_by, voided_by) + `InvoiceLine` (device/misc, qty, unit_price, discount_share, tax_share, line_total, cost, **asking_price**, returned_at). `Purchase`/`PurchaseLine` (unit_cost, net_cost, returned_at, purchased_at). `Payment` (direction, amount, cash_account, method, `allocations` JSON, status, void). `PaymentDetail` (per sale/purchase: method cash/online/cheque/remittance, bank, reference, cheque_date, sender, country, currency, foreign_amount, rate, service). `ReturnDoc` (kind sale/purchase, amount, settlement, refund_amount, kept_amount, lines JSON). `Expense` (category_key, cash_account, party, staff_user, receipt_path, status, void). `DayClose` (opening, in, out, expected, counted, difference). `InstallmentPlan` (advance, months, monthly, due_day, first_due). `CashAccount` (kind cash/bank/easypaisa/jazzcash/cheque/remittance, opening_balance, opening_date). |
| Devices | `Device` (category, condition box_pack/open_box/used/patched, pta_status pta_approved/non_pta/jv/unknown, status in_stock/on_loan/with_customer_for_approval/sold/in_repair/faulty/returned_to_supplier, verification_status not_required/pending/clear/flagged, cost_price, asking_price, cycle_no, first_seen_at, last_event_at). `DeviceEvent` immutable (type, status_after, party_id, amount, document, data, user_id, at; index `(shop, type, at)`) — 16 types incl. `price_changed`. `Verification` rows per cycle (egadget, pta, cnic, declaration, result, override_by/reason/at). Sale-time "skip and sell" calls `verification.override` and writes an audit row `verification/override` + a `verified` event with `override: True`. |
| Audit log | `audit_log` (user, entity, entity_id, action, before, after, at; indexed). 60+ write sites: create/update/void/reverse/return/override/adjust/opening_balance/sold/status/plan/modules/… across all modules. Read via `GET /api/v1/audit` (list) and `staff-activity` (attendance module). |
| Reports today | `modules/reports`: `profit_and_loss(from,to)` (sales, cogs, gross, repair/other income, expenses by category, net, owner drawing, tax collected — **no discounts/returns lines, no operating vs net split**), `cash_flow` (per cash account opening/in/out/closing — correct as-of via `cash_balance(until)`), `tax_report` (invoice count, taxable, tax on invoices, tax net of returns — sales side only), `dashboard` (today only), `day_report` (hisaab for a range: money in/out by reason, received by account kind, udhaar given/received, expenses, returns, items sold with seller), `stock_ageing` (fixed buckets 0-15/16-30/31-60/60+, count + cost), `stock_summary` (brand → model count/value), `top_sellers` (by model/item: units, revenue, profit), `forecast`, `price_changes` (ADR-031). `modules/units`: `device_money`, `party_units` (receivable / payable / other kept apart), payment receipt. `modules/exports`: CSV / XLSX (openpyxl) / print-to-PDF page for stock, parties, statement, sales, purchases, expenses, profit-loss, top-sellers, day, stock-summary, khata, forecast, stock-ageing; headers in EN/UR; cost columns gated by `VIEW_COST`. Tests: `test_reports_owner`, `test_reports_simple`, `test_exports`, `test_ledger`, `test_units`, `test_price_rules`, `test_exchange_reports` (203 tests total, green). |
| Frontend | React + Vite + TS + Tailwind, design system in `components/ui.tsx` + `Bilingual.tsx` (BiLabel/BiButton/BiInput/BiSegmented/BiAlert), one language at a time (en/ur/roman JSON). Screens that already show "audit" data: `HomePage` (dashboard KPIs, 7-day `WeekBars` inline SVG, attention alerts), `DayReportPage` (`PeriodPicker`: today / yesterday / week / month / custom), `KhataPage` (receivable/payable lists), `StockSummaryPage`, `ReportsPage` (tabs profit / top / estimate / old / prices, `DownloadButton` csv/xlsx/pdf), `PartyDetailPage` (+ `PartyUnits`, statement), `DeviceDetailPage` (+ `UnitMoney` timeline), `CashAccountsPage` (cash book), `InvoicesPage` (all documents list with kind/date/q filters), `ExpensesPage`, `StaffPage` (hazri + activity log). **No chart library** (only `WeekBars`); `jspdf` present for client-side PDFs; routes in `app/router.tsx`. |
| Clock | `core/clock.py`: shop time zone (Asia/Karachi), `local_day()` SQL helper for ledger timestamps; documents carry a `date` column already in shop days. |

### 1.2 Requirement-by-requirement gap analysis

| § | Requirement | Status | Evidence / reuse | Gap |
|---|---|---|---|---|
| 2 | Global date filters (today … this year, custom, all time, **as-of**) | 🟡 | `PeriodPicker` (5 presets), reports take `date_from/date_to`, `cash_balance(until)`, `party_balance(until)` | No last-week / this-year / all-time / as-of presets; no shared backend period resolver; opening vs activity vs closing vs current not shown together |
| 3 | Financial KPI dashboard | 🟡 | `dashboard` (today only), `profit_and_loss`, `cash_flow`, `tax_report` | No period KPI set; no inventory value as-of; no inflow/outflow totals; no opening/closing in one payload |
| 3 | P&L report | 🔧 | `profit_and_loss` from ledger | Missing lines: discounts (`discounts` account exists), sales returns, net sales, operating vs net profit, tax expense; no period comparison |
| 4 | Cash audit (opening, by reason, closing) | 🟡 | `cash_flow`, `_cash_by_reason`, `cash_book`, `DayClose` | Reasons are coarse (sales/udhaar/repairs/stock/returns/expenses/paid_out); "received against previous debts" vs "from sales" is derivable (payment vs invoice group) but not exposed per account |
| 4 | Bank audit per account | 🟡 | `cash_flow` per account, `cash_book` | Same reason split needed per account; **internal transfers do not exist** (no transfer document) |
| 4 | International payments | 🟡 | `PaymentDetail` remittance rows (sender, country, currency, foreign amount, rate, service, reference) on sales/purchases; `CashAccount.kind = remittance` | No report; **fees and status are not recorded** (limitation to state, optional nullable columns later); stand-alone `Payment` rows have only `method=remittance` + reference |
| 4 | Payment-method breakdown | 🟡 | `day_report.received` by account kind; `PaymentDetail.method`; `Payment.method` | No unified in/out by method for a period across sales, purchases, payments, expenses, returns |
| 5 | Customer / supplier lifetime audit | 🟡 | `party_statement`, `party_units`, `PartyDetailPage` | Missing: first/last transaction dates, counts, lifetime totals, returns/refunds totals, as-of balance view, timeline merged with devices |
| 5 | Rankings | ⬜ | `top_sellers` pattern | No party rankings (sales value, frequency, profit, purchase value, devices, outstanding) |
| 6 | Inventory summary & category counts | 🟡 | `stock_summary` (brand/model), `dashboard.stock_*`, `list_devices` filters (status, condition, pta, brand, category, q) | No counts by condition × PTA × verification; no expected value / margin; no most-expensive lists; list filters lack supplier, date, price range, age, verification |
| 6 | Detailed stock table → device profile | ✅/🔧 | `StockPage`, `DeviceDetailPage`, `UnitMoney` | Table needs the extra columns + filters above (frontend) |
| 7 | Verification audit & bypass report | 🟡 | `Verification` rows, `verified` events with `override`, audit `verification/override`, `dashboard.pending_verification` | No report: counts by status, bypass list by employee/customer/device, unusual-bypass flag |
| 8 | Product analytics | 🟡 | `top_sellers` (units, revenue, profit by model/item for a range) | Missing: brand/category grouping, cost, margin %, avg price, avg holding days, return count, low/average performers with transparent thresholds, trends day/week/month, purchases vs sales |
| 9 | Stock ageing & alerts | 🔧 | `stock_ageing` (fixed buckets, from `last_event_at`), home "attention" alerts | Buckets must be configurable (5 bands); age must start at the intake event of the current cycle, not the last event; per-device ageing rows; alerts for high-value slow stock, low margin, missing cost, missing verification, repeat returns |
| 10 | Expense audit | 🟡 | `Expense` list API + CSV, P&L `expenses` by category | No daily/weekly/monthly series, no previous-period comparison, no largest expenses, no by-account/by-employee split |
| 11 | Tax audit | 🟡 | `tax_report`, `Invoice.tax_*` | No per-invoice rows; purchases carry **no tax** (business fact: used-phone trade; state as limitation); no tax adjustments / filing status (out of scope, state) |
| 12 | Invoice audit | 🟡 | `GET /api/v1/invoices` (all document kinds, filters), `InvoicesPage`, receipts/printables | No counts by type / status / employee / payment status for a period; voided/reversed lists |
| 13 | Udhaar: receivables / payables apart, per party, per phone | ✅/🟡 | `KhataPage`, `party_units`, `units` per document | No ageing buckets; **no due dates** on invoices/purchases (only installments) → show "No due date" + age of debt; no opening/new/paid/closing debt movement for a period |
| 14 | Owner security & fraud audit | 🟡 | ADR-031 `price_changes` report + rules, `audit_log` (voids, reverses, overrides, adjusts, opening balances, price), `staff-activity` | No unified owner-only feed with filters/flags; discounts, below-cost sales, reprints, payment voids, stock adjustments not surfaced as a security view |
| 14 | Price integrity | ✅ | ADR-031, `test_price_rules.py`, `pricerules.spec.ts` | — |
| 15 | Charts | ⬜ | `WeekBars` only | Need a small in-house SVG chart kit (bars, stacked bars, lines, donut) in the design system; no new heavy dependency |
| 16 | Clickable KPIs / drill-down | 🟡 | Home cards link to hisaab / khata / stock; `InvoicesPage` filters; device & party pages | New dashboard must link every KPI to a filtered list that opens the original document |
| 17 | Report center + complete audit report (PDF/Excel/print, section pick, summary/detail) | 🟡 | `exports` (`_file`: csv/xlsx/printable), `DownloadButton` | No report center screen, no multi-section audit report, no multi-sheet workbook |
| 18 | Historical snapshots (as-of stock, cash, bank, balances) | 🟡 | Ledger as-of works (`until`); device events are immutable with `status_after` | No as-of stock reconstruction; no snapshot endpoint |
| 19 | Reconciliation checks | 🟡 | `test_ledger` (balanced groups, balance = Σ entries), `DayClose` | No reconciliation report (cash/bank/stock/debt equations) exposed to the owner or asserted in tests across modules |
| 20 | Indexes & performance | 🔧 | Ledger indexes exist | Missing: `(shop_id, date)` on invoices, purchases, payments, expenses, returns; `(shop_id, cash_account_id, at)` on ledger entries; pagination on detail lists |
| 21 | UX / navigation | ⬜ | Design system, `ReportsPage` tabs | New "Shop Audit" area (`/audit/*`) with sub-screens, reusing cards/tabs/period picker |
| 22 | Automated tests | 🟡 | 203 backend tests, 40 e2e specs | New scenario suite for every phase (see §4) |

### 1.3 Accounting and reporting risks found

1. **Profit today ignores discounts and sales returns**: `profit_and_loss` sums `sales` and `cogs` only; the `discounts` account and return postings (which reverse `sales`/`cogs`) must be shown explicitly so "net sales" is honest. (Verify in P2 how returns post; the ledger already reverses sales/cogs, so the totals are right but opaque.)
2. **Stock age starts at `last_event_at`**: a note or a price change resets the age. Must use the intake event of the current `cycle_no` (`purchased` / `sale_returned` / `loan_returned` …).
3. **No cash ↔ bank transfer**: shops deposit cash in the bank; today that can only be faked as an expense + income. Needs a small `transfer` posting (debit bank, credit cash) that reports exclude from revenue/expense.
4. **Udhaar has no due dates** outside installments: ageing must be "age of the debt" (days since the document) and say so; never show "overdue".
5. **International payments carry no fees / status**: report what exists (gross foreign amount, rate, PKR booked, service, reference); mark fees as not recorded.
6. **`Party.balance` is a cache** refreshed from the ledger; the audit must read the ledger (`party_balance`) for as-of figures.
7. **Dashboard uses `Device.cost_price` for stock value** — fine for current stock; an as-of stock value must use the cost on the intake event (`purchased.data.cost` where present) and fall back to the device cost with a note.
8. **Reports are owner/manager only (`REPORTS_ALL`)** — keep; security audit (§14) must be owner-only (`Role.OWNER`), not manager.

### 1.4 Database changes required (all additive)

| Change | Why | Phase |
|---|---|---|
| `shops.audit_prefs` JSON (ageing bands, performance thresholds, high-value threshold) | §9 configurable thresholds | P6 |
| `payments.kind` = `transfer` support **or** a `ledger` posting with `document_type="transfer"` + `cash_transfers` table (from_account, to_account, amount, date, reference, created_by) | §4 internal transfers | P2 |
| Indexes: `invoices(shop_id, date)`, `purchases(shop_id, date)`, `payments(shop_id, date)`, `expenses(shop_id, date)`, `return_docs(shop_id, date)`, `ledger_entries(shop_id, cash_account_id, at)`, `audit_log(shop_id, at)` | §20 | P2 |
| (Optional, later) `payment_details.fee`, `payment_details.status` | §4 international fees/status — only if the owner wants to record them | backlog |

No table is dropped or renamed; no data is rewritten.

### 1.5 API & service changes (new module `backend/app/modules/shopaudit`)

Prefix `/api/v1/audit` is taken by the audit log → new prefix **`/api/v1/shop-audit`**. All routes `REPORTS_ALL`; cost/profit fields only with `VIEW_COST`; `/security` owner-only.

| Endpoint | Returns | Phase |
|---|---|---|
| `GET /period?preset=…&from&to&as_of` | resolved period (from, to, as_of, label, previous period) — shared resolver `core/periods.py` | P3 |
| `GET /overview` | KPI set for the period: sales, purchases, COGS, gross/operating/net profit, expenses, tax, inflows/outflows, cash+bank opening/closing/current, receivable/payable opening/closing/current, stock count/value opening/closing/current, counts (invoices, phones sold/bought, returns) | P3/P4 |
| `GET /pnl` | full P&L with comparison to the previous period and a daily/weekly/monthly series | P4 |
| `GET /cash` | per account: opening, in/out by reason (sales now, udhaar back, purchases now, paid to suppliers, expenses, refunds, transfers in/out, other), closing, current; plus by payment method (in/out) | P4 |
| `GET /international` | remittance rows from `PaymentDetail` + `Payment(method=remittance)` with totals | P4 |
| `GET /expenses` | totals, by category, by account, by employee, series, largest, vs previous period | P4 |
| `GET /tax` | summary + per-invoice rows | P4 |
| `GET /parties/{id}/journey?as_of` | lifetime card: dates, counts, totals, outstanding (as-of), returns/refunds, merged timeline (documents, payments, device events) | P5 |
| `GET /rankings?metric=…` | top customers / suppliers by metric with the metric named | P5 |
| `GET /udhaar` | receivables & payables apart: totals, per party, per phone, age-of-debt buckets, period movement (opening, new, paid, adjustments, closing) | P5 |
| `GET /inventory?as_of` | counts by condition / PTA / verification / category / brand, cost value, expected value, margin, most expensive lists, status counts (sold, returned, on loan…) | P6 |
| `GET /inventory/ageing` | per-device rows with configurable bands + band totals; alerts | P6 |
| `GET /verification` | counts by status, bypass rows (employee, party, device, reason, date, document), flags | P6 |
| `GET /products` | per model/brand/category: units, revenue, cost, profit, margin %, avg price, avg holding days, returns; performance class with the thresholds shown; trend series; purchases vs sales | P7 |
| `GET /invoices` | counts/amounts by kind, status, employee, payment status; voided/reversed list | P7 |
| `GET /security` (owner) | unified feed: price changes, below-asking/below-cost sales, discounts over X, voids, reversals, payment voids, stock adjustments, opening-balance edits, verification bypasses, PIN approvals, failed PINs; filters by employee/kind; flags | P8 |
| `GET /snapshot?as_of` | the shop as of a date: stock held (from events), stock value, cash/bank balances, receivables/payables, with data-coverage notes | P3 (balances) / P6 (stock) |
| `GET /reconcile` | the §19 equations for the period with pass/fail and the difference | P11 |
| `GET /api/v1/exports/audit-report?sections=…&mode=summary|detail&format=pdf|xlsx` | the complete shop audit report | P10 |
| `POST /api/v1/ledger/transfers` | cash ↔ bank transfer (new posting) | P2 |

### 1.6 Frontend to reuse / extend

- Reuse: `PageHeader`, `Section`, `Row`, `Chip`, `MoneyText`, `KV`, `Empty`, `Loading`, `BiSegmented`, `PeriodPicker` (extend presets), `DownloadButton`, `InvoicesPage` filters, `PartyDetailPage`, `DeviceDetailPage`, `KhataPage`, `useGet`, `useLang`, cost gating via `role`.
- New: `features/audit/` — `AuditShell` (sub-nav + global period bar with as-of), `OverviewPage`, `FinancePage` (P&L + cash & bank + methods + international), `PartiesAuditPage` (rankings + journey), `UdhaarAuditPage`, `InventoryAuditPage` (summary + table + ageing + verification), `ProductsPage`, `ExpensesTaxPage`, `InvoiceAuditPage`, `SecurityPage`, `ReportCenterPage`; `components/charts/` (`Bars`, `StackedBars`, `Lines`, `Donut`, `Kpi`) — inline SVG, theme tokens, RTL-safe, empty states, tap → drill-down.
- Navigation: a "Shop Audit" tile on Home (owner/manager) and in More; `ReportsPage` keeps its tabs and gains a link.

### 1.7 Estimated complexity

| Phase | Size | Depends on |
|---|---|---|
| P2 integrity (transfers, P&L lines, indexes, ageing start) | M | — |
| P3 periods + as-of balances + overview KPIs | M | P2 |
| P4 financial (P&L series, cash/bank by reason, methods, international, expenses, tax) | L | P3 |
| P5 parties (journey, rankings, udhaar ageing) | L | P3 |
| P6 inventory (summary, as-of stock, ageing bands, verification, alerts) | L | P3 |
| P7 products + invoices audit | M | P3 |
| P8 security feed | M | ADR-031, audit log |
| P9 dashboard UI (charts, drill-down) | L | P3–P8 (can start after P4) |
| P10 report center + complete report | M | P4–P8 |
| P11 reconciliation + perf + e2e | M | all |

---

## 2. Design decisions (to be recorded as ADR-032 when P3 lands)

1. **One read-only module** `modules/shopaudit` computes everything from the ledger, documents and device events. It writes nothing (except P2's transfer posting, which lives in `ledger`).
2. **Period semantics**: every balance-type figure is returned as `{opening, in, out, closing, current}`; every flow-type figure as the period sum. `as_of` defaults to `to`. Opening = balance strictly before `from` 00:00 shop time (ledger `until`), closing = balance at the end of `to`, current = now. Document-dated figures use the document `date`; ledger figures use `local_day(at)`; the two agree because backdated postings carry the document day (ADR-030).
3. **Revenue vs cash**: revenue = `sales` account (net of returns, less `discounts`); cash = movements on `cash:<id>` accounts. A payment received in April for a March sale is April cash flow and March revenue, by construction.
4. **Historical stock** = devices whose last event at or before `as_of` has `status_after = in_stock` (plus on_loan / in_repair / approval shown separately); value at the intake cost recorded on that cycle's intake event, falling back to `Device.cost_price` with a coverage note.
5. **Thresholds are shop settings** (`shops.audit_prefs`) with defaults from the spec; the UI shows the thresholds next to every classification.
6. **Charts are in-house SVG** components bound to design tokens; no chart dependency.
7. **Limitations are shown, never hidden**: no due dates → "age of debt"; no purchase tax → "no tax on purchases recorded"; no remittance fees → "fees not recorded".
8. **Security audit is owner-only**; managers see finance/inventory/parties but not the security feed.

---

## 3. Phases, tasks, acceptance criteria

### Phase 1 — Codebase audit ✅ 2026-10-30
- [x] Architecture summary, functionality inventory, gap analysis, risks, DB/API/UI changes, complexity (this file §1).

### Phase 2 — Financial data integrity ✅ 2026-10-30 (commit `p2`)
- [x] **P2-1 Cash ↔ bank transfer** — no new table: a `LedgerGroup` with `document_type="transfer"` (debit receiving account, credit giving one), `POST/GET /api/v1/ledger/transfers` (cap `EXPENSES` = owner/manager), undone through the existing group reversal; `cash_flow` rows carry `transfers_in/out`; `_cash_by_reason` / hisaab show a `transfer` reason on both sides; audit row `cash_transfer/create`. UI: "Move money between accounts" + "Money moved" list on `CashAccountsPage`; hisaab chips. Tests `test_shopaudit_integrity.py::test_transfer_moves_money_without_touching_profit` (balances, P&L unchanged, cash-flow and hisaab reasons, reversal, audit, guards, salesman 403), e2e `transfer.spec.ts`.
- [x] **P2-2 P&L lines** — `profit_and_loss` adds `gross_sales`, `discounts` (from invoices; the sale posting credits `sales` after the discount), `sales_returns` (debits on `sales` from `sale_return`/`exchange_refund` groups; voids and reversals are netted out of gross, not shown as returns), `net_sales` (== `sales`), `operating_expenses`, `operating_profit`; existing keys and figures unchanged. `ReportsPage` profit tab shows the lines when a discount or return exists. Test `test_pnl_spells_out_discounts_and_returns` (discount + full-refund return, then a void).
- [x] **P2-3 Ageing start** — `devices/ageing.py` (`intake_map`, `intake_at`, `days_in_stock`: latest `purchased` / `sale_returned` event, fallback `first_seen_at`); `stock_ageing` uses it. Test `test_stock_age_counts_from_intake_not_last_event` (40-day-old purchase stays in 31–60 after a note and a price change).
- [x] **P2-4 Indexes** — migration `a2b4c6d8e0f1` (+ model `Index`es): `invoices/purchases/payments/expenses/returns (shop_id, date)`, `ledger_entries (shop_id, cash_account_id, at)`, `audit_log (shop_id, at)`.
- [~] **P2-5 Reconciliation helper** → moved into P3 (lands with `modules/shopaudit`).

### Phase 3 — Global date filters & historical balances
- [ ] **P3-1 `core/periods.py`**: presets today/yesterday/this_week/last_week/this_month/last_month/this_year/custom/all_time + `as_of`; previous-period derivation; shop-time boundaries. Tests for every preset around month/year edges.
- [ ] **P3-2 Balances as-of** service: cash accounts, receivable/payable (ledger, split by sign per party), stock count/value (events), each `{opening, closing, current}`.
- [ ] **P3-3 `GET /shop-audit/overview`** with the KPI set (§3) and drill-down hints (`links`).
- [ ] **P3-4 Frontend** `features/audit/AuditShell` + period bar (presets, custom, as-of) + `OverviewPage` KPI grid (opening / period / closing / current where relevant), every tile linking to an existing list.
- [ ] Tests: March sale paid in April → April cash in, March revenue; opening + in − out = closing for cash and debt.

### Phase 4 — Financial audit
- [ ] P4-1 `/pnl` with previous-period comparison and series (day/week/month by range length).
- [ ] P4-2 `/cash` per account by reason + by payment method (in/out) incl. transfers; `/international`.
- [ ] P4-3 `/expenses` (by category / account / employee, series, largest, vs previous).
- [ ] P4-4 `/tax` with per-invoice rows and the limitation notes.
- [ ] P4-5 Frontend `FinancePage` (P&L, cash & bank, methods donut, international table, expenses, tax) with charts.
- [ ] Tests: reasons sum to in/out; methods sum to in/out; expenses never double-counted (P&L vs cash); tax per-invoice sums to summary.

### Phase 5 — Customer & supplier intelligence
- [ ] P5-1 `/parties/{id}/journey?as_of` (lifetime card + merged timeline).
- [ ] P5-2 `/rankings` (8 metrics, metric named, clickable ids).
- [ ] P5-3 `/udhaar` (receivable/payable apart, per party, per phone, age-of-debt buckets with "No due date" semantics, period movement).
- [ ] P5-4 Frontend `PartiesAuditPage` (rankings + journey panel on the party page) and `UdhaarAuditPage`.
- [ ] Tests: Vivo/A/B scenario as-of 15 Apr vs 18 Apr; rankings order; future payments excluded as-of.

### Phase 6 — Inventory intelligence
- [ ] P6-1 `/inventory?as_of` (counts by condition × PTA × verification × category × brand, cost/expected/margin, status counts, most expensive lists).
- [ ] P6-2 `/inventory/ageing` with `audit_prefs` bands + alerts (age, high-value slow, low margin, missing cost, missing verification, repeat returns); settings card for thresholds.
- [ ] P6-3 `/verification` (status counts, bypass rows, unusual flag = employee bypass share > threshold).
- [ ] P6-4 `/snapshot?as_of` stock part (from events) with coverage notes.
- [ ] P6-5 Frontend `InventoryAuditPage` (summary tiles, filters, table → device, ageing stacked bars, verification donut + bypass list).
- [ ] Tests: categories not mutually exclusive; as-of stock after sale/return; band edges; bypass counted per employee.

### Phase 7 — Sales & product analytics + invoice audit
- [ ] P7-1 `/products` (model/brand/category rows with the 8 metrics; performance class with thresholds; series; purchases vs sales).
- [ ] P7-2 `/invoices` audit counts.
- [ ] P7-3 Frontend `ProductsPage`, `InvoiceAuditPage` (chart tap → `InvoicesPage` filtered).
- [ ] Tests: margin %, avg holding days, returns count; class thresholds applied.

### Phase 8 — Owner security audit
- [ ] P8-1 `/security` feed (sources: `price_changes`, invoices with discount / below cost / below asking, `audit_log` void/reverse/adjust/opening_balance/override/delete, payment voids, PIN approvals and failures) with per-employee flags.
- [ ] P8-2 Frontend `SecurityPage` (owner-only, filters by employee/kind, each row opens the document).
- [ ] Tests: salesman cannot call it; manager cannot; every event kind appears once.

### Phase 9 — Interactive dashboard
- [ ] P9-1 `components/charts/` (Bars, StackedBars, Lines, Donut, Kpi) with tokens, RTL, empty state, tap callback; vitest for scales.
- [ ] P9-2 Charts wired on Overview / Finance / Inventory / Products / Udhaar / Expenses; every segment drills down.
- [ ] P9-3 Mobile + laptop layouts; Urdu screenshots.

### Phase 10 — Report center
- [ ] P10-1 `ReportCenterPage`: every individual report (existing exports + new audit endpoints) with period + format.
- [ ] P10-2 `GET /exports/audit-report` (sections, summary/detail, pdf printable + xlsx with a sheet per section; header with generation time, period, currency, filters, coverage notes).
- [ ] Tests: exported totals equal the dashboard payload for the same period.

### Phase 11 — Validation & reconciliation
- [ ] P11-1 `/reconcile` endpoint + Overview "Checks" card (pass/fail per equation).
- [ ] P11-2 Scenario suite (§22 list) in `tests/test_shopaudit_*.py`; large-data timing test (5k invoices on SQLite under N seconds).
- [ ] P11-3 Playwright `audit.spec.ts` (period change, drill-down, export).
- [ ] P11-4 Manuals (en + roman) "Shop Audit" chapter; ADR-032; docs 06/09 final.

---

## 4. Test matrix (spec §22 → test file)

| # | Scenario | Test |
|---|---|---|
| 1,2,3,23 | periods, opening/closing, March sale paid in April, backdated docs | `test_shopaudit_periods.py` |
| 4,11,12,14 | as-of stock, category counts, PTA/JV, ageing bands | `test_shopaudit_inventory.py` |
| 5,6,10 | party journey, partial payments, refunds | `test_shopaudit_parties.py` |
| 7,8 | transfers, remittance conversions | `test_shopaudit_cash.py` |
| 9,16,17,18 | returns, P&L, tax, invoice consistency | `test_shopaudit_finance.py` |
| 13,19,21 | bypasses, employee events, permissions | `test_shopaudit_security.py` |
| 15 | product rankings | `test_shopaudit_products.py` |
| 20,22,24 | export totals, reconciliation, large dataset | `test_shopaudit_reports.py` |

---

## 5. Known blockers & decisions

| Item | Decision / status |
|---|---|
| Due dates on sales/purchases | Not in the data model; show age of debt. Adding an optional `due_date` is a product decision for the owner (backlog). |
| Remittance fees / status | Not recorded; report says so. Optional columns if the owner wants to type them. |
| Tax on purchases | Not recorded (used-phone trade); report says so. |
| Cash ↔ bank transfers | Missing; built in P2-1 (additive). |
| Charts | In-house SVG, no new dependency. |
| Security feed audience | Owner only. |
| Legacy data before v2 | None imported; coverage note shows the first ledger date per shop. |

---

## 6. Progress checklist (update every session)

- [x] P1 audit — 2026-10-30
- [x] P2 integrity — 2026-10-30
- [ ] P3 periods & overview
- [ ] P4 financial
- [ ] P5 parties
- [ ] P6 inventory
- [ ] P7 products & invoices
- [ ] P8 security
- [ ] P9 dashboard
- [ ] P10 report center
- [ ] P11 validation
