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
| Payment methods on sale and purchase (owner 2026-10-28) | ✅ | Cash · Online (all PK banks/wallets) · Cheque · From abroad (remittance: currency × rate, sender, service, MTCN) · Udhaar; own money account per way; details on bill and receipt. Khata payment form still to align |
| Android print/download via Chrome link (2026-10-28) | ✅ | 2-minute link for one address; autoprint |
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

## Phase 3 — SaaS and reach
| Item | FR | Status |
|---|---|---|
| Plans, multi-shop | FR-AUTH-05,07 | ⬜ |
| Staff polish, audit viewer | FR-AUTH-04,06 | 🔄 | Staff UI (add, role, password, disable) + cash/bank accounts UI with cash book done; audit viewer, attendance pending |
| WhatsApp / SMS / email + scheduled reports | FR-RPT-03,04,05,06 | 🔄 | Outbox + settings + templates + sale/purchase/payment hooks + wa.me share links done (`modules/notifications`); Meta Cloud API / SMTP senders pending |
| PWA + Capacitor Android/iOS | FR-PLT-02,03 | 🔄 | PWA done (manifest, icons, app-shell service worker). Capacitor Android project scaffolded with camera/share; APK build needs Android Studio PC + live API domain (docs/13). iOS needs a Mac |
| Docker cloud deploy + local installer + backups | FR-PLT-04,06 | 🔄 | **Live 2026-10-27** at https://mobileshop.oopsolutions.com on the OOP Solutions VPS behind Traefik (ADR-013, docs/12). CI (`ci.yml`: lint, tests, PostgreSQL migrations, frontend, Docker stack + smoke) and CD (`deploy.yml`: push main → ghcr.io images → `deploy.sh` with health check + rollback). Nightly backups via cron. First owner login via `python -m app.cli create-owner` (done). Local installer pending; off-server backup copy pending |

## Owner decisions pending (noted 2026-10-22)
| Item | Status | Notes |
|---|---|---|
| Laptop/desktop responsive layout (sidebar, wide tables, side-by-side sale screen) | 🔄 | v2: job side menu with F-keys on lg screens; content still phone-width (no side-by-side sale yet). Owner: test first, decide later |
| Offline Windows installer (local server + SQLite, optional cloud sync) | ⬜ | FR-PLT-04/05; only needed if target shops lack internet. Owner to decide |

## Phase 4 — Differentiators
| Item | FR | Status |
|---|---|---|
| AI assistant + OCR + pricing | FR-AI-01..04 | ⬜ |
| FBR POS | FR-TAX-04 | ⬜ |
| Cloud sync | FR-PLT-05 | ⬜ |

## Backlog (owner requests, not started)
| Item | Notes |
|---|---|
| Fingerprint (thumb) login (owner 2026-10-28) | After a normal login, unlock with the phone's fingerprint. Plan: Android app first (native biometric + session kept in the Android Keystore), website later (passkeys / WebAuthn). Android cannot tell whose finger it is, so on a shared shop phone any enrolled finger opens that account: offer it per person on their own phone, let the owner switch it off for staff, and keep void / settings behind the password. Owner to decide: app only or app + website; owners only or staff too |

## Known issues / tech debt
- Signup has no phone OTP verification; add before public launch (Phase 3).
- Login limiter is in-process memory (5 fails / 10 min); move to Redis or the DB if the API runs more than one worker.
- Expense edit/cancel shows the reversal in the day's "cash in" (total in the drawer is right); owner to decide whether the in/out tiles should net voids out.
- Screens still on the older styling: expenses page layout, settings, exchange, loans (amanat).
- The dev uvicorn reloader on the owner's PC often misses new routes: restart the backend after adding endpoints.
- Legacy issues are listed in docs/08 and are not being fixed.
