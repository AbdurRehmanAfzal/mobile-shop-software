# 03 — Architecture

## Decision summary (why v2, not v1)
The v1 prototype in `legacy/` proved the domain understanding and the bilingual UI pattern but has no tenancy, no auth, float money, dual legacy/unified models, no migrations, no tests, 2,000-line screens and demo-data generators inside API routes. Those are foundations, not features; retrofitting them costs more than rebuilding. **v2 is a fresh codebase that reuses v1's domain knowledge, seed catalogue, Urdu strings and UI components where they fit.** Full findings: `08-LEGACY-AUDIT.md`.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 (typed), Alembic, Pydantic v2 | Owner already uses this stack; fast to build; async-capable; great OpenAPI for the mobile apps |
| Database | PostgreSQL 16 (cloud SaaS) · SQLite (local offline install) | Same ORM code; Postgres for multi-tenant scale and row-level security; SQLite for a single shop PC |
| Auth | JWT (access 30 min, refresh 30 days), bcrypt, staff PIN switch | Stateless for mobile apps |
| Frontend | React 18 + Vite + **TypeScript** + Tailwind + react-i18next + TanStack Query + Zustand | Type safety for a large app; i18n already proven in v1 |
| Mobile | PWA first (installable), then **Capacitor** wrapping the same frontend for Android/iOS (camera, share, print, Bluetooth printer) | One codebase, one team; native shell only where needed |
| Printing | HTML/CSS print templates (58/80 mm + A4) → browser print; PDF via WeasyPrint on the server for email/WhatsApp | Any printer works day one |
| Messaging | WhatsApp Cloud API (Meta) + SMS gateway fallback; email via SMTP/Resend | Cheaper and more reliable in Pakistan than Twilio |
| Files | Local disk (offline) / S3-compatible object storage (cloud) behind one `StorageService` | CNIC and device photos |
| AI | Claude API (claude-sonnet-5-5 default; claude-haiku-5-5 for OCR-style extraction) via tool-calling over shop data | Urdu understanding, vision for CNIC/IMEI |
| Jobs | APScheduler in-process (local) / Celery+Redis (cloud) behind one `TaskRunner` | Reports, reminders, backups |
| Deploy | Docker Compose (api, db, worker, web); local installer = one `docker compose up` or a packaged Windows service later | |
| Tests | pytest + httpx (API), hypothesis for ledger invariants, Playwright for critical flows | |

## Multi-tenancy model
- `organisations` → `shops` → everything else carries `shop_id` (and `organisation_id` on shops/users/plans).
- Request context resolves `current_user`, `current_shop` from the JWT + `X-Shop-Id` header (must be one the user is assigned to).
- A SQLAlchemy `with_loader_criteria` + repository base class injects `shop_id = :current_shop` into every query and insert. Tests assert leakage is impossible.
- On Postgres, Row Level Security is additionally enabled as a second wall.
- Local/offline install runs with a single organisation/shop seeded; identical code paths.

## Core domain design
- **Device** = physical phone (IMEI). Immutable identity; mutable projection fields (`status`, `current_party_id`, `cost_price`, `asking_price`) are **derived from the latest events** and recomputed by the service layer.
- **DeviceEvent** = append-only log (`FR-DEV-04`). Every event optionally links to a `ledger_entry_group`.
- **Ledger** = append-only `ledger_entries` (account, party, device, amount, direction, group id, reference). Accounts: `cash`, `bank:*`, `party:<id>`, `sales`, `purchases`, `expenses:<cat>`, `tax_payable`, `repair_income`. Simple double-entry per group (debits = credits) so cash book, party statements and P&L all come from one table.
- **Documents** (`invoices`, `purchases`, `repair_jobs`, `payments`, `expenses`, `loans`) are the user-facing records; each posts ledger entries and device events through a single `PostingService` inside one DB transaction.
- **Offline sync (P2)** becomes feasible because events and ledger entries are append-only with UUID ids and `shop_id`; sync = ship new rows, re-derive projections.

## Backend layout
```
backend/
  pyproject.toml
  alembic/                 migrations
  app/
    main.py                FastAPI app, routers, middleware
    core/                  config, security (jwt, hashing), tenancy context, errors, i18n messages
    db/                    engine/session, base model (uuid pk, shop_id mixin, timestamps), repositories
    modules/
      auth/  shops/  parties/  catalogue/  devices/  verification/  ledger/
      sales/  purchases/  loans/  payments/  expenses/  accessories/  repairs/
      tax/  reports/  notifications/  printing/  ai/  sync/
        each: models.py  schemas.py  service.py  router.py  (tests under backend/tests/<module>/)
    seeds/                 brands/models/colours/storages (from legacy seed), demo shop
  tests/
```

## Frontend layout
```
frontend/
  src/
    app/        router, providers, layout (mobile-first shell, bottom nav)
    i18n/       en.json ur.json (keys grouped by module)
    components/ bilingual primitives (Label, Button, Input, Select, Money, Alert, Stepper, Modal, Camera)
    features/   one folder per module mirroring backend (api hooks, pages, forms)
    print/      receipt/invoice/job-sheet templates (CSS @page)
    lib/        api client (generated from OpenAPI), auth store, number/date/urdu helpers
```

## Security and privacy
CNIC images are sensitive: stored encrypted at rest (cloud), access logged, never in WhatsApp messages, retention policy configurable. Passwords bcrypt, PINs hashed, rate limiting on auth, HTTPS only in cloud.

## Non-functional targets
API p95 < 300 ms for list screens on 100k devices/shop; first load < 3 s on 3G for the PWA shell; nightly backups; 99.5% uptime for cloud.
