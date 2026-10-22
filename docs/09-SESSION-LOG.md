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
