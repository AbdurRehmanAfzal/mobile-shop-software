# 06 — Progress Tracker (living)

Legend: ✅ done · 🔄 in progress · ⬜ not started · ❌ blocked. Update this file at the end of every session.

## Phase 0 — Foundation
| Item | FR | Status | Notes |
|---|---|---|---|
| Repo restructure: legacy/, docs/, CLAUDE.md, skills | – | ✅ | 2026-10-22 |
| Legacy audit + continue/rebuild decision | – | ✅ | docs/08, ADR-001 |
| Business + functional requirements, data model, roadmap | – | ✅ | docs/01–05 |
| Backend skeleton (pyproject, settings, db base, alembic, pytest) | – | ✅ | `backend/`, 17 tests green |
| Organisations / shops / users models + migration | FR-AUTH-01..03 | ✅ | migration `30a7d2dc3b64` |
| Signup / login / refresh / me endpoints | FR-AUTH-01,02 | ✅ | `/api/v1/auth/*`, `/api/v1/me` |
| Permissions + shop scoping + leakage tests | FR-AUTH-03, tenancy | ✅ | `core/permissions.py`, `core/tenancy.py`, `tests/test_tenancy.py` |
| Staff create/update/disable, shops create/update | FR-AUTH-04 | ✅ | `/api/v1/staff`, `/api/v1/shops` |
| Audit log | FR-AUTH-06 | ✅ | `modules/audit`, `/api/v1/audit` |
| Catalogue module + seeds (brands/models/storages/colours, global + per-shop, Urdu names) | FR-MST-01,02 | ✅ | `modules/catalogue`, `seeds/catalogue.py` (17 brands, 108 models incl. feature phones), migration `7f4c986a8f9f`, 7 tests; seeds run at startup |
| Frontend skeleton (Vite TS, Tailwind, i18n, auth, shell) | FR-PLT-01 | ✅ | `frontend/`, BiLabel/BiButton/BiInput/BiAlert, login/signup, bottom-nav shell, 7 tests |
| Phase 0 exit demo on phone | – | ✅ | Owner tested on phone 2026-10-22 |
| Design system + reference mockup approved by owner | FR-PLT-08 | ✅ | Approved 2026-10-22: light default + dark/system toggle, emerald accent. docs/11 v1.0 |
| Design system implemented in frontend (tokens, theme toggle, primitives, shell, dashboard, auth, more) | FR-PLT-08 | ✅ | 9 frontend tests, build clean |

## Phase 1 — Used-mobile core
| Item | FR | Status | Notes |
|---|---|---|---|
| Parties module | FR-MST-03 | ✅ | `modules/parties`: one table, kinds[], per-shop phone uniqueness, CNIC/phone normalisation (Urdu digits ok), search by name/Urdu/phone/CNIC, `by-phone`, cached `balance` read-only; migration `975f04ac8e85`; 8 tests |
| Devices + events + state machine | FR-DEV-01..04 | ✅ | `modules/devices`: Device (one row per IMEI, projection fields), DeviceEvent (append-only, seq), DeviceAccessoryItem; `state.py` transition table; `apply_event()` sole writer of status; opening-stock entry posts Dr inventory / Cr equity; generic non-money events endpoint; migration `07033ee5abb9`; 9 tests |
| Device history + IMEI search | FR-DEV-05,06 | ✅ | `GET /devices/{id}/history` (party + user names), `GET /devices/imei/{imei}` (found / seen_before / times_bought / luhn_ok), list filters + q over IMEI/model/brand/serial |
| Verification flow + declaration print | FR-VER-01..04 | ✅ | `modules/verification` (record per purchase cycle, result clear/pending/flagged + missing list, VERIFIED events, owner override with reason, `assert_sellable()` for the sale module, bilingual A5 declaration HTML) + `modules/files` (local uploads, shop-scoped paths); migration `04c1bc608d58`; 5 tests |
| Ledger + PostingService + balances | FR-TXN-01,02 | ✅ | `modules/ledger`: cash_accounts (default Cash/نقد per shop), ledger_groups, ledger_entries; `Posting`/`post()`/`reverse()`; party balance cache refreshed from ledger; statements, cash book, opening balances; migration `6d403b33df28`; 11 tests incl. hypothesis property |
| Purchase (walk-in/supplier/shop/trade-in) + device accessories | FR-TXN-03, FR-ACC-02 | ✅ | `modules/purchases`: PUR-000001 numbering (shop counter), device + misc lines, proportional discount allocation into device cost, paid-now via cash account, Dr inventory/purchases · Cr party · Dr party/Cr cash; PURCHASED events (buy-back of sold devices → cycle_no+1); void = reversal + RETURNED_TO_SUPPLIER (blocked once device moved); migration `c2b50b843a18`; 6 tests |
| Sale + invoice numbering + receipt print | FR-TXN-04,12, FR-PRT-01 | ✅ | `modules/sales`: INV numbering (shop prefix + counter), sellability (verification block + owner override inline), tax inclusive/exclusive from shop settings, discount + tax allocation per line, COGS at device cost, accessories given/pending on the device bundle, SOLD events, void with reversal, bilingual thermal/A4 receipt HTML; migration `7efefcded18f`; 9 tests |
| Payments + allocation + statement | FR-TXN-05 | ✅ | `modules/payments`: PAY numbering, in/out, methods, FIFO auto-allocation to open invoices/purchases or explicit allocations (over-allocation rejected), invoice paid/status updates, advance kept as negative balance, void undoes allocations + ledger; migration `68c40ffb1e1f`; 5 tests |
| Loans (out/settle) | FR-TXN-06 | ✅ | `modules/loans`: loan to a shop party (LOANED_OUT, overdue flag), return (LOAN_RETURNED), settle-as-sale (invoice to that shop with `loan_id`); generic events endpoint now refuses loan events; Nokia chain S1–S3 test green |
| Returns (sale/purchase) | FR-TXN-08 | ✅ | `modules/returns`: RET numbering; sale return per line with settlement refund / credit / income (kept amount → other_income), reverses sales+tax+COGS, SALE_RETURNED events, invoice `returned_total` + status; purchase return per line with optional supplier refund, RETURNED_TO_SUPPLIER events, purchase `returned_total`; migration `6e125ad21486`; 5 tests |
| Scenario tests S1–S6 | – | 🔄 | S1–S3 Nokia chain (`test_loans.py`, keep-500-as-income variant in `test_returns.py`), S4 (`test_payments.py`), S6 supplier credit + return (`test_purchases.py`, `test_returns.py`). S5 exchange pending (Phase 2) |

## Phase 1 — Frontend screens (design system, one language at a time)
| Item | Status | Notes |
|---|---|---|
| Shared UI kit + typed query hooks + EN/UR strings | ✅ | `components/ui.tsx`, `lib/queries.ts`, `lib/types.ts` |
| Parties: list/search/filter, add/edit, detail with balance, statement, receive/pay | ✅ | `features/parties`, `features/payments/PaymentForm` |
| Stock: list/filters/search, IMEI lookup, device detail (chips, actions, accessories, history timeline), loan out | ✅ | `features/stock` |
| Purchase wizard (kind + party, devices with IMEI lookup/catalogue/PTA/accessories, misc, payment, done → verify/print) | ✅ | `features/purchase` |
| Verification screen (seller, CNIC + photos upload, eGadget, PTA 8484, declaration print, owner override) | ✅ | `features/stock/VerifyPage` |
| Sale wizard (customer or cash, pick from stock, price/warranty/accessories, misc, payment, receipt print thermal/A4) | ✅ | `features/sale/SaleWizard` |
| Sales list/detail with return (refund/credit/income) and void; purchases list/detail with return and void; payments and returns lists | ✅ | `features/sale/SalesPage`, `features/more/ListsPages` |
| Loans page (out/returned/sold, mark returned, sell to shop) | ✅ | `features/loans` |
| Shop settings, notification settings + message queue with wa.me share | ✅ | `features/more/SettingsPage`, `NotificationsPage` |
| Dashboard with live numbers (today's sales/cash/profit, receivable/payable, cash in hand, stock, pending verification, loans out) | ✅ | computed client-side from lists; reports module will replace |
| Phase 2 screens: expenses + day close, repairs (list/new/detail with status, parts from stock, deliver, job sheet), accessories (stock, low, pending tracker, adjust), exchange wizard, reports (P&L, cash flow, tax, stock age); dashboard on `/reports/dashboard` | ✅ | |
| Home redesign on owner's UI guide (Easypaisa patterns), action chooser, PIN login, opening-stock page | ✅ | Session 20 |
| Phone test on real device | ✅ | 2026-10-22 owner tested on Android over Wi-Fi (`npm run dev:lan`): UI OK |
| Playwright E2E | ✅ | `frontend/e2e/core-flow.spec.ts` at Pixel 7 size: signup → customer → credit sale → dashboard → balance; `npm run e2e` (backend must run) |
| Edit / delete everywhere (owner 2026-10-22: "every record can be added, changed and deleted") | ✅ | Backend: delete-or-archive rule (`db/refs.py` counts FK references; history → archived, owed money / stock left → refused), parties, accessories, cash accounts, expense categories, expense edit (void + repost), device details edit, cancel old-stock entry. Frontend: `RemoveSheet`, party delete, accessory edit/delete, cash account rename/delete, expense edit/cancel + category manager, device "Edit details" (DeviceLineSheet `edit` mode) + "Remove old-stock entry". `e2e/crud.spec.ts` |
| Design v2 "Dukaan counter" (owner + 10 testers rejected the Easypaisa look) | ✅ | ADR-009, docs/11 v2. New tokens + job colours, shell (5 tabs; laptop side menu with F-keys), Home with any-day hisaab / lena-dena / stock worth, `/stock/summary`, `/hisaab`, `/khata`, sale in 3 steps; backend `/reports/stock-summary`, `/reports/day`. Return (wapsi) in 3 steps with the shop's cut and walk-in returns; add stock (purchase) in 3 steps. More, person page and the older screens moved to v2 colours; plain words (ID card check, dealer, new person). Repairs reworked as take in → fix → give back. Still to rework: expenses page layout, settings |
| Owner reports: profit after expenses, tax, best sellers, 7-day estimate + which phone runs out; seller / stock-adder names; staff may skip a pending ID check | ✅ | `/reports/top-sellers`, `/reports/forecast`, `created_by_name`, `sold_by`; v2 Reports page with 4 tabs; skip chosen on the add-stock screen. Flagged (stolen?) phones still need owner/manager |
| Fingerprint login, app + website (owner 2026-10-28) | ✅ | owner always, staff when the owner allows; device key in Keystore (app), passkeys (website); remove per device. Android prompt to be tried on the owner's phone |
| Off-server backup to Google Drive (2026-10-28) | 🔄 | script + docs ready; owner runs rclone setup on the VPS |
| Tablets and smart watches one by one (owner 2026-10-28) | ✅ | category phone/tablet/watch, serial instead of IMEI where needed, PTA only for SIM devices, ID check like phones, catalogue of 47 tablets + 33 watches |
| Watches and accessories by count in sale and purchase (owner 2026-10-28) | ✅ | StockItemPicker; stock count moves, profit from avg cost; watch / power bank categories |
| Word help "?" (owner 2026-10-28) | ✅ | 16 terms, en/ur/roman |
| Payment methods on sale and purchase (owner 2026-10-28) | ✅ | Cash · Online (all PK banks/wallets) · Cheque · From abroad (remittance: currency × rate, sender, service, MTCN) · Udhaar; own money account per way; details on bill and receipt. Khata payment form still to align |
| Android print/download via Chrome link (2026-10-28) | ✅ | 2-minute link for one address; autoprint |
| Tax per sale as a checkbox, off by default (owner 2026-10-28) | ✅ | `SaleCreate.tax_rate` (added on top); rate starts at the shop's setting |
| Hold a sale / resume (POS hold, owner 2026-10-28) | ✅ | `held_sales` table (cart JSON, shop-scoped), `GET/POST/DELETE /sales/held`; nothing sold or moved until completed; a phone sold meanwhile comes off on resume |
| Download + Share on every report and invoice (owner 2026-10-28) | ✅ | PDF made on the device from the print page (ADR-014); Excel/CSV; web share sheet or download, app: Documents / Capacitor Share; invoice, exchange and repair slip have Download PDF / Share PDF |
| Home redesign + phone responsiveness (owner 2026-10-28, 20 testers: "basic") | ✅ | Greeting, coloured job tiles, hero with 7-day chart (`dashboard.sales_7d`) and 4 figures, khata/stock cards; header and page headers wrap on narrow phones; `e2e/responsive.spec.ts` checks 9 screens × en/ur on iPhone SE / 15 / 15 Pro Max (WebKit) and two Androids |
| Tablet / watch own details (owner 2026-10-28) | ✅ | `devices.cellular`, `size_mm`, `battery_health` (migration e5a8c3d1f7b4); watch: no storage/IMEI 2/JV/patched, case size; tablet: Wi-Fi or Wi-Fi + SIM, no JV/patched; IMEI + PTA only with a SIM; accessories per kind (stylus, keyboard, strap) |
| Invoices: every bill in one place (owner 2026-10-27) | ✅ | `modules/invoices` + `/invoices` screen: sales, purchases, returns, repairs; search by bill no / name / phone / IMEI (Scan), period, state; to get / to pay totals |
| Shop time zone for days and reports (2026-10-28) | ✅ | `core/clock.py`: today and ledger days in Asia/Karachi (+05:00); before, sales after midnight PKT counted on the previous day |
| Full catalogue + field checks (owner 2026-10-27) | ✅ | Seeds: 465 models, 37 colours, 16GB storage. Selling price never below buying price (purchase/opening stock/price change refused; sale below cost only by owner/manager with `below_cost_ok`). Inputs: `components/FieldInputs.tsx` — mobile with fixed +92 (10 digits), CNIC 13 digits with auto dashes, IMEI 15 digits. Dates: from ≤ to ≤ today (`clampRange`), backend `bad_date_range` |

## Phase 2 — Operations
| Item | FR | Status |
|---|---|---|
| Exchange | FR-TXN-07 | ✅ | `modules/exchanges`: trade-in purchase + sale + optional refund in ONE transaction (create_sale/create_purchase gained `commit=False`), EXC numbering, records previous/new balance; migration `218e639dde2c`; 2 tests incl. rollback |
| Accessories stock + pending tracker | FR-ACC-01,03,04 | ✅ | `modules/accessories`: items with SKU/avg cost/price/reorder, movements log, opening stock, adjust (+ ledger), purchase/sale/return/void/repair integration, low-stock, pending device-accessory tracker with deliver; migration `ab0e2601f475`; 5 tests |
| Repairs | FR-REP-01..05 | ✅ | `modules/repairs`: customer + stock-device jobs, fault codes EN/UR, received accessories, photos, estimate/advance (ledger), status flow + log, parts (stock) + labour + discount, deliver with bill + payment, outside technician cost → device cost, returned-unrepaired → faulty, job sheet print, repair-ready WhatsApp; migration `e95a0709d555`; 5 tests |
| Expenses, cash book, day close | FR-TXN-09,10 | ✅ | `modules/expenses`: seeded bilingual categories + custom, EXP numbering, ledger `expense:<key>`, salary/technician links, void; day-close preview/close per cash account; migration `e1b1a31dbe63`; 4 tests |
| Dashboard + reports + export | FR-RPT-01,02 | ✅ | `modules/reports` + `modules/exports`: CSV (Excel, UTF-8 BOM) for stock, parties, party statement, sales, purchases, expenses; cost columns role-gated; reports page Print/PDF via browser |
| Tax | FR-TAX-01..03 | ✅ | settings, per-invoice tax, `GET /reports/tax` |
| Asking-price audit trail + price rules (fraud prevention) | owner 2026-10-30 | ✅ | **2026-10-30** ADR-031: asking shown and revisable at checkout (`new_asking_price` + reason → `PRICE_CHANGED` event with user/time/invoice, original kept), `invoice_lines.asking_price`, `SOLD` carries `below_asking` / `approved_by`; shop `sale_rules` (`below_asking`, `asking_change`: allow / manager / pin) enforced in `sales/approval` for sales and manual changes, owner quick PIN approval recorded; `GET /reports/price-changes`; UI `SaleConfirm` before every phone sale (cost / asking / new asking / sold / profit, flags, PIN box), Settings `Price rules` card, Reports `Prices` tab, UnitMoney original vs current asking + price-change rows; `test_price_rules.py`, `pricerules.spec.ts` |
| Unit-wise money history (per phone, per person) | owner 2026-10-30 | ✅ | **2026-10-30** `modules/units` (ADR-030): `GET /devices/{id}/money` (purchase side, sale side, payments by allocation share, margin, merged timeline with running unit balances), `GET /parties/{id}/units` (phone rows, receivable / payable / other apart), `GET /payments/{id}/receipt` (thermal/A5 voucher); UI `UnitMoney` on the phone page, `PartyUnits` + split header on the person page, PaymentForm allocation + print; Vivo scenario in `test_units.py` and `units.spec.ts` |
| Price stickers / barcode labels | owner 2026-10-30 | ✅ | **2026-10-30** `modules/labels`: Code 128 of IMEI / SKU (python-barcode, inline SVG), roll sizes + A4 sheet + custom mm, field toggles, copies, secret cost code (`shops.label_code_word`, VIEW_COST only), shop-saved prefs (`shops.label_prefs`); `LabelSheet` from device page, stock multi-select, purchase done, items; ADR-024 |
| Installments (qist) | owner 2026-10-29 | ✅ | **2026-10-29** `modules/installments` (ADR-022): a plan on the sale (advance = paid, months, monthly, due day, first due, guarantor), schedule derived from the invoice's `paid`, list by due today / late / running / finished, collect = normal payment allocated to the bill, WhatsApp reminder + night auto-reminders, dashboard counts, receipt line; module `installments` (pro/chain/trial default) |

## Phase 3 — SaaS and reach
| Item | FR | Status |
|---|---|---|
| Plans, multi-shop | FR-AUTH-05,07 | ✅ | **2026-10-29** public landing page at /welcome with shop requests (ADR-021); software fees by manual transfer + in-app report + approval (ADR-020); per-shop modules (ADR-019: basics always on, 10 switchable by plan or by hand, API-gated); organisation plan + monthly fee + paid-until (super admin sheet, +1/3/12 months, Unlimited); owner notice from 7 days before, 15 grace days, then writes refused (`plan_expired`, super admin exempt); branches of one owner (`POST /admin/shops/{id}/branches`), More → My shops switcher. **2026-10-30** phone OTP (`modules/otp`, ADR-025): forgot password → WhatsApp code → new password, self-service; `SIGNUP_OTP` makes public signup prove the number; without a sender the request-to-owner path stays |
| Staff polish, audit viewer | FR-AUTH-04,06 | 🔄 | Staff UI (add, role, password, disable) + cash/bank accounts UI with cash book done; **2026-10-29** forgot-password requests (owner → super admin dashboard + WhatsApp, staff → shop owner), super admin sets owner passwords and opens any shop; **2026-10-30** staff activity view (per person: sales, received, purchases, expenses, repairs, actions, last login; log of every audited change) and hazri (check in/out on Home, owner marks days, period summary) — `modules/attendance`, module `attendance` (pro/chain/trial), ADR-023 |
| WhatsApp / SMS / email + scheduled reports | FR-RPT-03,04,05,06 | 🔄 | Outbox + settings + templates + hooks + wa.me links; **2026-10-29**: udhaar reminders (screen + automatic), night report to the owner, in-process scheduler, Meta Cloud API sender (`provider.py`, env WHATSAPP_*; templates map); **2026-10-30** SMTP sender (`send_email`, env SMTP_*): email messages dispatch like WhatsApp ones, night report by email (`owner_daily_report_email`), `/notifications/provider` reports both (ADR-026) |
| PWA + Capacitor Android/iOS | FR-PLT-02,03 | 🔄 | PWA done (manifest, icons, app-shell service worker). Capacitor Android project scaffolded with camera/share; APK build needs Android Studio PC + live API domain (docs/13). iOS needs a Mac |
| Docker cloud deploy + local installer + backups | FR-PLT-04,06 | 🔄 | **Live 2026-10-27** at https://mobileshop.oopsolutions.com on the OOP Solutions VPS behind Traefik (ADR-013, docs/12). CI (`ci.yml`: lint, tests, PostgreSQL migrations, frontend, Docker stack + smoke) and CD (`deploy.yml`: push main → ghcr.io images → `deploy.sh` with health check + rollback). Nightly backups via cron. First owner login via `python -m app.cli create-owner` (done). Local installer pending; off-server backup copy pending |

## Owner decisions pending (noted 2026-10-22)
| Item | Status | Notes |
|---|---|---|
| Laptop/desktop responsive layout (sidebar, wide tables, side-by-side sale screen) | ✅ | **2026-10-29**: side menu with F-keys (was there); content now uses the width on list/overview screens (`Shell` WIDE routes → 5xl, forms stay 3xl); Home in two columns (hisaab left; khata, stock, reports, attention right); Sale side by side on lg (stock list left, bill right, no step switching; `useLaptop()` in `lib/useMedia.ts`); stock cards two per row. `e2e/laptop.spec.ts` at 1280×800 |
| Offline Windows installer (local server + SQLite, optional cloud sync) | ✅ | **2026-10-30** FR-PLT-04 done (docs/15, ADR-029): `app/local.py` tray launcher (data in %LOCALAPPDATA%\MobileShop, settings.env, migrations, backup), backend serves the web app (`WEB_DIR`), PyInstaller spec + Inno Setup script + `local/build.ps1`, `windows.yml` builds and smoke-tests `MobileShop-Setup-<v>.exe`. Local installs run as `chain` with no expiry (`LOCAL_MODE`). FR-PLT-05 cloud sync not built |

## Phase 4 — Differentiators
| Item | FR | Status |
|---|---|---|
| AI assistant + OCR + pricing | FR-AI-01..04 | 🔄 | **2026-10-30** FR-AI-03 rate suggestion without an LLM: `devices/pricing.py` + `GET /devices/price-hint` (own sales, 180 days, exact → condition → model fallback, median rounded to 100, last sale + days to sell, cost median for VIEW_COST, same model in stock); `PriceHint` in sale, add-stock and change-price (ADR-027). **2026-10-30** FR-AI-01/02 on Claude (`modules/ai`, ADR-028): assistant with read-only shop tools (hisaab, khata, phone by IMEI, stock, best sellers, overview, rate) in the shop's language, VIEW_COST-aware; photo reading of CNIC fronts and phone box labels (structured outputs) with on-device OCR as the fallback; per-shop daily cap `AI_DAILY_LIMIT`; module `ai` (pro/chain/trial). Needs `ANTHROPIC_API_KEY` on the VPS. FR-AI-04 (drafting reminders) not started |
| FBR POS | FR-TAX-04 | ⬜ |
| Cloud sync / offline | FR-PLT-05 | 🔄 | **2026-10-29 offline mode**: queries persisted 24 h (localStorage, cleared on logout), sale / purchase / payment / expense queued on the phone when the network is down (`lib/offline.ts`, `lib/outbox.ts`, OfflineBar), sent in order with `Idempotency-Key` (server `core/idempotency.py`, table `idempotency_keys`). Two-way sync of edits made offline is not planned |

## Phase 5 — Shop Audit, Financial Intelligence & Advanced Reporting (owner brief 2026-10-30)
Spec `docs/16-SHOP-AUDIT-SPEC.md` · plan + gap analysis + next task `docs/17-SHOP-AUDIT-PLAN.md`.
| Phase | Status | Notes |
|---|---|---|
| P1 Codebase audit & gap analysis | ✅ | **2026-10-30** docs/17 §1: 22 requirement rows classified, 8 accounting risks, additive DB changes, API map (`/api/v1/shop-audit/*`), UI reuse list |
| P2 Financial data integrity (cash↔bank transfer, P&L lines, ageing start, indexes) | ✅ | **2026-10-30** `POST/GET /ledger/transfers` (transfer = ledger group, reversal to undo, reasons apart in cash-flow and hisaab), P&L `gross_sales / discounts / sales_returns / net_sales / operating_profit`, `devices/ageing.py` intake-based age, migration `a2b4c6d8e0f1` indexes; `test_shopaudit_integrity.py`, `transfer.spec.ts`; Cash & bank "Move money" |
| P3 Periods & as-of balances, overview KPIs, audit shell | ✅ | **2026-10-31** `core/periods.py`, `modules/shopaudit` (`/api/v1/shop-audit/period`, `/overview`, `/reconcile`), as-of money / debt / stock from ledger + device events, backdated sale/return events now carry the document time; UI `/audit` overview (period bar with 8 presets + custom + as-of, KPI tiles with start → end → now, checks card, drill-down to invoices); `test_shopaudit_periods.py`, `audit.spec.ts` |
| P4 Financial audit (P&L series, cash/bank by reason, methods, international, expenses, tax) | ✅ | **2026-10-31** `shopaudit/finance.py` + routes `/shop-audit/{pnl,cash,international,expenses,tax}`; UI `/audit/finance` (P&L · Cash & bank · Expenses · Tax) with the first in-house chart (`charts/Bars`); `test_shopaudit_finance.py`, `audit-finance.spec.ts` |
| P5 Customers & suppliers (journey, rankings, udhaar ageing) | ✅ | **2026-10-31** `shopaudit/parties.py` + routes `/shop-audit/parties/{id}/journey`, `/rankings`, `/udhaar`; UI `/audit/people`, `/audit/udhaar`, journey card on the person's page; `test_shopaudit_parties.py`, `audit-parties.spec.ts` |
| P6 Inventory intelligence (as-of stock, bands, verification, alerts) | ✅ | **2026-10-31** `shopaudit/inventory.py` + `prefs.py`, routes `/shop-audit/inventory`, `/inventory/ageing`, `/verification`; `shops.audit_prefs` (migration `b3c5d7e9f1a2`) + Settings thresholds card; UI `/audit/stock`; `test_shopaudit_inventory.py`, `audit-stock.spec.ts` |
| P7 Products & invoice audit | ✅ | **2026-10-31** `shopaudit/products.py`, routes `/shop-audit/products`, `/invoices`; UI `/audit/products`, `/audit/bills`; `test_shopaudit_products.py`, `audit-products.spec.ts` |
| P8 Owner security feed | ✅ | **2026-10-31** `shopaudit/security.py` + `GET /shop-audit/security` (owner only; price changes, under asking / cost, discounts, voids, reversals, adjustments, opening balances, bypasses, wrong PINs, admin actions; per-employee flags), wrong owner PINs now audited; UI `/audit/security`; `test_shopaudit_security.py`, `audit-security.spec.ts` |
| P9 Charts & drill-down dashboard | ✅ | **2026-10-31** `components/charts/{Bars,Donut,Lines}` (in-house SVG), donuts / lines / bars across Overview, Finance, Stock, Products, Udhaar, Expenses; every tile and segment drills down (invoices with period + kind, stock with condition / PTA / type presets, person, phone) |
| P10 Report center & complete audit report | ✅ | **2026-10-31** `shopaudit/report.py` + `GET /shop-audit/report` (15 sections, summary / detail, printable PDF page or Excel with a sheet per section, json for the screen); UI `/audit/reports` (builder + individual reports); `test_shopaudit_reports.py`, `audit-reports.spec.ts` |
| User-test round 2 (owner 2026-10-31): More items look like buttons, Home = fast actions + at-a-glance numbers + charts, chart kit polished, audit chips fit Urdu | ✅ | **2026-10-31** `MorePage` bordered rows with icon + label + chevron (Urdu: one column); `HomePage` fast actions first, "At a glance" tiles (sales, profit, in hand, cash & bank, owe / owed, stock, expenses) on the chosen period + 7-day bars + money donut, old hero / khata / stock cards removed as duplicates; `charts/Bars` (grid lines, axis values, rounded bars, hover value, LTR axes in Urdu) and `charts/Lines` (smooth area, axis values, hover dots) rewritten; audit / segment chips use padding instead of a fixed height and wrap |
| History rows open their document; phone history and person journey download / print / share as PDF, Excel, CSV | ✅ | **2026-10-31** `GET /exports/devices/{id}/history`, `GET /exports/parties/{id}/journey` (every format via `_file`); unit timeline rows carry `document_type/id`, `event_id`, `party_id`; `UnitMoney` rows and journey rows navigate; `DownloadButton` on both; `test_history_exports.py`, `history.spec.ts` |
| P12 Owner decisions: due dates on udhaar bills (overdue in the udhaar audit), remittance fee / status (net in the international report), daily stock snapshots (nightly job + backfill, used by as-of stock) | ✅ | **2026-10-31** migration `c4d6e8f0a1b3` (all nullable / new table), ADR-033; `test_shopaudit_decisions.py` (3) |
| P11 Reconciliation, scenario tests, e2e, manuals, ADR-032 | ✅ | **2026-10-31** `/shop-audit/reconcile` + checks card (P3); 8 `test_shopaudit_*.py` files (17 tests); 9 audit e2e specs; manuals §15e (en + roman); ADR-032. Deferred: 5k-invoice timing test (SQLite CI) — see docs/17 §5 |

## Phase 6 — Bulk Excel import / export (owner request 2026-10-31)
Plan `docs/18-BULK-EXCEL-PLAN.md` (module verdicts, sheet design, safety rules, column specs).
| Item | Status | Notes |
|---|---|---|
| Backend `modules/bulk`: templates (Data / Help / Lists, 3 yellow sample rows, dropdowns, EN or UR), parser (xlsx / csv, tolerant headers, Excel dates, `35,000`, Urdu digits), checks per kind in the shopkeeper's words, preview that writes nothing, all-or-nothing import through the existing services (`deferred_commits`), `bulk_imports` table + file hash, export in the template layout | ✅ | **2026-10-31** routes `/api/v1/bulk/{kinds,template,preview,import,export,imports}` (owner + manager); migration `d5e7f9a1b2c4`; `test_bulk.py` (14) |
| Kinds: stock (opening stock or supplier purchases grouped per supplier + date, new brands / models / suppliers on the way), people (+ opening balances), items (+ opening qty), sales (in-stock IMEIs, khata needs a customer, under-cost guard), expenses (categories / accounts by name) | ✅ | **2026-10-31** sample rows recognised by their yellow fill (xlsx) or their sample IMEIs / phones / names (csv) and skipped; the same file again is warned about |
| Frontend `/more/bulk` (More → Bulk Excel): kind tiles, 3 steps, options, preview with counts + row sheet, import result, export, earlier imports; strings `bulk.*`, `help.bulk` en / ur / roman | ✅ | **2026-10-31** `features/more/BulkPage.tsx`; `bulk.spec.ts` |
| Later (docs/18 §1): payments / udhaar receipts by sheet; returns, repairs, amanat, exchanges, installments stay manual | ⏳ | |

| Landing page refresh (owner 2026-10-31): new-features section with its own screenshots, new screens in the galleries, WhatsApp + call floating buttons, mobile fit | ✅ | **2026-10-31** `LandingPage` section "What came in the last round" (audit, Excel, phone's money, price rules, assistant, Home, installments, hazri, OTP, Windows), galleries gain audit / finance / bulk / history, floating WhatsApp + call (bottom end, safe-area), hero point 4, header fits 360px; `scripts/landing-assets.mjs` seeds a busier demo month and shoots the new screens; strings `landing.new.*`, `landing.float.*` en / ur / roman |

## Phase 7 — Subscription reminders (owner addendum 3, 2026-10-31)
Spec `docs/19-SUBSCRIPTION-REMINDERS-SPEC.md` · gap analysis, schedule, assumptions and placeholders `docs/20-SUBSCRIPTION-REMINDERS-PLAN.md` · ADR-035.
| Item | Status | Notes |
|---|---|---|
| Data: grace per provider / shop, plan start, paid-on + receipt numbers, reminder state per user, redeemed codes, billing settings with placeholders | ✅ | **2026-10-31** migration `e6f8a0b2c3d5`; `platform_settings.billing`; README "Billing settings" |
| Schedule + popup decided on the server (stages, once-a-day / every-few-hours, escalation, snooze that never passes the expiry, staff notice only) | ✅ | **2026-10-31** `modules/plan/reminders.py`, `/api/v1/plan/reminder*`; `test_plan_reminders.py` |
| Bar (yellow / orange / red / locked / blue) + trilingual popup with copyable bank & wallet details, QR, WhatsApp, pay / later / close, backup | ✅ | **2026-10-31** `PlanReminders.tsx`, `lib/planReminder.ts`; never on form pages; `plan-reminders.spec.ts` |
| Proof → pending (blue) → verified (receipt SUB-0001, thank-you once, reminders cleared, provider notified on WhatsApp) | ✅ | **2026-10-31** `fees.py` receipt numbers / `notify_admin` / `record_manual`; `/plan/receipts/{id}` |
| Soft-lock: view, export, backup zip, pay; full-screen notice in 3 languages; nothing deleted; lock / unlock audited | ✅ | **2026-10-31** `LOCKED_ALLOW`, `/plan/backup` |
| Provider: billing settings sheet, record manual payment, renewal code (signed, offline, once), per-shop grace | ✅ | **2026-10-31** `/admin/billing`, `/admin/shops/{id}/payments`, `/admin/shops/{id}/renewal-code`; `renewal.py keygen` |
| Clock-tamper guard for the one-PC install | ✅ | **2026-10-31** `clockguard.py` (memory + hourly `platform_settings.last_seen`) |
| Owner-side: real bank / support details, renewal key pair on the VPS, decide on grace 7 | ⏳ | docs/20 §4–5 |

## Phase 8 — Barcodes, labels and scanning (owner addendum 4, 2026-10-31)
Spec `docs/22-BARCODES-SPEC.md` · what existed, what was built, assumptions, libraries, sizes, scanner test `docs/23-BARCODES-PLAN.md` · ADR-036.
| Item | Status | Notes |
|---|---|---|
| Barcode per phone / per item SKU made in the purchase transaction; prefix + sequence or IMEI; custom / maker's codes; uniqueness; never reused | ✅ | **2026-10-31** `modules/barcodes`, columns on devices / accessories / shops, migration `f7a9b1c3d4e6`; `test_barcodes.py` (14) |
| Types Code 128 / EAN-13 / Code 39 / QR with validation and round-trip decode; settings (type, prefix, start, mode) | ✅ | **2026-10-31** `codes.py` (python-barcode + segno; zxing-cpp in tests); Settings → Barcode settings |
| Labels: stored barcode in its type, 40×30 + 58×40 added, IMEI last 4, QR layout, test print, prints audited + on the timeline | ✅ | **2026-10-31** `labels/service.py`, `/barcodes/test-label` |
| Hardware scanner listener (burst + Enter, layout independent, prefixes) + beeps; scan on sale / purchase / return / stock / Home; Item not found → Add it | ✅ | **2026-10-31** `lib/scanner.ts` (+6 unit tests), `ScanListener`, `barcodes.spec.ts` |
| Stock count screen; lookup by barcode / IMEI 1 / IMEI 2 / SKU / maker's code; backfill (UI + CLI) | ✅ | **2026-10-31** `/stock/count`, `/barcodes/lookup`, `/barcodes/count`, `/barcodes/backfill`, `python -m app.modules.barcodes.backfill` |
| Camera scanning of any code (not only IMEIs) in search boxes | ✅ | **2026-10-31** `scanPhoto(file, true)`, `ScanButton onCode` |
| Data Matrix | ❌ | not offered (docs/23 §3) |

## Phase 9 — Accessories purchase parameters (owner addendum 5, 2026-10-31)
Spec `docs/24-ACCESSORIES-SPEC.md` · audit, gap table, migration plan, assumptions `docs/25-ACCESSORIES-PLAN.md` · ADR-037.
| Item | Status | Notes |
|---|---|---|
| Audit of the existing accessory fields, gap table, migration plan | ✅ | **2026-10-31** docs/25 §1–3 |
| Product card: brand, fit (+ model links), grade, variant attributes, warranty, unit + packaging, wholesale / minimum / promo prices, markup pricing, tax, max stock, shelf, show-in-sale, image, notes, supplier SKUs | ✅ | **2026-10-31** `accessories` columns + `accessory_supplier_skus`, migration `a8b0c2d4e6f8`; `ItemForm` with "More details" |
| Purchase batches (cost history, qty left), weighted average / FIFO setting, negative-stock setting, units table | ✅ | **2026-10-31** `accessory_batches`, `stock.py`, `shops.item_prefs`, Settings "Item settings" |
| Purchase line in dozen / box / carton with per-piece cost; supplier bill no.; freight spread over lines; batch ref; item labels after save | ✅ | **2026-10-31** `MiscLineIn.unit`, `purchases.supplier_invoice_no / extra_costs`, `purchase_lines.pack_*`; unit chips in `PurchaseWizard` |
| Counter: dealer / promo / retail pre-fill, minimum price → approval, below cost → owner, stock guard per setting, warranty end per sold item | ✅ | **2026-10-31** `/accessories/{id}/price`, `parties.wholesale`, `invoice_lines.warranty_until` |
| Item page: card, prices + margin, stock value, batches, timeline (purchases with paid / remaining, sales, returns, adjustments with reason, price changes) | ✅ | **2026-10-31** `/accessories/:id`, `/{id}/timeline`, `/{id}/batches`, `accessory_price_changes` |
| Search by brand / fit / barcode / supplier SKU; filters brand / grade / supplier / location / out of stock; duplicate warning | ✅ | **2026-10-31** list params, `/similar`, `/lookup` |
| Reports: low stock by supplier with order list, valuation, fast / slow, profit by category / brand, dead stock, supplier summary; bulk price % | ✅ | **2026-10-31** `/accessories/reports/*`, `/bulk-price`, `AccessoryReportsPage` |
| Bulk sheet: optional item columns (brand, grade, colour, fits, wholesale, minimum, warranty, shelf) | ✅ | **2026-10-31** `bulk/spec.py` + import / export |
| Backfill of opening batches (migration + `POST /accessories/backfill-batches`), idempotent | ✅ | **2026-10-31** verified on the dev DB (57 items → 57 batches) |
| Transfers between locations | ❌ | not a stock event (docs/25 §5) |
| Per-line GST on the invoice | ⏳ | stored and shown; invoice keeps the shop rate until the owner decides (docs/25 §5) |

## Phase 10 — Tablets and smart watches as full devices (owner addendum 6, 2026-10-31)
Spec `docs/26-TABLETS-WATCHES-SPEC.md` · audit, gap table, decision, migration plan, assumptions `docs/27-TABLETS-WATCHES-PLAN.md` · ADR-038.
| Item | Status | Notes |
|---|---|---|
| Audit (device model, accessories, what tablets / watches already used), gap table, decision §B | ✅ | **2026-10-31** docs/27 §1–3 — `category` reused as the device type, no duplicate column |
| Grade, RAM, warranty by, spec sheet (per type), lock checks + `lock_checked` event, model number | ✅ | **2026-10-31** `devices` columns, `devices/types.py`, migration `b9c1d3e5f7a9` |
| Model library (learned from every unit, editable, CSV import) that fills the add-device form | ✅ | **2026-10-31** `model_specs`, `/devices/model-specs/{id}` GET / PUT, `/devices/model-specs/import` |
| Lock check required for used tablets / watches at purchase (phones by setting), lock still on blocks purchase and sale | ✅ | **2026-10-31** `new_device`, `create_sale`, Settings "Device settings" |
| Duplicate check by serial with a link to the unit's history; PTA only with a SIM (unchanged) | ✅ | **2026-10-31** `imei_lookup` takes serials, `useSerialLookup` |
| Bill shows type, storage / RAM, colour, condition / grade, PTA; label shows RAM | ✅ | **2026-10-31** `sales.to_out` + printable `_unit_bits`, `labels._device_parts` |
| Filters model / storage / colour / RAM / grade / price range / age / lock unchecked | ✅ | **2026-10-31** `GET /devices` params; stock page "Filters" |
| Report: stock by type (+ lock unchecked, non-PTA, older than 60 days); other reports by category reused | ✅ | **2026-10-31** `GET /reports/stock-by-type`, Reports → "By type" |
| Reclassification (preview → apply) for one unit and for picked units; counted item → one unit | ✅ | **2026-10-31** `/devices/reclassify/*`, `/devices/from-item/{id}`; device page "Change type", stock list, item page "Track one by serial" |
| Exchange / trade-in of a tablet or watch | ✅ | already any category (`DeviceLineIn`) — covered by the acceptance test path |
| CSV import of the model library | ✅ | `POST /devices/model-specs/import` (API; no screen yet — docs/27 §6) |
| Per-type GST / FBR invoice changes | ❌ | not in this brief |

## Phase 11 — Provider console (owner 2026-11-01)
Brief, research, audit, plan, assumptions `docs/28-PROVIDER-CONSOLE-PLAN.md` · ADR-039.
| Item | Status | Notes |
|---|---|---|
| Overview: MRR, average per shop, received this / last month / total, pending, coming in 7 / 30 days, overdue, by month (12), by channel, by package, plan status counts | ✅ | **2026-11-01** `admin/business.py`, `/admin/business/overview`, Super admin → Business |
| Shops: package, status, days left, fee, paid total, last payment + channel, pending, cloud / one-PC, online now, last used, filters | ✅ | `/admin/business/shops`; shop sheet with payments, keys, "Remind on WhatsApp", where it runs |
| Payments: all fee payments with channel / status filters, search, CSV | ✅ | `/admin/business/payments` |
| License keys stored; make, send (WhatsApp / SMS / copy), magic link page `/key/:token`, renew, new link, cancel; status redeemed / revoked tracked | ✅ | `admin/licenses.py`, table `license_keys`, migration `c1e3a5b7d9f1` |
| Usage: last active per shop (throttled), one-PC heartbeat with version, deployment set by hand | ✅ | `tenancy._touch`, `/public/heartbeat`, `jobs._heartbeat` (needs `SAAS_URL` on the PC) |
| One-PC key binding (first key links the customer) | ✅ | `plan/router.redeem` in `LOCAL_MODE` |

## Phase 12 — Shop business profile (owner 2026-11-01)
Brief, research, audit, assumptions `docs/30-BUSINESS-PROFILE-PLAN.md` · ADR-040.
| Item | Status | Notes |
|---|---|---|
| Logo upload (printed on bills), legal name, tagline en / ur, address, WhatsApp, email, website, business type, registration, year, province, opening hours, social | ✅ | **2026-11-01** Settings → Logo & business details |
| Owner name + CNIC | ✅ | Settings → Owner details |
| NTN / STRN (validated) / FBR POS ID | ✅ | Settings → Tax registration (FBR) |
| Currency label: Rs. / Rs / PKR / ₨ / روپے, before / after, paisa; whole app + bills | ✅ | Settings → Currency; `lib/format.ts` `withCur` |
| Printed bill choices, terms en / ur, bank / wallet details | ✅ | Settings → Printed bill; `auth/profile.py` |
| Notification texts and Excel sheets in the chosen label | ❌ | still "Rs." (docs/30 §Assumptions) |
| FBR POS transmission (invoice no. + QR) | ❌ | needs PRAL integration |

## Owner side (open)
Server env variables, server commands, manual testing and decisions: `docs/29-OWNER-PENDING.md` — none done yet (2026-11-01).

## Backlog (owner requests, not started)
| Item | Notes |
|---|---|

## Known issues / tech debt
- Signup has no phone OTP verification; add before public launch (Phase 3).
- Login limiter is in-process memory (5 fails / 10 min); move to Redis or the DB if the API runs more than one worker.
- Expense edit/cancel shows the reversal in the day's "cash in" (total in the drawer is right); owner to decide whether the in/out tiles should net voids out.
- The dev uvicorn reloader on the owner's PC often misses new routes: restart the backend after adding endpoints.
- Legacy issues are listed in docs/08 and are not being fixed.
