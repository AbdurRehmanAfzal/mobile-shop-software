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
