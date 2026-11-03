# 31 · Reports module audit — 15 categories, gap analysis, what was built

Owner brief 2026-11-01: "Complete Reports Module Audit & Missing Features Implementation" — audit
every report against the actual code and tests, implement only what is missing, never disturb what
works, no merge to `main` / deploy without the owner's approval.

> The brief asked for `docs/18-REPORTS-MODULE-AUDIT.md`. Number 18 is already
> `docs/18-BULK-EXCEL-PLAN.md` (linked from CLAUDE.md), so this file takes the next free number.

Related: `docs/16-SHOP-AUDIT-SPEC.md` (spec), `docs/17-SHOP-AUDIT-PLAN.md` (the shop-audit build,
ADR-032 / 033), ADR-031 (price integrity).

## 0. How this was checked

Every row was verified in code (route → service → screen) and against a test, not taken from the
progress tracker. Status: **E** existing and verified · **P** partial · **M** missing · **B** broken.
Priority: **H** money / trust · **M** owner asked for it, workaround exists · **L** nice to have.

Where things live:

| Area | Backend | Screen |
|---|---|---|
| Shop audit (owner / manager, `REPORTS_ALL`, cost by `VIEW_COST`) | `modules/shopaudit/*` → `/api/v1/shop-audit/*` | `features/audit/*` → `/audit/*` |
| Classic reports | `modules/reports` → `/api/v1/reports/*` | `ReportsPage` `/reports`, `DayReportPage` `/hisaab`, `KhataPage`, `StockSummaryPage` |
| Files (CSV / Excel / print-PDF) | `modules/exports` → `/api/v1/exports/*`, `shop-audit/report?format=` | `DownloadButton`, `ReportCenterPage` |
| Documents | `modules/invoices` `GET /invoices` (kind, date, q = no / name / phone / IMEI) | `InvoicesPage` |
| Per record | `units` (device money, party units), `ledger` (cash book, statement), `shop-audit/parties/{id}/journey` | device, party, cash-account pages |
| Staff | `audit` log `GET /api/v1/audit`, `attendance/summary` | `StaffPage` (hazri + activity) |

## 1. Common requirements (every report)

| # | Requirement | St | Evidence | Missing | Pri | Tests |
|---|---|---|---|---|---|---|
| 1-9 | today, yesterday, this / last week, this / last month, this year, all time, custom | E | `core/periods.PRESETS` + `resolve`; `AuditLayout` preset bar; period in the URL (`audit/period.ts`) | — | | `test_shopaudit_periods` |
| 10 | As-of date | E | `as_of` on overview, cash, udhaar, rankings, inventory; ledger `until`, stock walk / snapshots | — | | `test_shopaudit_periods`, `_inventory` |
| 11 | Search and filters | P | invoices `q` (no / name / phone / IMEI), stock filters, metric / group / kind chips | new sales / purchase / staff reports need their filters (employee, person, payment status) | M | new tests |
| 12-13 | Clickable KPIs, drill-down | E | every audit tile links to invoices `?from&to&kind`, stock presets, person, phone, bill | new reports must do the same | | e2e `audit*.spec.ts` |
| 14 | Mobile layout | E | `WIDE` routes, cards wrap, Pixel 7 e2e | — | | e2e |
| 15 | Real backend data | E | no mock data anywhere in `features/audit` | — | | |
| 16 | Empty / loading / **error** | **B** | `Empty`, `Loading` used; but every audit screen renders `isLoading \|\| !data ? <Loading/>` — a failed request shows the skeleton forever, no message, no retry | error + retry state on all audit screens | H | vitest / e2e |
| 17-19 | PDF, Excel / CSV, print | P | Report center: complete report (PDF / Excel) + 12 single reports; `exports/*` CSV / XLSX / print | the audit screens themselves have no download button — the owner must go to Report center | M | e2e download |
| 20 | Role-based access | E | `REPORTS_ALL` on every shop-audit route, `VIEW_COST` strips cost, security owner-only, module gate `reports` | new routes must follow | | 403 tests in every `test_shopaudit_*` |

## 2. The 15 categories

### 2.1 Overview dashboard — `/shop-audit/overview`, `OverviewPage`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Total sales, purchases, gross / net profit, expenses | E | `service.overview` sales / purchases / profit / expenses blocks | — | |
| Cash and bank balances, receivables, payables (opening / closing / as-of / now) | E | `money_position`, `debt_position` | — | |
| Inventory quantity and cost value | E | `stock_position` | — | |
| Pending verifications | **M** | only on Home (`reports/dashboard.pending_verification`), not on the audit overview | count + link to ID checks | M |
| Stock alerts | **M** | alerts live in `/inventory/ageing`, not on the overview | alert counts + link | M |
| Daily / weekly / monthly / yearly / custom | E | presets | — | |
| Sales and profit charts | E | Finance P&L `Lines` + `Bars`; overview has the account-type donut | — | |
| Clickable KPI cards | E | tiles → invoices / stock / finance | — | |

### 2.2 Sales reports

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Sales by date | E | `/pnl` series (day / week / month) | — | |
| Sales by employee | P | `/invoices` per employee: bills + amount only | discount, profit, margin, returns per employee | H |
| Sales by customer | E | `/rankings?metric=customers_sales|bills|profit` | — | |
| By mobile, brand, model | E | `/products?group=model|brand|category` | — | |
| Revenue, quantity, COGS, gross profit, margin | E | `/pnl`, `/products` | — | |
| Discounts, tax | E | `/pnl` gross / discounts / net, `/tax` | — | |
| Returns and refunds | E | `/pnl.sales_returns`, `/invoices` kinds | — | |
| Partial payments | **M** | `Invoice.paid` exists; no report splits fully paid / part paid / unpaid | payment-status split | H |
| Cash sales vs credit sales | **M** | at-the-counter money only in the party journey (`_cash_in_groups`) | paid-at-counter vs on credit for the period | H |
| Invoice-wise drill-down | E | invoices list with period + kind | a sale list with status / employee filters | M |
| Trends and period comparison | E | `/pnl` previous + series | — | |

### 2.3 Purchase reports

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Daily / weekly / monthly purchases | P | `/products` series has bought units / cost | money series of purchase bills | M |
| Supplier-wise purchases | E | `/rankings?metric=suppliers_purchases|suppliers_devices` | — | |
| Mobile-wise purchase history | E | device history (`device_events`), journey per supplier | — | |
| Purchase cost | E | overview `purchases_total / net` (cost-gated) | — | |
| Total paid and unpaid, cash vs credit | **M** | `Purchase.paid` exists, no report | paid at purchase / later / still owed | H |
| Purchase returns | E | overview `purchase_returns`, `/invoices` kind | — | |
| Supplier outstanding | E | `/udhaar` payables, `/rankings?metric=payable` | — | |
| Purchase invoices | E | invoices `kind=purchase`, `exports/purchases` | — | |
| Purchases by employee | P | `/invoices` per employee: count only | amount per employee | M |

### 2.4 Cash, bank and payments — `/cash`, `/international`, cash book

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Cash and per-bank opening / closing, in / out | E | `finance.cash` per account | — | |
| Cash book, bank ledger | E | `ledger/accounts/{id}/book`, `CashAccountsPage` | — | |
| Payment method breakdown, wallets | E | `by_kind` channels, `payments_by_method` | — | |
| Bank transfers, internal transfers without double counting | E | `transfer` groups, excluded from channels (`test_shopaudit_finance`) | — | |
| International remittances: currency, rate, fee, converted | E | `/international` (fee / status per ADR-033) | — | |
| Customer receipts, supplier payments, refunds, reversals | E | reasons in / out incl. `reversal_of_*` | — | |
| As-of balances | E | `money_position` as-of | — | |

### 2.5 Udhaar — `/udhaar`, `KhataPage`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Receivables / payables apart, per customer / supplier / phone | E | `parties.udhaar` sides, people, phones | — | |
| Partial payment history, allocations | E | journey timeline, `units` per document, payment allocations | — | |
| Overdue amounts, ageing buckets | E | due-date bands + age-of-debt (ADR-033) | — | |
| Opening / closing | E | `debt_position` | — | |
| Installment-related outstanding | **M** | `installments.counts` feeds Home only; the udhaar report never mentions plans | open plans, remaining, late amount, link | M |
| Clickable person / bill | E | rows → party / invoice | — | |

### 2.6 Inventory — `/inventory`, `/inventory/ageing`, `StockSummaryPage`, accessory reports

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Count, cost, asking, potential margin | E | `inventory.summary` | — | |
| Condition, PTA / non-PTA / JV, brand, model, type (tablets, watches), verification | E | dimensions; `stock_summary` brand → model; `/reports/stock-by-type` | — | |
| Supplier-wise stock | **M** | supplier only on each ageing row | a by-supplier dimension | M |
| Purchase date, age, slow / dead | E | ageing rows, bands, alerts (`audit_prefs`) | — | |
| Most expensive by cost / asking, highest / lowest margin | E | summary top lists | — | |
| Returned devices | E | status counts, "came back ≥ 2×" alert | — | |
| Stock adjustments | E | security feed `stock_adjust`; accessory adjustments with reason | — | |
| As-of inventory | E | stock walk + snapshots | — | |
| Device profile drill-down | E | rows → `/stock/{id}` | — | |
| Accessories | E | `/accessories/reports/*` (ADR-037) | — | |

### 2.7 Customers / 2.8 Suppliers — `/rankings`, `/parties/{id}/journey`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Total customers / suppliers, **new in the period** | **M** | no count anywhere in reports | counts on the People screen | M |
| First / last dealing, lifetime history, totals both ways, received / paid, outstanding, returns, phones, bills, payments | E | `parties.journey` (+ as-of) | — | |
| Top by sales / count / profit / outstanding | E | 8 metrics | — | |
| Supplier: devices supplied, value, profit from their phones, top by value / quantity / profit | E | `suppliers_*` metrics, journey | — | |
| Supplier-wise stock contribution | **M** | see 2.6 | by-supplier stock | M |

### 2.9 Profit & loss — `/pnl`, `reports/profit-loss`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Gross sales, returns, discounts, net, COGS, gross profit, operating expenses, other income, net profit | E | `profit_and_loss` (ledger, never "sales − purchases") | — | |
| Other expenses, tax expense | E | expense categories; tax collected is a liability, not income (notes) | — | |
| Profit by device / model / brand | E | `units/devices/{id}/money`, `/products` | — | |
| Profit by employee | **M** | not computed | per-employee profit (cost-gated) | M |
| Day / week / month / year comparison | E | series + previous period (this_year ↔ last year) | — | |

### 2.10 Expenses & tax — `/expenses`, `/tax`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Series, categories, who recorded, account, trend, largest | E | `finance.expenses` | — | |
| Tax collected, per bill, rates, inclusive / exclusive, returns give tax back | E | `finance.tax` | — | |
| Tax paid on purchases / to the authority, adjustments | E (limitation) | not recorded; the report says so (`LIMITATIONS`) | — | |

### 2.11 Invoices — `/invoices` audit, `InvoicesPage`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Sale, purchase, receipt, voucher, return documents, refunds | E | `products.invoices` kinds; `InvoicesPage` | — | |
| Credit / debit notes | E (n/a) | not a document type; returns play that role | — | |
| Cancelled / reversed | E | voided list with who / why | — | |
| Counts by period, payment status | E | by kind / status with due | — | |
| Search by number, person, IMEI | E | `invoices.service` `q` | — | |
| Print / download, customer = owner figures | E | printables use the same rows; `test_invoices` | — | |

### 2.12 Staff & employees

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Sales / purchases per employee | P | `/invoices` per employee (counts, sales amount) | one staff report with amounts | H |
| Profit contribution, discounts given | **M** | — | per employee (cost-gated) | H |
| Asking changes, under approved price, bypasses, voids, payment reversals, stock adjustments | E (owner) | `/security` per-employee counts + flags | shown in the staff report (owner only) | M |
| Returns and cancellations | P | voids per employee; returns not per employee | returns handled per employee | M |
| Expense entries | P | `/expenses` by user (Finance tab) | in the staff report | M |
| Activity timeline | E | `GET /api/v1/audit?user_id`, `StaffPage` | link from the staff report | L |
| Owner-only security | E | `/security` owner check | keep for the new columns | H |

### 2.13 Device verification — `/verification`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Verified / pending / flagged / not required, skipped (bypass) kept apart, employee, party, date, reason, owner override, unusual flag | E | `inventory.verification`; skipped = `override`, never counted as clear (`test_shopaudit_inventory`) | — | |

### 2.14 Product performance — `/products`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Top brands / models / categories, revenue, profit, quantity, average / low performers, avg price, holding days, returns, trends, purchases vs sales, revenue vs profit, thresholds | E | `products.products` + `audit_prefs` | — | |

### 2.15 Complete shop audit report — `/report`

| Requirement | St | Evidence | Missing | Pri |
|---|---|---|---|---|
| Summary, P&L, cash + channels, customers / suppliers, udhaar, expenses / tax, inventory, ageing, products, ID checks, invoices, security, checks; section pick; summary / detail; PDF / Excel | E | `report.SECTIONS` (15), `test_shopaudit_reports` | — | |
| Sales and purchases section | **M** | no section | `sales`, `purchases` | M |
| Employee activity | **M** | only inside security (owner) | `staff` section | M |
| Important business insights | **M** | — | rule-based insights from the same figures | M |

## 3. Implementation plan (one task at a time)

| Task | What | Reuses | Depends | Tests |
|---|---|---|---|---|
| R1 | Error + retry state on every audit screen | `ErrorText`, `useGet` | — | vitest for the state helper |
| R2 | `GET /shop-audit/sales`: series, payment status (paid / part / unpaid), at the counter vs credit, by employee (discount, profit, margin, returns), by customer, sale list with filters | `_cash_in_groups`, `finance.buckets`, invoices | — | backend: totals = `/pnl` & overview, Decimal, isolation, 403 |
| R3 | `GET /shop-audit/purchases`: series, paid now / later / owed, by supplier, by employee, list | same | R2 | backend: totals = overview |
| R4 | `GET /shop-audit/staff`: one row per employee (sales, discount, profit, purchases, returns, expenses; owner: voids, reversals, price changes, under asking / cost, bypasses, adjustments) | `products.invoices`, `security.feed`, `finance.expenses` | R2 | owner vs manager columns, sums = sales report |
| R5 | People counts (total / new customers, suppliers) in `/rankings`; by-supplier stock in `/inventory` | `inventory._suppliers` | — | counts, dimension sums = stock count |
| R6 | Overview attention: pending ID checks, stock alerts, installments late | `inventory.ageing`, `installments.counts` | — | values = sources |
| R7 | Udhaar installments block | `installments.list_plans` | — | remaining = plans |
| R8 | Report sections `sales`, `purchases`, `staff`, `insights` | R2-R4 | R2-R4 | workbook / printable |
| R9 | Download (PDF / Excel) on each audit screen for its own sections | `/report?sections=` | R8 | e2e |
| UI | `/audit/sales` (Sales · Purchases tabs), `/audit/staff` | `AuditLayout`, charts, chips | R2-R4 | e2e |

Everything is read-only; no migration is needed.

## 4. Status of the tasks

| Task | Status | Commit / notes |
|---|---|---|
| R1 | ✅ | `components/ui.tsx` `Pending` (error + retry) on all eight audit screens; vitest `Pending.test.tsx` |
| R2 | ✅ | `shopaudit/trade.py` `sales`, `GET /shop-audit/sales` (filters `user_id`, `party_id`, `status`, `q`); test `test_reports_trade.py` — billed = overview, profit = Products, at the counter + credit = billed, statuses add up |
| R3 | ✅ | `trade.purchases`, `GET /shop-audit/purchases` (VIEW_COST); totals = overview; credit purchase, isolation |
| R4 | ✅ | `shopaudit/staff.py`, `GET /shop-audit/staff`; regroups sales / purchases / expenses / payments / security by person; security columns owner-only. `StaffPage` activity (`/api/v1/staff-activity`) already existed and is linked, not duplicated |
| R5 | ✅ | `parties.people_counts` → `rankings.counts`; `inventory.summary.by_supplier`; People list opens on `?kind=` |
| R6 | ✅ | `inventory.attention` → `overview.attention` |
| R7 | ✅ | `parties.installments_block` → `udhaar.installments` (part of the receivable, never added on top) |
| R8 | ✅ | report sections `insights` (`shopaudit/insights.py`, rules only), `sales`, `purchases`, `staff` |
| R9 | ✅ | `features/audit/SectionDownload.tsx` (print / Excel of the screen's own sections) on every audit screen |
| UI | ✅ | `TradePage` `/audit/sales` (Sales · Purchases: hero, counter vs credit, status cards that filter, series, employees, people, search, bill list → bill), `StaffAuditPage` `/audit/staff`; overview "needs a look", people counts, stock by supplier, udhaar installments; strings en / ur / roman (54); e2e `reports-audit.spec.ts` |

## 5. Verification (2026-11-02)

- Backend: `test_reports_trade.py` (7) + every `test_shopaudit_*`, installments, full suite; ruff.
- Frontend: tsc, vitest 35 (incl. `Pending.test.tsx`), Playwright `reports-audit` + audit, audit-finance, audit-stock, audit-products, audit-reports, audit-security, core-flow, counter, v2-screens, installments.
- Found, not caused by this work: `audit-parties.spec.ts` fails at "Every dealing" on the person page (also fails with this session's screen changes removed); the backend journey tests pass. Left for a follow-up.

## 6. Not done / out of scope (stated, not hidden)

- Tax paid to the authority, purchase tax, tax filing: not recorded in the app (limitation shown on the tax screen).
- Credit / debit notes: not a document type; returns play that role.
- Per-bill remaining "as of" a past day: allocations carry no date (docs/17 §5); paid / due on the sales and purchase reports are today's figures and say so.
