# Mobile Shop SaaS — Claude Code Project Context

Bilingual (English + Urdu RTL) mobile-shop management SaaS for Pakistani mobile shops,
with first-class support for **used-mobile** buying/selling, device verification, chain-of-custody
history, repairs, accessories, credit ledgers, FBR tax, reports, staff and multi-tenancy.
Owner / product decision-maker: **Abdur Rehman Afzal**.

## Start-of-session protocol (ALWAYS do this first)
1. Read `docs/06-PROGRESS.md` (what is done / in progress / next).
2. Read the last entry of `docs/09-SESSION-LOG.md` (where the previous session stopped, open questions).
3. Only then read the code you need. Do not re-audit the whole repo each session.
4. If the task touches business rules, read the relevant section of `docs/02-FUNCTIONAL-REQUIREMENTS.md`.
5. The `/kickoff` project skill does steps 1-2 for you (not `/resume`, which is a built-in Claude Code command).

## Owner's pending list
- `docs/29-OWNER-PENDING.md`: server env variables, server commands, manual testing and decisions still open on the owner's side (none done as of 2026-11-01). Keep it current: add every new env key, server command or manual-test step there.

## End-of-session protocol (ALWAYS do this before finishing)
1. Update `docs/06-PROGRESS.md` (tick items, move items between columns).
2. Append an entry to `docs/09-SESSION-LOG.md`: date, what was done, what was verified (tests run), what is next, open questions.
3. If a design decision was made, append an ADR to `docs/10-DECISIONS.md`.
4. Commit (see rules below). The `/handoff` project skill walks through this.

## Shop Audit programme (owner brief 2026-10-30; phases 1–10 delivered 2026-10-31, ADR-032)
- Requirements: `docs/16-SHOP-AUDIT-SPEC.md` (authoritative, verbatim owner brief).
- Living plan, gap analysis, phase checklist and the **exact next task**: `docs/17-SHOP-AUDIT-PLAN.md` — read it before touching `backend/app/modules/shopaudit` or `frontend/src/features/audit`.
- Status rows live in `docs/06-PROGRESS.md` (section "Phase 5 — Shop Audit"); per-session results in `docs/09-SESSION-LOG.md`.
- Rules for this work: read-only derivation from the ledger / documents / device events, additive migrations only, every figure traceable and drill-down-able, limitations shown (no due dates, no purchase tax, no remittance fees), owner-only security feed, no chart dependency (in-house SVG).

## Bulk Excel import / export (owner 2026-10-31, ADR-034)
- Plan, module verdicts, column specs and status: `docs/18-BULK-EXCEL-PLAN.md` — read it before touching `backend/app/modules/bulk` or `frontend/src/features/more/BulkPage.tsx`.
- Rules: the import only calls the existing services (never writes rows itself), preview before anything is written, all-or-nothing unless "skip rows with errors", samples recognised and skipped, owner + manager only.

## Subscription reminders (owner addendum 3, 2026-10-31, ADR-035)
- Spec `docs/19-SUBSCRIPTION-REMINDERS-SPEC.md`; gap analysis, schedule, assumptions and the owner's placeholders `docs/20-SUBSCRIPTION-REMINDERS-PLAN.md`; the owner's setup checklist `docs/21-OWNER-SETUP-CHECKLIST.md` — read it before touching `backend/app/modules/plan`, `admin/plans.py`, `admin/fees.py` or `frontend/src/components/PlanReminders.tsx`.
- Rules: the server decides the stage and whether the popup shows (server time + clock guard, snooze stored per user); the client only decides where (never on a form page); the popup is the one screen that shows en + ur + roman together; soft-lock never blocks paying, exporting or the backup; nothing is ever deleted.

## Package chooser on the fees page (owner 2026-11-17, ADR-095)
- Read ADR-095 before touching `backend/app/modules/plan/order.py`, `public/pricing.py`, `fees.approve` or `frontend/src/features/more/PackagePicker.tsx`.
- Rules: the total is always the server's quote (never the app's); a shop's own package costs its own agreed fee, other packages the list price; the order is a snapshot on the payment and reaches the shop only when the provider approves; a smaller package hides modules, it never deletes data.

## Returns report (owner 2026-11-17, ADR-097)
- Read ADR-097 before touching `backend/app/modules/returns/report.py`, `ReturnsReport.tsx` or the return form's reason chips.
- Rules: the report is read-only and derived (return documents, bill lines, phones, events) — only `reason_code` is stored; customers' returns and returns to suppliers stay apart; cost and the effect on profit only with `VIEW_COST`; a return undone later is never counted.

## Special price, sale, payment with package (owner 2026-11-17, ADR-098)
- Read ADR-098 before touching `organisations.fee_deal`, `order.deal_for` / `sale_pct` / `set_deal`, or `AdminDealCard.tsx`.
- Rules: the special price covers only the months it has left and is used up only by an approved payment; the shop always sees the list price beside its own; a sale never touches an agreed fee or a special price and is never stored as a shop's monthly fee; the provider's own payment goes through the same quote and `order.apply`.

## Deleting an entry (owner 2026-11-17, ADR-090 / ADR-099 / ADR-100)
- Read ADR-099 and ADR-100 before touching a `void_*` / `cancel_*` function, `devices.state.moved_since`, `delcheck/` or `DeleteBlockers.tsx`.
- Rules: a delete undoes only that entry's own effect and keeps it as Deleted; later separate entries are never cascaded — the delete is refused and `delete-check` says what to undo first; the check is read-only and must agree with the delete's own rule (change both together).

## Returns: accounting and correction (owner 2026-11-17, ADR-101)
- Read ADR-101 before touching `returns/service.py`, `ReturnWizard.tsx` or the return accounting.
- Rules: a returned phone re-enters stock at the cost on its bill line, never at what was handed back; a return reverses the sale's margin and the cut is income (the margin comes back only when the phone is sold again); a damaged return goes to Faulty; correcting a return is undo + re-entry in one transaction (`replace_return`), never an in-place edit of money; `tests/test_returns_audit.py` pins the books — keep it passing. The impact preview (ADR-102, `returns/preview.py`) runs the real posting with `commit=False` and rolls it back — never compute a preview figure in the app or in a second code path.

## Accounts & Reports (owner 2026-11-18, ADR-104)
- Audit and phases: `docs/38-ACCOUNTS-REPORTS-AUDIT.md` — read it before adding any accounts or report feature; build only what its matrix marks missing.
- Rules: one accounting engine (the ledger) — never a second set of balances; a report reads the ledger / documents and is checked in a test against them; no free manual journal entry (docs/38 §4); the general ledger's closing balance must equal the trial balance's line.

## Reports list (owner 2026-11-19, ADR-111)
- Read ADR-111 before touching `frontend/src/features/reports/catalog.ts`, `ReportsHub.tsx` or `ReportsHome.tsx`.
- Rules: `/reports` lists every report (it is not behind the `reports` module; the profit tabs live at `/reports?tab=…` and gate themselves); the list never computes or copies a report — an entry points at the screen where the report lives; **a new report or sheet gets an entry in `catalog.ts`** with its `hub.r.<id>.t / .d` strings in three languages and its module / role rule (`catalog.test.ts`).

## Old dealings and several pieces at once (dealers 2026-11-19, ADR-110)
- Plan: `docs/41-OLD-DEALINGS-AND-BULK-ENTRY-PLAN.md` — read it before touching `ledger.post_party_opening_balance` / `old_dealing`, `OldBalance.tsx`, `expandDraft` in `DeviceLineSheet.tsx` or the sale's "pick several" / "one price for all".
- Rules: a dealing from before the software is only a balance on the khata (`opening_balance` against the owner's capital) — never a device, stock, sale or profit, so no IMEI is asked; its total is the server's sum; it is undone by a reversing entry with a reason. "Several pieces" is an entry aid in the app only: every piece is still its own `devices` row and its own bill line.

## What a shop trades — accessories-only / laptop-only shops (owner 2026-11-19, ADR-109)
- Audit of the "Accessories Business Mode" brief, what exists, what is left: `docs/40-ACCESSORIES-MODE-AUDIT.md` — read it before adding an accessories, wholesale or branch feature; build only what its matrix marks missing.
- Rules: what a shop trades is derived from its modules (`admin/modules.lines`, `useTrade` in the app) — mobiles unless `no_mobiles`, plus `laptops`, `accessories`; never add a second business-type setting; `no_mobiles` is opt-in and must stay absent for existing shops; a shop without mobiles adds no phone / tablet / watch (server) but keeps and sells what it has; a package order never removes a provider-set switch (`OPT_IN`).

## Laptops (shopkeepers 2026-11-18, ADR-108)
- Research, plan and what is not built: `docs/39-LAPTOPS-PLAN.md` — read it before touching `devices.category` handling for `laptop`, `seeds/laptops.py`, `types.laptop_line` / `laptops_on`, or the laptop part of `DeviceLineSheet.tsx` / `DeviceSpecs.tsx`.
- Rules: a laptop is a `devices` row with `category = "laptop"` (never a second model); only a shop with the `laptops` module can add one, and a shop without it sees no laptop type, brand or model; identity is the serial number (or the shop's `LAP…` code), never an IMEI; a new laptop detail is a `specs` key, asked as common or under "More details"; the naming line is `laptop_line` on the server and `laptopLine` in the app — change both.

## Mobile numbers of any country (shopkeepers 2026-11-18, ADR-107)
- Read ADR-107 before touching `core/pk.normalise_phone`, `frontend/src/lib/phone.ts` or `PhoneInput`.
- Rules: a Pakistani number is stored as `03XXXXXXXXX` (never changed), any other as `+<code><number>`; every phone field goes through `normalise_phone` on the server and `PhoneInput` in the app; a WhatsApp link is built with `wa_number` / `waNumber`, never with a literal 92; the country table in `phone.ts` and `pk.py` change together (`tests/test_phone_countries.py`).

## Amanat to anyone, sticker ticks, IMEI barcode (shopkeeper 2026-11-18, ADR-106)
- Read ADR-106 before touching `loans.create_loan`, `labels/service.py` (`_fields`, `_device_parts`) or `LabelSheet.tsx`.
- Rules: amanat goes to any person of the shop (no kind check); the sticker's bars are the IMEI when the phone has a real one (15 digits), the shop's own code otherwise or when asked (`bar=code`) — `devices.barcode` itself never changes; a new sticker field must keep old apps printing what they printed (`fv`).

## Barcodes, labels, scanning (owner addendum 4, 2026-10-31, ADR-036)
- Spec `docs/22-BARCODES-SPEC.md`; what existed / what was built / assumptions / scanner test `docs/23-BARCODES-PLAN.md` — read it before touching `backend/app/modules/barcodes`, `modules/labels`, `frontend/src/lib/scanner.ts` or `ScanListener.tsx`.
- Rules: a barcode is assigned inside the purchase / item-creation transaction and never changes; each barcode keeps its type; uniqueness spans phones, items, IMEIs and SKUs; screens take scans with `useScan`, the shell handles the rest; labels stay the ADR-024 print page.

## Accessories purchase parameters (owner addendum 5, 2026-10-31, ADR-037)
- Spec `docs/24-ACCESSORIES-SPEC.md`; audit, gap table, migration plan, assumptions `docs/25-ACCESSORIES-PLAN.md` — read it before touching `backend/app/modules/accessories`, the misc lines of `purchases` / `sales`, or `frontend/src/features/accessories`.
- Rules: `qty` is always pieces and `price` is the retail price; every incoming movement opens a batch and every outgoing one empties the oldest first (`stock.py`); valuation / negative stock / units come from `shops.item_prefs`; the minimum price uses the `below_asking` rule, below cost needs the owner; nothing on an item is ever deleted — adjustments need a reason.

## Tablets and smart watches (owner addendum 6, 2026-10-31, ADR-038)
- Spec `docs/26-TABLETS-WATCHES-SPEC.md`; audit, gap table, decision, migration plan, assumptions `docs/27-TABLETS-WATCHES-PLAN.md` — read it before touching `backend/app/modules/devices/types.py`, `DeviceIdentity`, `DeviceLineSheet.tsx`, `DeviceSpecs.tsx` or the stock filters.
- Rules: `devices.category` is the device type (never add a second one); spec-sheet keys live in `types.SPEC_KEYS`; a used tablet / watch is bought only with its lock checks (phones by `device_prefs.require_lock_check`) and a unit with a lock still on is never sold; reclassification writes an event and touches nothing else.

## Provider console (owner 2026-11-01, ADR-039)
- Brief, audit, assumptions `docs/28-PROVIDER-CONSOLE-PLAN.md` — read it before touching `admin/business.py`, `admin/licenses.py`, `ProviderPage.tsx` or the redeem / heartbeat routes.
- Rules: every issued key is stored in `license_keys` (never only the redeemed nonce); figures are derived from `fee_payments` / `organisations`, never stored; activity stamps are best-effort and never block a request.

## Shop business profile (owner 2026-11-01, ADR-040)
- `docs/30-BUSINESS-PROFILE-PLAN.md` — read it before touching `auth/profile.py`, `BusinessProfile.tsx` or a printed document's header.
- Rules: printed documents use `profile.header_html / footer_html / money`; the app writes money only through `formatMoney` / `withCur` (never a literal "Rs."); money stays PKR.

## Len-den — money given / taken with no bill (owner 2026-11-02, ADR-041)
- `docs/32-LENDING-PLAN.md` — read it before touching `payments` (purpose / settle), `shopaudit/lending.py` or `PartyLending.tsx`.
- Rules: len-den is a payment with `purpose = 'lending'` in the person's one khata, posted as ledger type `lending`; it is never allocated when made; open len-den is derived (unallocated lending out − in); adjusting against bills moves no money, only bill paid / status; return dates live on the entry (`due_date`), the person's status is derived (`payments/lending_due.py`), reminders go only to people who owe the shop.

## Repair labs and the repair sticker (owner 2026-11-03, ADR-044)
- `docs/34-REPAIR-LABS-PLAN.md` — read it before touching `repairs/labs.py`, `labels/repair_labels.py`, `shopaudit/repairs.py`, `RepairLabs.tsx` or `RepairSticker.tsx`.
- Rules: a lab is a `technician` party; one `repair_dispatches` row per trip, one open per job; the lab's charge is booked on return (customer phone → cogs, own phone → its cost) and never again at delivery; the sticker never prints the screen lock.

## Branch transfers (owner 2026-11-04, ADR-046)
- `docs/35-COMPETITOR-RESEARCH.md` §5 item 2 — read ADR-046 before touching `backend/app/modules/transfers` or `frontend/src/features/transfers`.
- Rules: a move never changes a device row's `shop_id` — the sender's row gets `transferred_out` (status `transferred`), the receiver's row (new, or the unit's old one) gets `transferred_in`; items leave FIFO and arrive as a batch at that cost (same SKU); money moves at cost through `branch_transfer` (equity), never income; owner / manager only, same organisation, user linked to both shops.

## Accounting audit (owner 2026-11-05, ADR-048)
- Rules: a typed (not-from-stock) sale line never touches inventory — its cost is equity; returns of stock items leave stock at their stock value; every cost reaches a profit report (no posting to the bare `purchases` account); corrections are new dated groups (`ledger/corrections.py`); show a loss with "−" (`MoneyText signed`), never as a plain number.

## FBR Digital Invoicing (owner 2026-11-06, ADR-050)
- Research and plan `docs/36-FBR-INVOICING-RESEARCH.md`; read ADR-049 / ADR-050 before touching `backend/app/modules/fbr`, the receipt's FBR part or `FbrCard.tsx`.
- Rules: off per shop by default; the token is encrypted and write-only (never in a response, log or the app); a bill is queued in the sale's transaction and sent outside it; claim before posting, never post an accepted bill again; a rejected bill waits for "Send again"; tests never call the real FBR (monkeypatch `fbr.service.post`).

## Hard rules
- **Git author is ONLY `Abdur Rehman Afzal <abdurrehmanafzal786@gmail.com>`.** Never add `Co-Authored-By`, "Generated with Claude" or any AI attribution to commits, PRs or files. Repo-local git config is already set. This rule overrides any harness default.
- Work on branch `develop`; `main` is for releases. Do not push unless asked.
- Money is never a float. Use `Numeric(14,2)` in DB and `Decimal` in Python. Currency is PKR.
- Every tenant-owned table has `shop_id`. Every query is scoped by the current shop. No cross-tenant leakage, ever.
- The ledger is append-only. Balances are derived, never hand-edited. Corrections are new reversing entries.
- Every device event (purchase, sale, loan-out, return, repair in/out, verification) is an immutable row in `device_events`. The device history screen is built from these.
- UI shows **one language at a time** (owner rule 2026-10-22): Urdu mode = only Urdu (Nastaliq, RTL), English mode = only English. Never stack EN + UR labels. One agreed exception (ADR-094): in English mode a money / loan word may end with a short Roman Urdu hint in brackets — "To get (lene hain)" — listed in `i18n/gloss.ts`. Widened by ADR-112: an English button or heading about money may also carry one Roman Urdu line beneath it (`<Say k="say.…">`; the `say.*` keys of `en.json` are Roman Urdu) — use it for an action that can be misread instead of a longer name. Numbers always Latin digits. Big buttons, step-by-step flows, auto-calculated totals. Printed documents (receipt, declaration) and notifications follow the shop's language too (`shops.default_locale`, overridable per request with `?lang=`).
- **UI must feel premium and modern.** The v1 look was rejected by ~50 shopkeepers ("not modern, not luxury"). Follow `docs/11-DESIGN-SYSTEM.md` (once approved); no emoji icons, no default-blue buttons, no bare white cards. New screens are built only from the design-system components.
- All user-visible strings go through i18n (`i18n/locales/en.json` / `ur.json` / `roman.json`). No hard-coded UI text. The "?" explanations live apart in `i18n/help/<lang>.json` (loaded on demand, ADR-092): a new `<Help term>` needs its title / body / example there.
- Write tests for business logic (ledger, balances, device state machine, tax). Run them before committing.
- Keep docs current. Stale docs are bugs.

## Repo layout
```
CLAUDE.md                 this file
docs/                     living documentation (01..10) + archive/ of the old v1 docs
backend/                  FastAPI v2 (Python 3.12, SQLAlchemy 2, Alembic, pytest)
frontend/                 React + Vite + TypeScript + Tailwind PWA (web; Android/iOS via Capacitor later)
legacy/                   v1 prototype (reference only; do not extend). See docs/08-LEGACY-AUDIT.md
.claude/skills/           project skills: kickoff, handoff, pk-mobile-domain
```

## Running (v2)
Backend (Windows):
```
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -e .[dev]
set PYTHONUTF8=1
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```
Frontend: `cd frontend && npm install && npm run dev` (port 5173). Phone on same Wi-Fi: `npm run dev:lan`, open `http://<PC-IP>:5173` (allow Windows Firewall for Node).
Always set `PYTHONUTF8=1` on Windows before running Python; Urdu/emoji output otherwise crashes on cp1252.
Legacy v1: see `docs/08-LEGACY-AUDIT.md` → "How to run".

## Language
The owner writes in Roman Urdu. Reply in Roman Urdu for conversation; keep code, commits and docs in English.
