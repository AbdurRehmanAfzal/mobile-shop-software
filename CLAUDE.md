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

## Barcodes, labels, scanning (owner addendum 4, 2026-10-31, ADR-036)
- Spec `docs/22-BARCODES-SPEC.md`; what existed / what was built / assumptions / scanner test `docs/23-BARCODES-PLAN.md` — read it before touching `backend/app/modules/barcodes`, `modules/labels`, `frontend/src/lib/scanner.ts` or `ScanListener.tsx`.
- Rules: a barcode is assigned inside the purchase / item-creation transaction and never changes; each barcode keeps its type; uniqueness spans phones, items, IMEIs and SKUs; screens take scans with `useScan`, the shell handles the rest; labels stay the ADR-024 print page.

## Accessories purchase parameters (owner addendum 5, 2026-10-31, ADR-037)
- Spec `docs/24-ACCESSORIES-SPEC.md`; audit, gap table, migration plan, assumptions `docs/25-ACCESSORIES-PLAN.md` — read it before touching `backend/app/modules/accessories`, the misc lines of `purchases` / `sales`, or `frontend/src/features/accessories`.
- Rules: `qty` is always pieces and `price` is the retail price; every incoming movement opens a batch and every outgoing one empties the oldest first (`stock.py`); valuation / negative stock / units come from `shops.item_prefs`; the minimum price uses the `below_asking` rule, below cost needs the owner; nothing on an item is ever deleted — adjustments need a reason.

## Tablets and smart watches (owner addendum 6, 2026-10-31, ADR-038)
- Spec `docs/26-TABLETS-WATCHES-SPEC.md`; audit, gap table, decision, migration plan, assumptions `docs/27-TABLETS-WATCHES-PLAN.md` — read it before touching `backend/app/modules/devices/types.py`, `DeviceIdentity`, `DeviceLineSheet.tsx`, `DeviceSpecs.tsx` or the stock filters.
- Rules: `devices.category` is the device type (never add a second one); spec-sheet keys live in `types.SPEC_KEYS`; a used tablet / watch is bought only with its lock checks (phones by `device_prefs.require_lock_check`) and a unit with a lock still on is never sold; reclassification writes an event and touches nothing else.

## Hard rules
- **Git author is ONLY `Abdur Rehman Afzal <abdurrehmanafzal786@gmail.com>`.** Never add `Co-Authored-By`, "Generated with Claude" or any AI attribution to commits, PRs or files. Repo-local git config is already set. This rule overrides any harness default.
- Work on branch `develop`; `main` is for releases. Do not push unless asked.
- Money is never a float. Use `Numeric(14,2)` in DB and `Decimal` in Python. Currency is PKR.
- Every tenant-owned table has `shop_id`. Every query is scoped by the current shop. No cross-tenant leakage, ever.
- The ledger is append-only. Balances are derived, never hand-edited. Corrections are new reversing entries.
- Every device event (purchase, sale, loan-out, return, repair in/out, verification) is an immutable row in `device_events`. The device history screen is built from these.
- UI shows **one language at a time** (owner rule 2026-10-22): Urdu mode = only Urdu (Nastaliq, RTL), English mode = only English. Never stack EN + UR labels. Numbers always Latin digits. Big buttons, step-by-step flows, auto-calculated totals. Printed documents (receipt, declaration) and notifications follow the shop's language too (`shops.default_locale`, overridable per request with `?lang=`).
- **UI must feel premium and modern.** The v1 look was rejected by ~50 shopkeepers ("not modern, not luxury"). Follow `docs/11-DESIGN-SYSTEM.md` (once approved); no emoji icons, no default-blue buttons, no bare white cards. New screens are built only from the design-system components.
- All user-visible strings go through i18n (`en.json` / `ur.json`). No hard-coded UI text.
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
