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
| Phase 0 exit demo on phone | – | 🔄 | Desktop browser verified; real-phone test still pending |
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
| Phone test on real device, Playwright E2E | ⬜ | |

## Phase 2 — Operations
| Item | FR | Status |
|---|---|---|
| Exchange | FR-TXN-07 | ✅ | `modules/exchanges`: trade-in purchase + sale + optional refund in ONE transaction (create_sale/create_purchase gained `commit=False`), EXC numbering, records previous/new balance; migration `218e639dde2c`; 2 tests incl. rollback |
| Accessories stock + pending tracker | FR-ACC-01,03,04 | ✅ | `modules/accessories`: items with SKU/avg cost/price/reorder, movements log, opening stock, adjust (+ ledger), purchase/sale/return/void/repair integration, low-stock, pending device-accessory tracker with deliver; migration `ab0e2601f475`; 5 tests |
| Repairs | FR-REP-01..05 | ✅ | `modules/repairs`: customer + stock-device jobs, fault codes EN/UR, received accessories, photos, estimate/advance (ledger), status flow + log, parts (stock) + labour + discount, deliver with bill + payment, outside technician cost → device cost, returned-unrepaired → faulty, job sheet print, repair-ready WhatsApp; migration `e95a0709d555`; 5 tests |
| Expenses, cash book, day close | FR-TXN-09,10 | ✅ | `modules/expenses`: seeded bilingual categories + custom, EXP numbering, ledger `expense:<key>`, salary/technician links, void; day-close preview/close per cash account; migration `e1b1a31dbe63`; 4 tests |
| Dashboard + reports + export | FR-RPT-01,02 | 🔄 | `modules/reports`: dashboard, profit & loss (sales, COGS, gross, repair/other income, expenses by category, owner drawing, net), cash flow per account, stock ageing — done. PDF/Excel export pending |
| Tax | FR-TAX-01..03 | ✅ | settings, per-invoice tax, `GET /reports/tax` |

## Phase 3 — SaaS and reach
| Item | FR | Status |
|---|---|---|
| Plans, multi-shop | FR-AUTH-05,07 | ⬜ |
| Staff polish, audit viewer | FR-AUTH-04,06 | 🔄 | Staff UI (add, role, password, disable) + cash/bank accounts UI with cash book done; audit viewer, attendance pending |
| WhatsApp / SMS / email + scheduled reports | FR-RPT-03,04,05,06 | 🔄 | Outbox + settings + templates + sale/purchase/payment hooks + wa.me share links done (`modules/notifications`); Meta Cloud API / SMTP senders pending |
| PWA + Capacitor Android/iOS | FR-PLT-02,03 | ⬜ |
| Docker cloud deploy + local installer + backups | FR-PLT-04,06 | 🔄 | Hostinger VPS compose stack + backups + guide ready (docs/12); first live deploy pending domain + VPS access; local installer pending |

## Phase 4 — Differentiators
| Item | FR | Status |
|---|---|---|
| AI assistant + OCR + pricing | FR-AI-01..04 | ⬜ |
| FBR POS | FR-TAX-04 | ⬜ |
| Cloud sync | FR-PLT-05 | ⬜ |

## Known issues / tech debt
- Frontend has no service worker yet (installable manifest only). Add `vite-plugin-pwa` in Phase 3.
- Signup has no phone OTP verification; add before public launch (Phase 3).
- No rate limiting on `/auth/login` yet; add middleware before cloud deploy.
- Dashboard tiles show zeros until the ledger/devices modules exist (Phase 1).
- Legacy issues are listed in docs/08 and are not being fixed.
