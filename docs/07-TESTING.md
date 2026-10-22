# 07 — Testing Strategy

## Principles
- Business rules (ledger, balances, device state machine, tax, invoice numbering) get tests **before** UI.
- Every FR marked P0 has at least one test that names the FR id in its docstring.
- Tests run on SQLite in-memory for speed and on Postgres in CI for parity (Alembic migrations applied, not `create_all`).
- Tenant isolation is tested explicitly: create two shops, act in one, assert the other sees nothing (lists, gets by id, searches, reports).

## Layers
| Layer | Tool | What |
|---|---|---|
| Unit | pytest | PostingService recipes, state machine transitions, tax rounding, allocation FIFO |
| Property | hypothesis | Σdebit = Σcredit for any sequence of documents; balance equals statement total; device status equals replay of events |
| API | pytest + httpx `TestClient` | Every router: auth required, role enforced, shop scoped, validation errors bilingual |
| Scenario | pytest | S1–S6 from docs/01 as end-to-end API scripts (`tests/test_scenarios.py`) |
| Migration | pytest | `alembic upgrade head` on empty DB and downgrade one step |
| Frontend | Vitest + React Testing Library | bilingual primitives, money formatting, Urdu digits never shown |
| E2E | Playwright (phone viewport) | signup → purchase with verification → sale → payment → print preview |
| Manual | checklist in PR description | print on real 58 mm thermal printer; Urdu rendering on Android Chrome |

## Commands
```
cd backend && .venv\Scripts\pytest -q            # all backend tests
cd backend && .venv\Scripts\pytest -q -k scenario
cd frontend && npm test
cd frontend && npm run e2e                       # Playwright, phone viewport; needs backend on :8000
```

## Definition of done (per item in 06-PROGRESS.md)
1. Code + migration.
2. Tests at the right layer, green locally.
3. i18n keys in both `en.json` and `ur.json`.
4. Docs touched if behaviour or schema changed.
5. Session log entry.

## Test data
`backend/app/seeds/demo.py` creates a demo shop with the Nokia chain, one supplier, one customer with partial payments, one repair job. Used by E2E and for sales demos. Never runs in production unless `DEMO_DATA=1`.
