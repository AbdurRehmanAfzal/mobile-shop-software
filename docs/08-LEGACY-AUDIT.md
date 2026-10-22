# 08 — Legacy (v1) Audit

Audited 2026-10-22. Code lives in `legacy/` for reference. 4 commits (2026-06-25 → 2026-10-22), ~12.7k lines.

## What v1 is
FastAPI + SQLAlchemy + SQLite backend (`legacy/backend`, 57 endpoints) and React 18 + Vite + Tailwind + i18next frontend (`legacy/frontend`, 10 pages). Single shop, no login.

## What is good and is being reused
- Domain understanding: PTA status + SIM time, IMEI1/2/3, CNIC + photos on trade-in purchase, condition enum, per-device accessories concept, mobile history endpoint, party unification idea.
- Seed catalogue: 13 brands, 56 models, 5 storages, 15 colours with Urdu names (`legacy/backend/app/utils/seed_data.py`) → ported to v2 seeds.
- UI pattern and components: `BilingualLabel`, `BilingualButton`, `BilingualInput`, `BilingualAlert`, `PaymentModal`, `OutstandingBalanceSummary`, `BackButton`, Urdu font setup, `ur.json`/`en.json` strings → ported to TypeScript in v2.
- Spec text in `docs/archive/claude.md` (scenarios 1–5) → folded into docs/01 and docs/02.

## Why v1 is not extended (findings)
| # | Finding | Impact |
|---|---|---|
| 1 | No tenancy, no users, no auth. Every endpoint is public and single-shop. | SaaS impossible without touching every table and route |
| 2 | Money stored as `Float` everywhere; balances stored as mutable columns (`current_balance`, `credit_balance`, `total_paid`) updated by code paths rather than derived. | Rounding drift and silent inconsistencies; cannot audit |
| 3 | Two parallel models for the same concept: `Customer`/`Supplier` tables **and** unified `Party`, with "legacy" FKs on `Purchase`, `Supply`, `Exchange`, `Transaction`, `Payment`, `Reminder`. Duplicate module files (`app/models.py` vs `app/models/models.py`, same for `database`, `schemas`, `main`). | Ambiguous source of truth; half-finished refactor |
| 4 | No Alembic; schema changes = delete the DB. | Cannot upgrade a shop's data |
| 5 | No tests at all. | Every change is a regression risk |
| 6 | `routes/transactions.py` is 1,543 lines; ~850 of them are demo-data generators mounted as POST endpoints (`/demo/create-bulk-test-data`). | Dangerous in production, unmaintainable |
| 7 | Frontend pages are monoliths (`TradeInPurchase.jsx` 2,052 lines, `AddMobile.jsx` 1,783). Two different API clients (`services/api.js`, `utils/api.js`, the latter reading `process.env.REACT_APP_*` which does not exist under Vite). | Hard to test or reuse; one client is dead code |
| 8 | Device history is reconstructed by joining several tables rather than from an event log; loan-to-other-shop, repair, return flows do not exist. | The core differentiator cannot be built on this |
| 9 | Pinned `pydantic==2.5.0` / `fastapi==0.104.1` only build on Python ≤3.12; startup prints Unicode and crashes on Windows cp1252 unless `PYTHONUTF8=1`. Seed is non-idempotent on partial failure (brands inserted, models skipped). | Fragile setup |
| 10 | Docs (README/STEP*.md) describe 8 tables and 17 models; the code has 17 tables and 56 models. | Docs were not maintained |

Decision recorded as ADR-001 in `10-DECISIONS.md`: **rebuild v2, reuse domain knowledge, seeds and UI components.**

## How to run legacy v1 (reference only)
```
cd legacy/backend
py -3.12 -m venv venv
venv\Scripts\pip install -r requirements.txt
copy config\.env.example .env
set PYTHONUTF8=1
venv\Scripts\python -m uvicorn main:app --port 8000
# in another terminal
cd legacy/frontend && npm install && npm run dev     # http://localhost:5173
```
The legacy venv/node_modules created on 2026-10-22 are gitignored and may still exist locally.
