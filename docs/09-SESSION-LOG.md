# 09 — Session Log

Newest entry at the bottom. Each entry: date · done · verified · next · open questions. Keep entries short; details belong in the other docs.

---

## 2026-10-22 — Session 1: clone, run v1, audit, plan v2
**Done**
- Cloned repo, ran v1 backend (Python 3.12 venv) and frontend (Vite); fixed Windows cp1252 crash with `PYTHONUTF8=1`; reseeded DB after partial seed.
- Audited v1 (docs/08). Decided to rebuild as v2 (ADR-001) reusing domain knowledge, seeds and bilingual components.
- Restructured repo: `legacy/` (v1 code), `docs/archive/` (v1 docs), new `docs/01–10`, `CLAUDE.md`, `.claude/skills/{kickoff,handoff,pk-mobile-domain}`.
- Wrote business requirements, functional requirements with FR ids, architecture, data model, roadmap, progress tracker, testing strategy.
- Set repo git author to Abdur Rehman Afzal; created branch `develop`.

- Built v2 backend foundation: FastAPI app factory, bilingual error envelope, SQLAlchemy 2 base (UUID, Timestamped, ShopScoped, Numeric money), organisations/shops/users/user_shops/audit_log, Alembic initial migration, JWT access+refresh, bcrypt, PK phone normalisation, X-Shop-Id tenancy context, role→capability matrix, endpoints for auth/me/shops/staff/audit.
- Built v2 frontend foundation: Vite + React 18 + TypeScript + Tailwind, i18n (en/ur, Urdu default, RTL), bilingual primitives (BiLabel, BiButton, BiInput, BiAlert), API client with auto-refresh, zustand auth store, login/signup pages, mobile shell with bottom nav, dashboard placeholder, More page (language switch, logout), PWA manifest.

**Verified**
- `backend: .venv\Scripts\pytest -q` → 17 passed (auth, tenancy isolation, roles, audit, migration/model parity). `ruff check` clean.
- Live smoke: `uvicorn app.main:app` → `/health` ok, signup created org+shop+owner, `/me` returned shop, duplicate phone → 409 bilingual error, `/docs` 200.
- `frontend: npx vitest run` → 7 passed; `tsc -b --noEmit` clean; `vite build` ok (309 kB JS). Dev server proxies `/api` to backend; login through proxy works; page root is `lang="ur" dir="rtl"`.

**Next** (first step of next session)
1. Catalogue module (`backend/app/modules/catalogue`): brands/models/storages/colours tables + seeds ported from `legacy/backend/app/utils/seed_data.py` + list endpoints. This closes Phase 0.
2. Then Phase 1 in this order: parties → ledger/PostingService → devices + events → verification → purchase → sale → payments → loans → returns, each with tests, then the matching frontend screens.
3. Open the app on a real Android phone over LAN (`vite --host`) and note Urdu rendering issues.

**Open questions for the owner**
1. Cloud hosting preference (any VPS vs managed, e.g. Hetzner/DigitalOcean vs Railway/Render)? Affects Docker setup in Phase 3.
2. WhatsApp: is a Meta Business account available, or should we start with "share via WhatsApp" links (no API cost)?
3. Should Urdu be the default language on first launch? (Assumed yes.)
4. Trial length and plan prices (assumed 14 days; prices TBD).
5. Design direction: owner reported ~50 shopkeepers found the v1 UI "not modern, not luxury". Proposal: build `docs/11-DESIGN-SYSTEM.md` + an interactive mockup of 3 key screens (dashboard, device purchase with verification, sale) and get sign-off before Phase 1 UI.

---

## 2026-10-22 — Session 2: design mockup
**Done**
- Published design mockup canvas (Direction A "Emerald & Gold"): https://claude.ai/artifact/AEWv7XqFN62dXjuNWmGnad — 5 phone screens: dashboard (light), used-mobile purchase/verification step, sale confirm, device history timeline, dashboard (dark). Interactive links between screens; accent colour tweakable in the canvas.
- Drafted `docs/11-DESIGN-SYSTEM.md` v0.1 (tokens, type, shape, components) marked pending approval.
- Renamed project skill `resume` → `kickoff` (`/resume` is a built-in Claude Code command).

**Verified**: canvas published and opens; no code changes this session, so no tests run.

**Next**
1. Owner reviews the mockup, ideally with a few shopkeepers; answers the 3 questions at the end of docs/11 (light vs dark default, accent, English eyebrow everywhere or headings only).
2. On approval: translate tokens into `frontend/tailwind.config.js` + rebuild `components/Bilingual.tsx` and the shell to the design system; then catalogue module and Phase 1.

---

## 2026-10-22 — Session 3: design system approved and implemented
**Done**
- Owner approved Direction A with "both light and dark". Decisions recorded in docs/11 (v1.0) and ADR-007.
- Implemented tokens as CSS variables (light / dark / system) + Tailwind mapping; theme store with persisted Light/Dark/System toggle (More → Appearance); rebuilt BiLabel/BiButton/BiInput/BiAlert and added BiSegmented; new Shell (monogram, bell, bottom nav with raised FAB), Dashboard (hero card, tiles, quick actions), AuthLayout, MorePage, ComingSoon; Lucide icons replace emoji; Manrope font; icon/manifest recoloured.

**Verified**: `npx tsc -b --noEmit` clean; `npx vitest run` → 9 passed; `vite build` ok. Dev server reflects changes via HMR.

**Next**
1. Catalogue module (brands/models/storages/colours + seeds from legacy) → closes Phase 0.
2. Phase 1: parties → ledger → devices + events → verification → purchase → sale → payments → loans → returns, each with tests and screens built on the design system.
3. Owner: open http://localhost:5173 on a phone over LAN (`npm run dev -- --host`), check Urdu rendering in both themes.

---

## 2026-10-22 — Session 4: catalogue module (Phase 0 backend complete)
**Done**
- `modules/catalogue`: Brand, Model, Storage, Colour with global (`shop_id NULL`) + shop-private rows; list/create endpoints under `/api/v1/catalogue/*`; search models by model name, Urdu name or brand; create requires `TRANSACT` (technicians read-only).
- `seeds/catalogue.py`: idempotent seed ported from legacy and extended (17 brands with Urdu names incl. Itel/Sparx/QMobile/Honor; 108 models incl. Nokia/Itel/QMobile feature phones with reference prices; 7 storages incl. 4MB for feature phones; 16 colours with hex). Runs at app startup (lifespan) outside tests.
- Alembic migration `7f4c986a8f9f`.

**Verified**: `pytest -q` → 24 passed (7 new: idempotent seed, Urdu names/model counts, filter+search, per-shop privacy, case-insensitive conflicts, storages/colours validation, role check). `ruff` clean. Live: restart seeded `{'brands': 17, 'models': 108, 'storages': 7, 'colours': 16}`; `/catalogue/brands` and `?q=105` answer correctly.

**Next**: Phase 1 — Parties module (FR-MST-03), then ledger + PostingService (FR-TXN-01,02).

---

## 2026-10-22 — Session 5: parties module (Phase 1 starts)
**Done**
- `core/pk.py`: shared Pakistani validators — `normalise_phone` (accepts +92/92/0, spaces, Urdu digits), `normalise_cnic` (#####-#######-#), `is_valid_imei` (Luhn). Auth schemas now import from it.
- `modules/parties`: Party (customer/supplier/shop/technician via `kinds` JSON list), phone unique per shop, cached `balance` (ledger-owned, not writable via API), list with `kind`/`q`/`with_balance`/`include_inactive`, `GET /by-phone/{phone}`, create/update with audit. Write access: TRANSACT or REPAIR_CREATE (technicians read-only).
- Alembic migration `975f04ac8e85`.

**Verified**: `pytest -q` → 32 passed; `ruff` clean; migration applied to dev DB; backend running with `--reload`.

**Next**: Ledger + PostingService (FR-TXN-01, 02): `ledger_groups`, `ledger_entries`, cash accounts, balanced posting, party balance recompute, property tests (Σdebit = Σcredit).

---

## 2026-10-22 — Session 6: ledger + PostingService
**Done**
- `modules/ledger`: `CashAccount` (cash/bank/easypaisa/jazzcash, default "Cash / نقد" created at signup and shop creation), `LedgerGroup`, `LedgerEntry` (append-only; `reversed_by_group_id` is the only mutable field).
- `service.py`: `Posting` builder (`.debit()/.credit()`), `post()` validates Σdebit = Σcredit and one-sided non-negative lines, checks party/cash accounts belong to the shop, refreshes `Party.balance`; `reverse()` mirrors a group once; `party_balance`, `cash_balance`, `account_total`, `party_statement` (running balance, opening before date_from), `cash_book`, `post_party_opening_balance` (diary migration: Dr party / Cr equity or the reverse).
- Account keys in `accounts.py` (`party:<id>`, `cash:<id>`, sales, inventory, cogs, discounts, tax_payable, repair_income, other_income, expense:<cat>, equity, suspense).
- Endpoints `/api/v1/ledger`: accounts (list/create), `accounts/{id}/book` (VIEW_COST), `parties/{id}/statement`, `parties/{id}/opening-balance` (VOID), `groups/{id}` (VIEW_COST), `groups/{id}/reverse` (VOID).
- Alembic `6d403b33df28`.

**Verified**: `pytest -q` → 43 passed (11 new: unbalanced/negative rejected, S4 credit-sale-then-payments derives 0 balance, reversal mirrors + blocks double reversal, hypothesis property over random sale/payment sequences, API: default cash account, opening balance → statement → reverse, cash book with opening balance, isolation + roles, balance read-only but ledger-driven, unknown party rejected). `ruff` clean.

**Next**: Devices + device_events + state machine (FR-DEV-01..04), then verification (FR-VER), then purchase documents posting to the ledger.

---

## 2026-10-22 — Session 7: devices, events, state machine, IMEI passport
**Done**
- `modules/devices/state.py`: enums (condition, PTA status, verification status, device status, event type), `MONEY_EVENTS`, `NEUTRAL_EVENTS`, `TRANSITIONS` table, `next_status()`.
- `models.py`: `devices` (unique IMEI1 per shop; projection: status, current_party_id, verification_status, cost/asking price, cycle_no, event_count, last_event_at), `device_events` (seq per device, status_after, party, amount, ledger_group, document ref, data JSON), `device_accessory_items` (bundle: came_with / pending_from vendor|shop / expected / given_at_sale / promised_to_customer_at).
- `service.py`: `apply_event()` (validates transition, appends event, updates projection; purchase after sold bumps cycle_no); `new_device()` + `add_opening_stock()` (device + PURCHASED event + ledger Dr inventory / Cr equity); `update_device()` (asking price change → PRICE_CHANGED event); `set_accessories()`; `raise_event()` for non-money events (loans only to parties of kind shop; money events rejected with a bilingual hint); `imei_lookup()`, `history()`, `list_devices()` with joins to catalogue names.
- Router hides `cost_price` and purchase amounts from roles without VIEW_COST; opening stock requires VIEW_COST.
- `ledger_entries.device_id` now a real FK (named batch constraint for SQLite).
- Alembic `07033ee5abb9`; test client gained `put()`.

**Verified**: `pytest -q` → 52 passed (9 new: transition table, opening stock → event + ledger + accessories, box-pack not_required / non-PTA needs SIM time, IMEI unique per shop + lookup + isolation, loan out/return with party-kind rule + history seq/names, invalid transition 409 + money events 422 + faulty/repair flow, price change event + search/filters, accessories replace/validation, salesman cost hiding). `ruff` clean. Migration applied to dev DB.

**Gotchas**: IMEI test fixtures must be Luhn-valid (`490154203237518`, `356938035643809`, `356789104552375`); SQLite batch migrations need named FKs.

**Next**: Verification module (FR-VER-01..04): verification record with CNIC/seller photos, eGadget result, PTA check, declaration; `VERIFIED` event; sale hard-block on `flagged`; file upload service for photos.

---

## 2026-10-22 — Session 8: verification + file uploads
**Done**
- `modules/files`: `POST /api/v1/files` (multipart; jpg/png/webp/pdf ≤ 8 MB; stored under `UPLOAD_DIR/<shop_id>/<purpose>-<uuid>.<ext>`), `GET /api/v1/files/{path}` only for the caller's shop prefix. `belongs()` used by other modules to validate paths.
- `modules/verification`: `verifications` (one per device cycle): seller party, CNIC no + front/back photos, seller photo, device photos, eGadget result/ref/screenshot, PTA check (updates device PTA status), declaration signed/path, physical notes. `compute()` → `flagged` if eGadget flagged, `clear` when CNIC + both CNIC photos + seller photo + eGadget clear + declaration, else `pending` with `missing[]`. `upsert()` raises a VERIFIED event (party = seller) and copies CNIC to the party. `override()` (VERIFY_OVERRIDE) records reason, marks clear with an event carrying `override: true`. `assert_sellable()` blocks `flagged` (device_flagged) and `pending` (not_sellable). `GET …/verification/declaration` returns a bilingual A5 HTML purchase declaration for printing.
- Alembic `04c1bc608d58`. `cat` fixture moved to conftest.

**Verified**: `pytest -q` → 57 passed; `ruff` clean after fixture move.

**Next**: Purchase documents (FR-TXN-03): from supplier / walk-in / shop; device lines create devices + PURCHASED event + verification stub; accessory lines (needs accessories stock → minimal `accessories` table) ; ledger: Dr inventory / Cr party, Dr party / Cr cash for paid-now. Then sales.

---

## 2026-10-22 — Session 9: purchases
**Done**
- `modules/purchases`: `Purchase` (no `PUR-000001` from `shops.next_purchase_no`; kind supplier/walk_in/shop/trade_in; subtotal/discount/total/paid; cash account; status posted/voided; ledger group; reference; void reason) + `PurchaseLine` (device|misc, unit_cost, discount_share, net_cost).
- `create_purchase()`: validates party (supplier kind auto-added; shop kind required for kind=shop), discount ≤ subtotal, paid ≤ total; allocates discount proportionally (remainder on last line); devices created via `new_device()` or re-used when the IMEI exists with status sold/returned_to_supplier (identity refreshed, cycle continues) else `imei_in_stock` 409; accessories bundle stored; ledger: Dr inventory (per device, device_id) / Dr purchases (misc) / Cr party total / Dr party & Cr cash for paid; PURCHASED event per device with `verification_status` (supplier box-pack → not_required, else pending).
- `void_purchase()` (VOID): refuses if any device has non-verification events after the purchase or is not in stock; reverses the ledger group; RETURNED_TO_SUPPLIER event with `void: true`.
- Shop counters `next_purchase_no`, `next_repair_no` added (server_default 1). Alembic `c2b50b843a18`.
- Reads: list requires VIEW_COST; get allowed for the creator.

**Verified**: `pytest -q` → 63 passed; `ruff` clean.

**Gotchas**: a Pydantic field named `date` must not share its name with the `date` type in the same module (use `import datetime as dt`); SQLite batch `add_column` with NOT NULL needs `server_default`.

**Next**: Sales/invoices (FR-TXN-04, FR-TXN-12): INV numbering, device lines (assert_sellable, SOLD event, Dr cogs/Cr inventory at device cost), discount, tax (shop settings), paid-now, accessories given/pending, receipt HTML; then payments (FR-TXN-05), loans (FR-TXN-06), returns (FR-TXN-08).

---

## 2026-10-22 — Session 10: sales / invoices
**Done**
- `modules/sales`: `Invoice` (INV-000001 via `shops.invoice_prefix` + `next_invoice_no`; optional party — cash sale must be fully paid; subtotal/discount/tax_rate/tax_inclusive/tax_amount/total/paid/cost_total; status open/partially_paid/paid/returned/void; ledger group; loan_id placeholder; fbr_invoice_no placeholder) + `InvoiceLine` (device|misc; unit_price, discount_share, tax_share, line_total, cost, warranty_days, accessories_given, accessories_pending).
- `create_sale()`: device must be in_stock (or with this customer for approval; on_loan → settle loan instead); `assert_sellable()` enforced with inline owner override (`override_reason` + VERIFY_OVERRIDE) that records the verification override; `compute_tax()` inclusive/exclusive; discount and tax allocated across lines; ledger: Dr cogs / Cr inventory per device at cost, Dr party (or cash for cash sale) total / Cr sales net / Cr tax_payable, Dr cash / Cr party for paid-now; SOLD event per device (amount = price, data invoice_no/paid_now/warranty); accessories given → `given_at_sale`, pending → `pending_from=shop` + promised date; warranty start set.
- `void_invoice()` (VOID): refuses if device moved after the sale; reverses ledger; SALE_RETURNED event with `void: true`; resets accessory flags.
- `receipt_html()` thermal 80 mm / A4: shop header (EN + UR), lines with IMEI and given accessories, discount, tax, total, paid, due on this bill, party running balance, pending accessories line, bilingual footer.
- Cost/profit hidden without VIEW_COST. Alembic `7efefcded18f`.

**Verified**: `pytest -q` → 72 passed; `ruff` clean.

**Next**: Payments in/out with allocation (FR-TXN-05) → invoice `paid`/status updates; loans (FR-TXN-06) out/settle (return or sale to the shop); returns (FR-TXN-08) partial sale/purchase returns with refund / keep-as-credit / keep-as-income choice.

---

## 2026-10-22 — Session 11: payments and loans
**Done**
- `modules/payments`: `Payment` (PAY-000001 from `shops.next_payment_no`; party; direction in/out; amount; cash account; method cash/bank/easypaisa/jazzcash/card/other; reference; allocations JSON; status posted/voided; ledger group). `create_payment()`: explicit allocations (document must belong to the party, direction must match, cannot exceed amount or document due) or FIFO auto-allocation across open invoices (in) / unpaid purchases (out); leftover stays unallocated (advance → negative party balance). Ledger: in = Dr cash / Cr party; out = Dr party / Cr cash. `void_payment()` (VOID) undoes allocations and reverses the ledger.
- `modules/loans`: `Loan` (device, shop party, out_at, expected_back_at, status out/returned/sold, invoice_id). `create_loan()` → LOANED_OUT (document loan), `return_loan()` → LOAN_RETURNED, `sell_loan()` → `create_sale(..., loan=loan)` (sale allowed for an on-loan device only to the holding shop; invoice carries `loan_id`). `GET /loans` with `overdue` flag.
- Devices generic events endpoint now rejects loaned_out/loan_returned (`use_loans_endpoint`) so loan rows are the single source.
- Alembic `68c40ffb1e1f` (payments, loans, `shops.next_payment_no` server_default 1). `test_migrations` disposes the engine in `finally` (Windows file lock).

**Verified**: `pytest -q` → 79 passed; `ruff` clean. The Nokia chain (S1–S3) runs end-to-end through the API: walk-in purchase + verification → loan to Shop B → settle as sale (1,000, paid 500) → void when it comes back → sale to Sara 1,500 → history shows all six events with party names; cash ends at +500.

**Design note**: a *void* is a full reversal (money refunded). The "device came back after partial payment, keep the 500 as credit/income" choice belongs to the returns module (FR-TXN-08), next.

**Next**: Returns (sale return with refund / keep as credit / keep as income; purchase return to supplier), then exchange (FR-TXN-07), then the frontend Phase 1 screens on the design system.

---

## 2026-10-22 — Session 12: returns (Phase 1 backend core complete)
**Done**
- `modules/returns`: `ReturnDoc` (RET-000001 from `shops.next_return_no`; kind sale/purchase; document ref; party; amount; settlement refund/credit/income; refund_amount; kept_amount; cash account; reason; lines JSON; ledger group).
- `sale_return()`: selected invoice lines (not already returned); computes the customer's excess paid for the returned value; settlement **refund** (Dr party / Cr cash), **credit** (balance stays on account), **income** (Dr party / Cr other_income — the "keep the 500" case); ledger reverses sales net, tax share and COGS/inventory per line; SALE_RETURNED event with settlement details; accessory flags reset; invoice `returned_total`, status → returned when all lines back; `balance_due = max(0, total − returned − paid)`.
- `purchase_return()`: selected purchase lines whose devices are in stock/faulty; Dr party / Cr inventory (or purchases for misc); optional supplier cash refund; RETURNED_TO_SUPPLIER event; purchase `returned_total`.
- Cash sales without a customer are returned by voiding the invoice (explicit error).
- Alembic `6e125ad21486` (returns, returned_total/returned_at columns, `next_return_no`).

**Verified**: `pytest -q` → 84 passed; `ruff` clean.

**State of Phase 1 backend**: parties, ledger, devices/events, verification, purchases, sales, payments, loans, returns all done with tests. Remaining Phase 1 item is the **frontend screens** on the approved design system (parties, stock + device detail/history + IMEI search, purchase wizard with verification, sale wizard with receipt, payments, loans, returns). Phase 2 then adds exchange, accessories stock, repairs, expenses/cash book, dashboard/reports, tax report.

**Next**: Frontend Phase 1 screens, starting with the API client types + parties list/create, then stock/device detail/history, then purchase and sale wizards.

---

## 2026-10-22 — Session 13: owner review of the frontend
**Feedback**: (1) Vite dev server had a stale Tailwind config → restarted. (2) "Urdu mein poora Urdu, English mein sirf English, mix nahi" → stacked bilingual labels removed.
**Done**: `Bilingual.tsx` now renders only the active language via `useLang()` (BiLabel/BiButton/BiInput/BiAlert/BiSegmented); Shell shows `name_ur` in Urdu mode; dashboard/auth cleaned of eyebrow props; tests updated (Urdu-only vs English-only). CLAUDE.md, docs/02 FR-PLT-01 and docs/11 updated.
**Verified**: `tsc` clean, `vitest` green, `vite build` ok.
**Next**: unchanged — Phase 1 frontend screens.

---

## 2026-10-22 — Session 14: single-language print documents + notification foundation
**Owner asks**: receipts/declarations in the shop's selected language (not bilingual); on stock-in and on sale send WhatsApp (and optionally email) to the owner and to the customer, all optional.
**Done**
- Receipt (`GET /sales/{id}/receipt`) and purchase declaration (`GET /devices/{id}/verification/declaration`) now render in ONE language: `shops.default_locale` by default, `?lang=en|ur` to override; Urdu versions are RTL with Nastaliq, numbers kept LTR.
- `modules/notifications`: `shops.notification_settings` JSON (owner WhatsApp/email, per-trigger toggles for owner/customer/seller on sale/purchase/payment, optional language override) via `GET/PUT /api/v1/notifications/settings` (MANAGE_SETTINGS); `messages` outbox (channel, audience, recipient, template, lang, subject/body, `wa.me` link, event/document refs, status queued/sent/failed/skipped, provider); templates EN/UR for sale_customer, sale_owner, purchase_owner, purchase_seller, payment_customer with balance / pending-accessory lines; hooks inside `create_sale`, `create_purchase`, `create_payment` (same transaction as the document); `GET /api/v1/notifications`, `POST /{id}/mark-sent` for manual WhatsApp sharing.
- Senders (Meta WhatsApp Cloud API, SMTP) are the next step in Phase 3; until then the UI opens the `wa.me` link.
- Alembic `01c39f11d273`.

**Verified**: `pytest -q` → 89 passed; `ruff` clean.

**Next**: frontend Phase 1 screens (unchanged), with a notifications settings screen under More.

---

## 2026-10-22 — Session 15: Phase 1 frontend screens
**Done** (three commits)
- Shared UI kit (`PageHeader`, `Sheet`, `Row/List`, `Chip`, `MoneyText`, `BalanceLabel` with lena/dena wording, `SearchBox`, `Stepper`, `KV`, `Section`, `Empty/Loading/ErrorText`), `PartyPicker` with inline create, typed API hooks (`lib/queries.ts`, shop-scoped keys, `useDocMutation` invalidates everything), `lib/files.ts` (upload, object URLs, `openPrintable` for receipts/declarations), full EN/UR string sets.
- Parties (list/search/kind filter/with-balance, add/edit sheet, detail with hero balance, kinds, statement with running balance, receive/pay payment sheet with method + allocation result).
- Stock (list with status filters and search, IMEI lookup sheet with seen-before/times-bought/Luhn, device detail with chips, cost hidden for salesmen, actions: sell, verify, loan out, faulty/repair/approval events, price change, note; accessories chips; history timeline).
- Purchase wizard (4 steps; device sheet with IMEI lookup warnings, brand chips, model search, storage/colour, condition, PTA + SIM time, cost/asking/warranty, accessories came-with/pending-from-vendor; misc lines; discount/paid/account/reference; done screen with verify + declaration print per device).
- Verification page (seller picker, CNIC, three photo tiles with camera capture + upload, eGadget segmented + portal link + ref, PTA checked + 8484 SMS link + result, declaration checkbox + print, physical notes, result/missing, owner override sheet).
- Sale wizard (customer or cash, pick from in-stock devices, per-line price/warranty/accessories given/pending with promised date, misc, discount/paid/account, inline override reason for owner/manager, done screen with thermal/A4 print).
- Sales list (status filter) + detail (lines with profit for managers, totals, print, return sheet with line selection + settlement, void sheet); purchases list + detail (return with refund, void); payments and returns lists; loans page (return / sell-to-shop); shop settings; notifications settings + message queue with wa.me share and mark-sent; More menu; dashboard wired to live data; bottom-nav FAB → new sale.

**Verified**: `tsc -b --noEmit` clean, `vitest` 10 passed, `vite build` ok. Not yet verified: real-phone layout, camera capture on Android, print dialogs on a thermal printer.

**Next**: owner walkthrough on a phone → fix list; then Phase 2 (exchange, accessories stock, repairs, expenses/cash book, reports + dashboard endpoint, tax report).

---

## 2026-10-22 — Session 16: Phase 2 backend part 1 (expenses, repairs, accessories)
**Done**
- Expenses: categories (11 seeded with Urdu + per-shop custom), `EXP-` numbering, Dr `expense:<key>` / Cr cash, staff salary and technician links, void; day-close preview and close (opening/in/out/expected/counted/difference) per cash account and date.
- Repairs: `REP-` numbering; customer device (desc + IMEI) or stock device (SENT_TO_REPAIR/REPAIR_RETURNED events); fault codes EN/UR; received accessories; condition photos; estimate + advance (Dr cash / Cr party); status transitions with log; parts + labour + discount; deliver posts `repair_income` and takes payment; stock devices: outside technician cost → Dr inventory / Cr technician party and device cost raised; returned-unrepaired marks stock device faulty; job sheet (80 mm, shop language); repair-ready WhatsApp template + setting.
- Accessories: `accessories` + `accessory_movements` (weighted average cost), opening stock (Dr inventory / Cr equity), adjust (+ other_income / stock_loss expense), purchase misc lines with `accessory_id` → stock in at net cost (Dr inventory), sale misc lines → stock out at avg cost (COGS), void/return reverse movements, repair parts consume stock at delivery (COGS inside the bill group), low-stock list, pending device-accessory tracker (`GET /accessories/pending`, `POST /pending/{id}/deliver`).
- Migrations `e1b1a31dbe63`, `e95a0709d555`, `ab0e2601f475` (named batch FKs for SQLite).

**Verified**: `pytest -q` → 103 passed; `ruff` clean.

**Next**: Exchange (FR-TXN-07) as one transaction (purchase trade-in + sale), reports/dashboard endpoints (FR-RPT-01/02, FR-TAX-03), then frontend screens for expenses, repairs, accessories, reports.

---

## 2026-10-22 — Session 17: exchange + reports (Phase 2 backend part 2)
**Done**
- Exchange (S5): `POST /api/v1/exchanges` = trade-in purchase (kind trade_in, credit to customer) + sale + optional cash refund, all in one DB transaction (rollback on any failure, test proves no orphan purchase/device). Stores previous balance, trade-in value, new total, paid, new balance. `create_sale` / `create_purchase` accept `commit=False`.
- Reports: `/reports/dashboard` (any role; cost/profit hidden without VIEW_COST), `/reports/profit-loss`, `/reports/cash-flow`, `/reports/tax`, `/reports/stock-ageing` (REPORTS_ALL). Default range = current month. Decimals serialised as strings.
- Alembic `218e639dde2c`.

**Verified**: `pytest -q` → 107 passed; `ruff` clean.

**Next**: frontend Phase 2 screens (expenses + day close, repairs, accessories, exchange, reports; dashboard switches to `/reports/dashboard`), then PDF/Excel export, then Phase 3 (staff UI, WhatsApp/SMTP senders, PWA/Capacitor, deploy).

---

## 2026-10-22 — Session 18: Phase 2 frontend
**Done**: Expenses page (category chips, add, live today in/out/expected, day-close sheet with counted vs expected); Repairs (list open/all, new job with fault and received-accessory chips, estimate/advance/promised date, auto job-sheet print; detail with status sheet, parts editor incl. quick-add from accessory stock, labour, deliver sheet, status log); Accessories (stock/low/pending tabs, add with opening stock, adjust for managers, mark pending delivered); Exchange wizard (customer → old device via the purchase device sheet → new device from stock → live new-balance preview → receipt); Reports (date range P&L with expense categories, cash flow per account, tax, stock ageing); dashboard now reads `/reports/dashboard` with repair/exchange quick actions; More menu gained repairs, exchange, accessories, expenses, reports. All strings EN/UR.
**Verified**: `tsc` clean, `vitest` 10 passed, `vite build` ok; backend 107 passed.
**Not yet verified**: real-phone walkthrough; thermal printer output.
**Next**: Phase 3 — staff management UI, cash/bank accounts UI, WhatsApp Cloud API + SMTP senders, PDF/Excel export, PWA service worker + Capacitor, Docker deploy; plus E2E tests.

**Addendum (Session 18)**: Staff page (owner) and Cash & bank page (owner/manager, add Easypaisa/JazzCash/bank with opening balance, cash book) added. Phase 3 items still needing owner input: Meta WhatsApp Business account (for auto-send), hosting choice (for deploy), plan prices.

---

## 2026-10-22 — Session 19: deployment setup for Hostinger VPS
**Done**: `backend/Dockerfile` (python 3.12 slim, non-root, migrations on start, healthcheck), `deploy/web.Dockerfile` (Vite build → Caddy), `deploy/Caddyfile` (HTTPS, /api proxy, SPA fallback, security headers), `deploy/docker-compose.yml` (db/backend/web, volumes), `deploy/.env.example`, `deploy/backup.sh`, `docs/12-DEPLOYMENT.md`, ADR-008. Production guard: refuses default/short SECRET_KEY when APP_ENV=prod.
**Verified**: 108 backend tests pass; `alembic upgrade head --sql` against the PostgreSQL dialect renders all 35 tables without error. Not verified: Docker build and a live Postgres run (no Docker on the dev PC).
**Needs from owner**: domain/subdomain for the app, VPS SSH access (or run the commands in docs/12 yourself).
