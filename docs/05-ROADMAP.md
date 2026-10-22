# 05 — Roadmap

Each phase ends with: tests green, docs updated, demo-able on a phone, commit on `develop`. Dates are targets, not promises; the order matters more than the dates.

## Phase 0 — Foundation (this week)
- Repo restructure (`legacy/`, `docs/`, `CLAUDE.md`, skills) ✅
- Backend skeleton: pyproject, settings, DB base (UUID, ShopScoped mixin), Alembic, pytest harness with SQLite-in-memory.
- Tenancy + auth: organisations, shops, users, roles, JWT, `/auth/signup`, `/auth/login`, `/auth/refresh`, `/me`, shop switch, permissions, audit log.
- Frontend skeleton: Vite + TS + Tailwind + i18n + auth pages + mobile shell with bottom nav; bilingual primitives ported from v1.
- Seeds: brands/models/colours/storages from legacy.
Exit: sign up as a shop, log in on a phone browser, see an empty dashboard in Urdu.

## Phase 1 — Used-mobile core (P0 heart of the product)
- Parties (customer/supplier/shop) CRUD + search by phone/CNIC.
- Devices + device events + state machine + history screen + IMEI search.
- Verification flow (CNIC photos, eGadget result, PTA, declaration print).
- Ledger + PostingService + party balances + cash accounts.
- Purchase (walk-in / supplier / shop) with per-device accessories.
- Sale with credit, invoice numbering, receipt print (58/80 mm + A4).
- Payments in/out with allocation; party statement.
- Loan out / settle; sale return; purchase return.
- Scenario tests S1–S6 (Nokia chain acceptance test).
Exit: the Nokia chain works end-to-end on a phone; a real shop can run daily business.

## Phase 2 — Operations
- Exchange/upgrade flow.
- Accessories stock, accessory sales, pending accessories tracker + reminders.
- Repairs module (jobs, status, parts, bill, job sheet print, outside technician).
- Expenses, cash book, day close.
- Dashboard + core reports + PDF/Excel export.
- Tax settings + tax on invoices + tax report.
Exit: full shop operations including repair lab and books.

## Phase 3 — SaaS and reach
- Plans/limits, multi-shop per organisation, owner consolidated view.
- Staff management polish, audit viewer, attendance/salary.
- WhatsApp Cloud API + SMS + email; message templates (EN/UR); scheduled reports.
- PWA hardening (install prompt, caching), Capacitor Android build (camera IMEI scan, share, print), iOS build.
- Docker deploy for cloud; local installer (single shop) with backup/restore.
Exit: first paying shops onboarded; Android app in Play Store internal track.

## Phase 4 — Differentiators
- AI assistant over shop data (Urdu/English), photo → IMEI/CNIC extraction, price suggestions, reminder drafting.
- FBR POS integration.
- Cloud sync for offline installs.
- Bulk stock import, ageing alerts, supplier price lists.

## Milestone checklist format
Each item in `06-PROGRESS.md` references FR ids and is ticked only when: code + tests + i18n (EN/UR) + docs are done.
