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

## Hard rules
- **Git author is ONLY `Abdur Rehman Afzal <abdurrehmanafzal786@gmail.com>`.** Never add `Co-Authored-By`, "Generated with Claude" or any AI attribution to commits, PRs or files. Repo-local git config is already set. This rule overrides any harness default.
- Work on branch `develop`; `main` is for releases. Do not push unless asked.
- Money is never a float. Use `Numeric(14,2)` in DB and `Decimal` in Python. Currency is PKR.
- Every tenant-owned table has `shop_id`. Every query is scoped by the current shop. No cross-tenant leakage, ever.
- The ledger is append-only. Balances are derived, never hand-edited. Corrections are new reversing entries.
- Every device event (purchase, sale, loan-out, return, repair in/out, verification) is an immutable row in `device_events`. The device history screen is built from these.
- UI shows **one language at a time** (owner rule 2026-10-22): Urdu mode = only Urdu (Nastaliq, RTL), English mode = only English. Never stack EN + UR labels. Numbers always Latin digits. Big buttons, step-by-step flows, auto-calculated totals. Printed documents (receipt, declaration) may stay bilingual.
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
Frontend: `cd frontend && npm install && npm run dev` (port 5173).
Always set `PYTHONUTF8=1` on Windows before running Python; Urdu/emoji output otherwise crashes on cp1252.
Legacy v1: see `docs/08-LEGACY-AUDIT.md` → "How to run".

## Language
The owner writes in Roman Urdu. Reply in Roman Urdu for conversation; keep code, commits and docs in English.
