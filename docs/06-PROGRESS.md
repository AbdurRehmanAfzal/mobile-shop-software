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

## Phase 13 — Reports module audit (owner 2026-11-01)
Audit + gap analysis + status `docs/31-REPORTS-MODULE-AUDIT.md`.
| Item | Status | Notes |
|---|---|---|
| Audit of 15 categories + common requirements | ✅ | **2026-11-02** most of it existed (shop audit) |
| Error + retry on audit screens (was: loading forever) | ✅ | R1 |
| Sales report: counter vs credit, paid / part / unpaid, per employee / customer, filters | ✅ | R2 `/audit/sales` |
| Purchase report: paid / owed, per supplier / employee | ✅ | R3 |
| Staff report (owner-only security columns) | ✅ | R4 `/audit/staff` |
| Customer / supplier counts, stock by supplier | ✅ | R5 |
| Overview "needs a look", installments in udhaar | ✅ | R6 / R7 |
| Complete report: insights, sales, purchases, employee activity | ✅ | R8 |
| Print / Excel on every audit screen | ✅ | R9 |
| `audit-parties.spec.ts` journey "Every dealing" step | ❌ | pre-existing e2e failure, follow-up |
| Merge to `main` / deploy | ⏸ | waits for the owner's approval (owner rule for this brief) |

## Phase 14 — Len-den: money given / taken with no bill (owner 2026-11-02)
Plan, audit, assumptions `docs/32-LENDING-PLAN.md`, ADR-041.
| Item | Status | Notes |
|---|---|---|
| `payments.purpose` (`bill` / `lending`), migration `e3a5c7e9f1b3` | ✅ | additive; every old payment is `bill` |
| Len-den in the person's one khata, own ledger type `lending` | ✅ | never put on a bill when made |
| Person's screen: open len-den, given / taken / from bills, give / take buttons, entries | ✅ | `PartyLending` |
| Adjust free money against open bills (net of len-den only) | ✅ | `POST /payments/settle/{party}` |
| Reports keep it apart: cash & bank, day report, overview, udhaar, complete report | ✅ | |
| Audit screen `/audit/lending` (period, open, per person, series, entries, print / Excel) | ✅ | |
| Demo shop has len-den (Tariq, Star Mobiles, Usman, Bilal) | ✅ | |
| Return dates + reminders (WhatsApp to who owes, night job, home / overview alerts for what the shop owes) | ✅ | docs/32 §7, ADR-042, migration `f4b6d8f0a2c4` |

## Phase 15 — A "?" with an example on every field, tab and card (owner 2026-11-02)
Plan `docs/33-HELP-EVERYWHERE-PLAN.md`, ADR-043.
| Item | Status | Notes |
|---|---|---|
| `Help` takes any term + small size; `Section` / `KV` / `PhoneInput` / `CnicInput` / `ImeiInput` help | ✅ | |
| Coverage test: every term used has title / body / example in en / ur / roman | ✅ | `components/Help.test.ts` |
| Audit (13 screens), counter / sale / return / exchange / payment, purchase / stock / device fields, items / repairs / installments / expenses / khata / len-den, settings / staff / profile / notifications / bulk / accounts / fees / reports, super admin | ✅ | ~1,050 icons, 1,127 help terms |
| Found on the way: audit bills status "open" read "In repair" | ✅ | sale words now |
| Found on the way: person's journey counted len-den as "paid / received later" | ✅ | len-den apart (`lent` / `borrowed`) |
| Found on the way: sheets opened inside moved boxes misplaced; the person page was wider than the phone | ✅ | sheets render into `<body>`; journey header wraps |

## Phase 16 — Repair labs and the repair sticker (owner 2026-11-03)
Plan, research, assumptions `docs/34-REPAIR-LABS-PLAN.md`, ADR-044.
| Item | Status | Notes |
|---|---|---|
| `repair_dispatches` (one row per lab trip), migration `a5c7e9b1d3f6` | ✅ | additive |
| Send to a lab / back fixed or not with the charge / cancel; one trip at a time | ✅ | charge to the lab's khata; customer phone → cost of repair, own phone → its cost |
| Labs list and each lab's record | ✅ | `/repairs/labs`, `/repairs/labs/:id` |
| Repair sticker with fields picked before printing; scan opens the job | ✅ | `/labels/repairs` |
| Repairs in the shop audit + report sections | ✅ | `/audit/repairs` |

## Phase 17 — User manual for buyers (owner 2026-11-03)
`docs/manual/README.md`.
| Item | Status | Notes |
|---|---|---|
| Module-wise manual, 26 chapters, English / Urdu / Roman | ✅ | `docs/manual/{en,ur,roman}.md` (parts in `parts/`) |
| 53 screenshots per language from a demo shop | ✅ | `frontend/scripts/manual-shots.mjs` → `docs/manual/img/<lang>/` |
| A4 PDF + HTML per language (cover, contents, page numbers, Nastaliq RTL) | ✅ | `frontend/scripts/manual-pdf.mjs` |
| Super admin manual, English + Roman, 17 screenshots | ✅ | `admin-{en,roman}.md`, `frontend/scripts/manual-admin-shots.mjs` |
| Developer and setup manual | ✅ | `developer-en.md` |
| Counter UX + Appearance + bill QR sections (2026-11-08): Profile menu (ch. 4), Appearance page (ch. 5, replaces Dark / Look), walk-in customer, extra cash against old udhaar and the QR on every bill (ch. 8), short person form with "More details" and the QR print switch (ch. 23), in en / ur / roman | ✅ | new shots `profile-menu`, `appearance`, `bill-qr`, `bill-check`; PDFs rebuilt |
| Package on credit (owner 2026-11-09, ADR-053): super admin extends a package now, fee later (months, amount, promised day, private note); the shop sees "Fee still to pay" (not paid / part paid / paid), a fee invoice and the reminder line; payments clear unpaid fee first; list chip + "Fee unpaid" filter; user + super admin manuals | ✅ | `fee_dues`, `fee_payments.to_dues` (`b3d5f7a9c1e4`), `plan/invoice.py`, `FeeCreditCard.tsx`, `tests/test_fee_dues.py`, `e2e/fee-credit.spec.ts` |
| Delete a customer (owner 2026-11-09, ADR-054): super admin moves a whole customer to Deleted (type the name, private reason); no sign-in, out of lists / figures / night jobs; "Bring it back" restores it; nothing erased; super admin manual | ✅ | `organisations.deleted_*` (`c5e7a9b1d3f6`), `admin/bin.py`, `ShopBinCard.tsx`, `tests/test_shop_bin.py`, `e2e/shop-bin.spec.ts` |
| Purchase form (owner 2026-11-09): asking price marked optional ("Asking price (optional)", set later from the phone's page); battery health % now asked for phones too (open box / used / patched), kept on reclassify; help + user manual ch. 6 | ✅ | `DeviceLineSheet.tsx`, `DeviceDetailPage.tsx`, `devices/types.py`, `tests/test_purchases.py` |
| iPhone region code + SIM setup (owner 2026-11-09, ADR-055): LL/A, ZA/A, CH/A … and Physical + eSIM / Dual eSIM / Dual physical / Physical only, "New" for the shop's own; plus battery cycle count for a used Apple unit; shown in stock line, device page, sticker; help + manual | ✅ | `devices.region_code / sim_type / battery_cycles` (`d7f9b1c3e5a8`, `e1a3c5e7f9b2`), `AppleVariant.tsx`, `tests/test_purchases.py`, `e2e/apple-variant.spec.ts` |
| Stock views (owner 2026-11-09): Cards / Table (Excel-style, sort by any column, totals, frozen device column) / Grid / List on the stock page, choice kept per device; help + user manual ch. 11 | ✅ | `StockViews.tsx`, `StockPage.tsx`, `e2e/stock-views.spec.ts` |
| Add stock: Back no longer loses the entry (owner 2026-11-09): step 2 is its own history entry (`?step=2`), header Back / phone back / browser back return to step 1 with everything kept; an **Edit** button on each added phone (sheet says Change phone / Save) | ✅ | `PurchaseWizard.tsx`, `PageHeader onBack`, `e2e/add-device.spec.ts` |
| Owner testing round (2026-11-09): stock **Fields** chooser for all four views + Download / Share beside it with the same fields, filters and order (`/exports/stock?cols=…`); a half-filled pop-up form no longer closes on a stray tap; Back / phone back / step bar keep the entry in Sell, Add stock, Exchange, Return (`lib/steps.ts`); stickers on tablets (print tab opened on the tap, in-app view if blocked) | ✅ | `StockViews.tsx`, `exports/router.py`, `ui.tsx Sheet`, `lib/steps.ts`, `lib/files.ts`, `e2e/forms-keep.spec.ts` |
| Corrections after saving + check before saving (owner 2026-11-09, ADR-056): owner / manager correct IMEI 1 / 2 (`corrected` event) and the purchase's dealer / customer (ledger correction group, khata moves); Add stock shows every detail and saves only after "I have checked" | ✅ | `devices.correct_imei`, `purchases.change_party`, `PurchaseWizard` review, `tests/test_corrections_after_purchase.py`, `e2e/fix-after-purchase.spec.ts` |
| Exchange / return settlement audit (owner brief 2026-11-10, ADR-057): trade-in applied to the bills, shop pays all / part / none, payment method, first bill linked, returns with smaller credit or rest in khata, receipts say Customer se lena / ko dena, idempotent, dashboard counts real money | ✅ | `exchanges/service.py`, `returns/service.py`, `ExchangeWizard`, `ReturnWizard`, `tests/test_exchange_return_settlement.py` (19), `e2e/exchange-return.spec.ts` |
| Open balances (owner brief 2026-11-10, ADR-058): lena / dena by Mobile/IMEI, customer, dealer, technician on one screen; totals counted once; drill-down to bills / jobs / payments; receive / pay from a row with the form prefilled; unallocated multi-phone bills; idempotent payment form | ✅ | `balances/service.py`, `BalancesPage.tsx`, `tests/test_open_balances.py`, `e2e/balances.spec.ts` |
| Stock screen audit (owner brief 2026-11-10, ADR-059): kind tabs (phones / tablets / watches; accessories / spare parts / other → items), status cards (available / on hand / approval / inspection / repair / faulty / items low & out / value at cost) that filter, filters (condition, PTA, age, bought from, cost), filters kept on return, 'Bought from' field, barcode search, phone → its open balances. Reservation not added (needs new rules) | ✅ | `devices.stock_status`, `StockCards.tsx`, `tests/test_stock_screen.py`, `e2e/stock-screen.spec.ts` |
| Reserve + shelf + SIM time optional (owner 2026-11-10, ADR-060): hold a phone / item pieces for a customer (sale refuses others, fills the customer's hold), Reserved card / filter; phone shelf (set, search, filter); Non-PTA SIM time optional; change seller from the phone page | ✅ | `reserve/`, `ReserveCard.tsx`, `accessory_reservations`, `a7c9e1b3d5f8`, `tests/test_reserve.py`, `e2e/reserve.spec.ts` |
| Phone page styles (owner / shopkeepers 2026-11-10, ADR-061): Classic (unchanged, default) + Smart, Tabs, Tiles, Compact with each action beside its value and the customer with the money; chosen per device | ✅ | `DeviceLayouts.tsx`, `DeviceDetailPage.tsx`, `e2e/device-styles.spec.ts` |
| Udhaar: how the part paid now was paid (owner 2026-11-10, ADR-062): Cash / Online / Cheque with bank, TID or cheque no., on sale and purchase; lands in that money account | ✅ | `PayPicker.tsx` (`PartPay`), `SaleWizard.tsx`, `PurchaseWizard.tsx`, `tests/test_paymode.py`, `e2e/udhaar-part-pay.spec.ts` |
| Change a phone's purchase price after saving (owner / shopkeepers 2026-11-10, ADR-063): owner / manager, while the shop holds it; correction group Inventory ↔ seller's khata, bill + phone cost follow, history keeps old price | ✅ | `purchases/service.change_cost`, `POST /purchases/cost`, `DeviceDetailPage.tsx`, `tests/test_purchase_cost_change.py`, `e2e/purchase-cost.spec.ts` |
| Mobile number optional for a new person (migration b9d1f3a5c7e2, nullable only); stock 'Bought from' + filter follow a changed seller (owner 2026-11-10, ADR-064) | ✅ | `parties/*`, `devices/service.with_source`, `PartyForm.tsx`, `tests/test_parties.py`, `tests/test_corrections_after_purchase.py`, `e2e/party-no-phone.spec.ts` |
| Sale asks 'Who is buying?' (customer search in front, walk-in only by a tick); change a sale's customer after the sale — walk-in → customer or wrong → right, correction group, history keeps both (owner 2026-11-12, ADR-065) | ✅ | `SaleWizard.tsx`, `sales/service.change_customer`, `POST /sales/{id}/customer`, `SalesPage.tsx`, `tests/test_sale_customer_change.py`, `e2e/sale-customer.spec.ts` |
| Stock summary model link filters by model id (iPhone 17 ≠ 17 Pro Max); faults on a faulty phone (24 common + shop's own), faulty phones stay in the stock list and can be sold, bill says 'Sold as faulty' (owner 2026-11-12, ADR-066; migration c3e5a7b9d1f4) | ✅ | `Faults.tsx`, `StockPage.tsx`, `StockSummaryPage.tsx`, `devices/types.FAULTS`, `tests/test_faulty.py`, `e2e/faulty-and-models.spec.ts` |
| Short sticker (under 22 mm, e.g. 48×18 on a 58 mm MPT-II roll): name + price, full-width barcode, IMEI only; note in the sticker sheet; manual guide for 58 mm Bluetooth printers / RawBT (owner 2026-11-12) | ✅ | `labels/service.COMPACT_H`, `LabelSheet.tsx`, `tests/test_labels.py` |
| Change what was paid at a purchase (cash entered for an udhaar bill, or the other way), also after its phones were sold; correction group money account ↔ seller's khata; later payments stay (owner 2026-11-13, ADR-067) | ✅ | `purchases/service.change_paid`, `PaidFix.tsx`, `tests/test_purchase_paid_change.py`, `e2e/purchase-paid.spec.ts` |
| A person's phones by brand → model → phone with counts, to give / to get per level and in all, group pay / receive (oldest bill first), list view kept (owner 2026-11-13, ADR-068) | ✅ | `PartyUnits.tsx`, `PaymentForm.tsx` (`allocations`), `units/service._unit_row`, `e2e/party-brands.spec.ts` |
| Thumb impression on the ID check: optional photo, printed in the declaration's thumb box (empty box for an inked thumb); not a NADRA match (owner 2026-11-13, ADR-069; migration d5f7b9c1e3a6) | ✅ | `verification/*`, `VerifyPage.tsx`, `tests/test_verification.py`, `e2e/verify-thumb.spec.ts` |
| RAM in the review before saving stock; SIM (network) lock on a phone — unlocked / locked + network, information only (owner 2026-11-13, ADR-070; migration e7a9c1d3f5b8) | ✅ | `DeviceLineSheet.tsx` (`SimLockField`), `PurchaseWizard.tsx`, `tests/test_sim_lock.py`, `e2e/add-device.spec.ts` |
| CP ID as a PTA status; SIM lock / PTA on old phones by Edit details; purchase's person picker lists everyone; an already-saved number offers that person (owner 2026-11-13, ADR-071) | ✅ | `devices/state.PtaStatus`, `ListsPages.tsx`, `PartyForm.tsx`, `e2e/cpid-simlock-party.spec.ts` |
| Stock worth by brand / model counts every phone the shop holds (in stock, faulty, in repair, on approval, on loan), like the stock cards — a faulty OnePlus was missing (owner 2026-11-13) | ✅ | `reports/service.stock_summary`, `tests/test_reports_simple.py` |
| Phone serial number (optional) under the IMEIs on add / edit, shown in the review; RAM beside storage (owner 2026-11-13) | ✅ | `DeviceLineSheet.tsx`, `devices/schemas.DeviceUpdate._serial`, `tests/test_phone_serial.py`, `e2e/add-device.spec.ts` |
| Mark a phone faulty while adding stock (More details → It came in faulty; purchase and old stock); Mark faulty afterwards unchanged (owner 2026-11-13) | ✅ | `DeviceLineSheet.tsx` (`FaultPicker`), `devices/service.mark_faulty_on_entry`, `tests/test_faulty.py`, `e2e/faulty-on-add.spec.ts` |
| Salesman sees today's cash in hand and bank only: no galla / bank totals, today's hisaab only, account balances hidden (owner 2026-11-13, ADR-072) | ✅ | `reports/service.dashboard`, `reports/router.day`, `ledger/router.accounts`, `HomePage.tsx`, `DayReportPage.tsx`, `tests/test_salesman_cash.py`, `e2e/salesman-cash.spec.ts` |
| Change purchase price: Typing mistake (cash corrected, khata unchanged) or The price really changed (khata); cancel a wrong len-den and re-enter it the other way (owner 2026-11-14, ADR-073) | ✅ | `purchases/service.change_cost(mode)`, `DeviceDetailPage.tsx`, `PartyLending.tsx`, `tests/test_purchase_cost_change.py`, `e2e/lending-cancel.spec.ts`, `e2e/purchase-cost.spec.ts` |
| Operations runbook (internal; secrets only as placeholders) | ✅ | `operations-en.md` |
| Owner review of the wording | ⏳ | `docs/29-OWNER-PENDING.md` D |

## Phase 18 — Competitor gaps (owner 2026-11-04, `docs/35` §5)
| Item | Status | Notes |
|---|---|---|
| 1. Trial balance + balance sheet (Reports → Balance) | ✅ | `/reports/trial-balance`, `/reports/balance-sheet`, ADR-045; cash-flow per account already existed (`/reports/cash-flow`) |
| 2. Phone / item transfer between branches (More → Branch transfers, phone and item pages) | ✅ | `/transfers`, ADR-046, migration `b6d8f0a2c4e7` |
| 5. Customer repair status link (job page → WhatsApp; public `/r/<token>`) | ✅ | `/public/repair/{token}`, ADR-047 |
| 3, 4, 6 (Play Store, FBR live, landing proof) | ⬜ | backlog below |

## Phase 19 — Accounting audit (owner 2026-11-05, ADR-048)
| Item | Status | Notes |
|---|---|---|
| Invariants over every shop (phone stock, item stock vs batches, balanced groups, negatives) | ✅ | phones matched everywhere; 6 shops had item stock −150 (fixed) |
| Typed sale line cost → equity, not stock; its return the same | ✅ | `sales`, `returns` |
| Supplier return of a stock item → out of stock at stock value | ✅ | was credited to `purchases` |
| Repair part cost = FIFO / average that left stock | ✅ | was always average |
| Dealer-bill other item → `expense:other_purchases` (in every profit report) | ✅ | |
| One-time corrections of old postings | ✅ | migration `c7e9a1b3d5f8`, `ledger/corrections.py` |
| Repair profit matched to the bill; lab charges on open jobs apart | ✅ | `shopaudit/repairs.py` |
| A loss shows "−" (day report, reports, best sellers, item profit, Cash & bank) | ✅ | `MoneyText` |
| Opening balance of a money account settable later; below-zero explained | ✅ | Cash & bank |

## Phase 20 — FBR-style tax invoice (owner 2026-11-06, `docs/36`, ADR-049)
| Item | Status | Notes |
|---|---|---|
| Research: POS integration (Tier-1) vs Digital Invoicing; phones under the Ninth Schedule | ✅ | `docs/36-FBR-INVOICING-RESEARCH.md` |
| Bill: amount in words (en / ur, lakh / crore), cashier, time | ✅ | `core/words.py`, receipt |
| Bill: total excl. tax, tax by rate, phones' Ninth-Schedule note | ✅ | `invoice_lines.tax_rate` |
| Cash given and change (sale screen + bill) | ✅ | `invoices.cash_tendered` |
| Setting: phones' sales tax paid at import (off by default) | ✅ | Settings → tax |
| FBR Digital Invoicing, our side: settings + encrypted token, queue / retry / claim, payload per PRAL spec, FBR number + QR on the bill, Settings card, bill status | ✅ | `modules/fbr`, ADR-050, migration `e9a1c3d5f7b0`; off by default |
| FBR sandbox run, then production | ⬜ | needs NTN / STRN + IRIS token and a tax adviser (`docs/29` H) |
| Returns as DI debit / credit notes; POS (IMS) for Tier-1 | ⬜ | after the sandbox run |

## Phase 21 — Counter UX round (owner 2026-11-07, ADR-051)
| Item | Status | Notes |
|---|---|---|
| Landing page: FBR-ready bills band, latest round, guide + FAQ | ✅ | PR #32, live |
| Profile menu top right (name, phone, role, shop, My profile, Settings, Log out) | ✅ | `Shell.tsx` `ProfileMenu` |
| Sale starts as "Walk-in customer"; "Choose customer" opens the picker | ✅ | bills / lists say "Walk-in customer" |
| New person form: name, phone, type; the rest under "More details" | ✅ | `PartyForm.tsx` (customers, dealers, labs) |
| Extra cash given → change, or against the customer's old udhaar | ✅ | `invoices.khata_adjusted`, migration `a1c3e5f7b9d2`; ADR-051 |
| Laptop side panel: Dashboard + Shop section (Day's hisaab, Reports, Staff, Settings, All options) as tappable rows | ✅ | `Shell.tsx` |
| Side panel: People & khata, Shop audit, Cash & bank, Purchases as two-up tiles; one 1280×720 screen | ✅ | PR #34; now `app/SidePanel.tsx` |

## Phase 22 — Appearance + bill QR (owner 2026-11-07, ADR-052)
| Item | Status | Notes |
|---|---|---|
| Appearance page (`/more/appearance`): light / dark, design, colours, main colour, text size, corners, numbers font, back to default | ✅ | `AppearancePage.tsx`, `lib/theme.ts`; opened from the dashboard, the profile menu and More |
| Three more designs for the dashboard and the laptop side panel: Tiles, Simple, Bold (Classic stays the default) | ✅ | `SidePanel.tsx`, `HomePage.tsx` `GlanceSet` / `OtherJobs`; each fits 1280×720 in en and ur |
| QR on every sale bill → `/b/<token>`, the bill online without login (no name, phone, full IMEI, cost or balance) | ✅ | `sales/bill_link.py`, `GET /api/v1/public/bill/{token}`, `BillCheckPage.tsx`; print switch `print_prefs.qr` (on) |
| Landing page: a screen beside every text (owner 2026-11-08: "log text kam parhte hain") — each new feature, module card, module guide row and "why it is different" card carries a small app screen; a tap opens it big (Esc / tap closes); FBR band shows the printed bill + the bill opened from its QR; galleries gain bill, bill page, verify, repair link, balance sheet, Appearance, Bold design | ✅ | `LandingPage.tsx` `Thumb` / `Zoom`; `scripts/landing-assets.mjs` adds 12 phone + 3 laptop screens, opening cash so the demo never shows minus, `LANDING_ONLY` / `LANDING_LANG` to retake a few |
| Header "Messages": opens the messages (Owner also gets a Settings tab); staff no longer see an endless loader | ✅ | `NotificationsPage.tsx` tabs, More tile → `?tab=settings` |

## Owner side (open)
Server env variables, server commands, manual testing and decisions: `docs/29-OWNER-PENDING.md` — none done yet (2026-11-01).

## Backlog (owner requests, not started)
| Item | Notes |
|---|---|
| Competitor gap 3: Play Store release | API 36, AAB, privacy + deletion pages (`docs/29` G) |
| Competitor gap 4: FBR / PRA live e-invoicing (PRAL) | per-shop switch, off by default; queue when offline; FBR no. + QR on the bill (FR-TAX-04) |
| Competitor gap 6: landing social proof + instant trial | customer count, shopkeeper quotes; optional self-start trial with OTP (owner decision) |

## Known issues / tech debt
- Signup has no phone OTP verification; add before public launch (Phase 3).
- Login limiter is in-process memory (5 fails / 10 min); move to Redis or the DB if the API runs more than one worker.
- Expense edit/cancel shows the reversal in the day's "cash in" (total in the drawer is right); owner to decide whether the in/out tiles should net voids out.
- The dev uvicorn reloader on the owner's PC often misses new routes: restart the backend after adding endpoints.
- Legacy issues are listed in docs/08 and are not being fixed.
