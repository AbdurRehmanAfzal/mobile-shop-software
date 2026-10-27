# 05 — Build Journey: from scratch to live deployment

How Mobile Shop (https://mobileshop.oopsolutions.com) was built, step by step, and how to build it again from zero.
Owner and product decision-maker: **Abdur Rehman Afzal** (OOP Solutions).

Everything here comes from the repository: the git history (117 commits on `develop`), the session log (`docs/09-SESSION-LOG.md`), the decision records (`docs/10-DECISIONS.md`, ADR-001 to ADR-013) and the other living docs. Where the record is silent, this guide says so. Dates and test counts are given exactly as they were logged.

- **Part A** — The journey, phase by phase
- **Part B** — Build it again from zero (playbook)
- **Part C** — Lessons learned and what's next
- **Appendix** — Test-count trail

---

## Timeline at a glance

| Date | Milestone | Commit |
|---|---|---|
| 2026-06-25 | v1 prototype first commit (FastAPI + SQLite, React + Vite, 82 files) | `c0e5810` |
| 2026-07-14 | v1 UI/UX improvements | `4e51155` |
| 2026-07-19 | v1 CNIC and IMEI validation | `fc9bf99` |
| 2026-10-22 | Last v1 change ("changes") | `92e953b` |
| 2026-10-22 | Repo restructured for v2: `legacy/`, docs 01–10, ADRs, CLAUDE.md, project skills | `bf257e7` |
| 2026-10-22 | v2 backend foundation: tenancy, auth, roles, shops, staff, audit log | `266d237` |
| 2026-10-22 | v2 frontend foundation: Vite/React/TS PWA shell, bilingual UI | `3e30959` |
| 2026-10-22 | Design system "Emerald & Gold" implemented | `6bd582c` |
| 2026-10-22 | Catalogue → parties → ledger → devices → verification → purchases → sales → payments/loans → returns | `57487f6` … `03dae38` |
| 2026-10-22 | One language at a time in the UI | `d55a246` |
| 2026-10-22 | Phase 1 screens (parties, stock, purchase wizard, verification, sale wizard…) | `27bebef`, `681b39b`, `c6c7144` |
| 2026-10-22 | Phase 2 backend: expenses/day close, repairs, accessories, exchange, reports | `16fec8d` … `5082737` |
| 2026-10-22 | Phase 2 screens, staff and cash accounts | `1e2ad2f`, `466e2c0` |
| 2026-10-22 | First deploy setup (Docker Compose + Caddy) | `2218ef5` |
| 2026-10-22 | Easypaisa-style home, PIN login, opening stock | `1d6f6c4` |
| 2026-10-22 | Owner's first phone test over Wi-Fi ("UI ok hai") | `e149ca5` |
| 2026-10-22 | Exports, PWA, Capacitor scaffold, Playwright E2E | `f28244e`, `ea567f1`, `4ad20e0`, `4ecdec4` |
| 2026-10-26 | Edit and delete everywhere | `d348102`, `6720e2e` |
| 2026-10-26 | Design v2 "Dukaan counter" + 3-step sale | `fa4ed6a`, `4108adc`, `7f962bb` |
| 2026-10-26 | Returns with the shop's cut; add stock in 3 steps | `435f5ff`, `b333fa1` |
| 2026-10-26 | Owner reports, names, ID-check skip; repairs in 3 steps | `37a025f`, `84a9f8a` |
| 2026-10-26 | PDF / Excel / CSV downloads; "left in hand" explanation | `057ca1c`, `5843a27`, `14ace2d` |
| 2026-10-26 | Roman Urdu, Urdu fixes, period hisaab | `5e09b5b`, `c5b684d`, `385ceb8` |
| 2026-10-26 | Looks, then "Modern" (Stripe × Google) as default | `46c4c8e`, `8cb7e41` |
| 2026-10-26 | Super admin; no public signup | `2a5f389` |
| 2026-10-27 | Settings cards; full phone catalogue + field checks | `83221b2`, `db73321` |
| 2026-10-27 | Accessories as No / Got it / Later | `905587f` |
| 2026-10-27 | IMEI barcode scanning; reload-safe forms | `38e067b`, `1a322c6`, `f6ab32c`, `baf1596` |
| 2026-10-27 | CI/CD to the VPS behind Traefik | `5df4a78` |
| 2026-10-27 | PostgreSQL migration bug found by CI and fixed | `2c2b538` |
| 2026-10-27 | **Live** (first deploy from merge `6cec924`) | — |
| 2026-10-27 | `create-owner` CLI; release `00e67d0`; first owner login | `2847efa`, `aa9fb82` |
| 2026-10-27 | Android APK built and signed in GitHub Actions; APK 1.2 on the owner's phone | `4aa2437`, `98ecb0a`, `0b8b5ab` |

Note: the git dates show the v2 work in three bursts: 2026-10-22 (sessions 1–24), 2026-10-26 (session 25) and 2026-10-27 (sessions 26–27 and going live).

---

# Part A — The journey

## A1. The v1 prototype and why it was replaced (2026-06-25 → 2026-10-22)

**What existed.** v1 (now in `legacy/`) was a FastAPI + SQLAlchemy + SQLite backend with 57 endpoints and a React 18 + Vite + Tailwind + i18next frontend with 10 pages; single shop, no login; about 12.7k lines over 4 commits. It proved the domain: PTA status and SIM time, IMEI 1/2/3, CNIC and photos on a trade-in purchase, per-device accessories, a phone history screen, and a bilingual UI pattern (`BilingualLabel`, `BilingualButton`…).

**Why it was not extended** (`docs/08-LEGACY-AUDIT.md`, audited 2026-10-22):
- no tenancy, users or auth — every endpoint public and single-shop;
- money stored as `Float`, balances kept in mutable columns;
- two parallel models for the same thing (`Customer`/`Supplier` and `Party`), duplicate module files;
- no Alembic, no tests at all;
- a 1,543-line route file, ~850 lines of it demo-data generators exposed as POST endpoints;
- 2,000-line screens and two API clients (one dead);
- device history rebuilt by joining tables, not from an event log; no loan, repair or return flows;
- fragile setup (pinned versions, Windows cp1252 crash without `PYTHONUTF8=1`).

The owner also reported that ~50 shopkeepers had judged the v1 UI **"not modern, not luxury"**. This became FR-PLT-08 (premium, modern design, approved before screens are built).

**Decision.** ADR-001: rebuild as v2, keep v1 in `legacy/` as reference only, reuse its seeds, Urdu strings, bilingual component ideas and domain rules.

## A2. v2 foundation (2026-10-22, sessions 1–4)

**Repo restructure** (`bf257e7`): `legacy/` for v1 code, `docs/archive/` for v1 docs, new living docs `docs/01–10`, `CLAUDE.md` with hard rules, and three project skills (`kickoff`, `handoff`, `pk-mobile-domain`). The skill first named `resume` was renamed `kickoff` because `/resume` is a built-in Claude Code command. The repo git author was set to Abdur Rehman Afzal (ADR-006) and branch `develop` created.

Docs written up front: business requirements (scenarios S1–S6, including the "Nokia chain": walk-in purchase with verification → loan to a neighbouring shop → comes back → sold again), functional requirements with FR ids, architecture, data model, roadmap, progress tracker, testing strategy.

**Key ADRs of the day**
- ADR-002: append-only ledger and append-only device events; balances and device status are derived.
- ADR-003: PostgreSQL in the cloud, SQLite locally, same SQLAlchemy code.
- ADR-004: one React PWA, later wrapped with Capacitor.
- ADR-005: WhatsApp Cloud API over Twilio; `wa.me` share links until approved.

**Backend foundation** (`266d237`): FastAPI app factory, bilingual error envelope, SQLAlchemy 2 base (UUID keys, timestamps, `ShopScoped`, `Numeric` money), organisations / shops / users / user_shops / audit_log, Alembic initial migration, JWT access + refresh, bcrypt, Pakistani phone normalisation, `X-Shop-Id` tenancy context, a role → capability matrix.
Verified: **17 backend tests** (auth, tenancy isolation, roles, audit, migration/model parity), ruff clean, live smoke (`/health`, signup, `/me`, duplicate phone → bilingual 409).

**Frontend foundation** (`3e30959`): Vite + React 18 + TypeScript + Tailwind, i18n (Urdu default, RTL), bilingual primitives, API client with auto-refresh, zustand auth store, login/signup, mobile shell with bottom nav. Verified: **7 vitest**, `tsc` clean, build ok.

**Design system v1 "Emerald & Gold"** (sessions 2–3): an interactive mockup of 5 phone screens was published for the owner. He approved Direction A with "both light and dark" (ADR-007): tokens as CSS variables, light/dark/system theme, Lucide icons instead of emoji, Manrope font (`6bd582c`). 9 vitest.

**Catalogue** (session 4, `57487f6`): global + per-shop brands, models, storages, colours with an idempotent seed ported from legacy and extended — 17 brands, 108 models, 7 storages, 16 colours. **24 tests.** This closed Phase 0.

## A3. The used-mobile core (2026-10-22, sessions 5–12)

Built in the order the roadmap set: parties → ledger → devices + events → verification → purchase → sale → payments → loans → returns, each with tests before any screen.

| Session | Module | What it does | Tests after |
|---|---|---|---|
| 5 | Parties + `core/pk.py` | One table for customer/supplier/shop/technician; phone unique per shop; validators for phone (+92/0/Urdu digits), CNIC, IMEI (Luhn); balance is read-only | 32 |
| 6 | Ledger | Cash accounts (default "Cash"), balanced `ledger_groups` of append-only `ledger_entries`; `Posting` builder, `post()` checks Σdebit = Σcredit, `reverse()` mirrors once; statements, cash book, opening balances; a hypothesis property test over random sale/payment sequences | 43 |
| 7 | Devices + events | State machine table, `apply_event()` as the only writer of status, `cycle_no` when a sold phone is bought back, IMEI passport/lookup, accessories bundle; cost hidden from salesmen | 52 |
| 8 | Verification + files | One record per device cycle: CNIC + photos, seller photo, eGadget result, PTA check, declaration print; `flagged` blocks sale, `pending` needs override; uploads scoped by shop | 57 |
| 9 | Purchases | `PUR-000001` numbering, discount allocated into device cost, ledger Dr inventory / Cr party, paid-now; void only while the phone has not moved | 63 |
| 10 | Sales | `INV-` numbering, sellability check with inline owner override, tax inclusive/exclusive, COGS at device cost, accessories given/pending, void, thermal/A4 receipt | 72 |
| 11 | Payments + loans | FIFO or explicit allocation, advance as negative balance; loans (amanat) to another shop, return, or settle as a sale | 79 |
| 12 | Returns | Sale return with refund / keep as credit / keep as income; purchase return to supplier | 84 |

Problems hit and how they were solved (logged as "gotchas"):
- IMEI test fixtures must be Luhn-valid.
- SQLite batch migrations need named foreign keys; `add_column NOT NULL` needs a `server_default`.
- A Pydantic field named `date` clashes with the `date` type — use `import datetime as dt`.
- `test_migrations` must dispose the engine in `finally` (Windows file lock).

Verified milestone: the Nokia chain (S1–S3) ran end-to-end through the API — walk-in purchase + verification → loan to Shop B → settle as sale (1,000, paid 500) → void when it comes back → sale to another customer for 1,500 → history shows all six events; cash ends at +500.

## A4. One language at a time, print and notifications (sessions 13–14)

Owner review of the first screens: **"Urdu mein poora Urdu, English mein sirf English, mix nahi."** The stacked English + Urdu labels were removed: `Bilingual.tsx` renders only the active language (`d55a246`). This rule went into CLAUDE.md and FR-PLT-01.

Owner then asked that receipts and declarations follow the shop's language, and that the owner and customer get optional WhatsApp/email messages on stock-in and sale. Built (`5d548c4`): single-language receipt and declaration (`shops.default_locale`, `?lang=` override; Urdu is RTL Nastaliq with Latin digits), a notification outbox with EN/UR templates and `wa.me` links, hooks inside sale/purchase/payment. Real senders (Meta API, SMTP) were left for later. **89 tests.**

## A5. Phase 1 screens (session 15)

Three commits (`27bebef`, `681b39b`, `c6c7144`): a shared UI kit and typed query hooks; parties with statement and receive/pay; stock with IMEI lookup, device detail and history timeline; a 4-step purchase wizard; the verification page (photo tiles with camera capture, eGadget, PTA 8484 SMS link, declaration print, owner override); a sale wizard with thermal/A4 receipt; sales/purchases detail with return and void; loans; settings; notifications with `wa.me` share; live dashboard. Verified: `tsc` clean, 10 vitest, build ok. Not yet verified at that time: real phone layout, Android camera, thermal printer.

## A6. Phase 2: operations (sessions 16–18)

- **Expenses + day close** (`16fec8d`): 11 seeded bilingual categories, `EXP-` numbering, day close with expected vs counted cash.
- **Repairs** (`b85027d`): customer or stock phone, fault codes EN/UR, status log, parts + labour, advance and delivery through the ledger, outside technician cost added to the device cost, job sheet print, repair-ready WhatsApp.
- **Accessories** (`e78bc30`): stock with weighted average cost, movements, purchase/sale/return/void/repair integration, low stock, pending accessory tracker.
  → **103 tests.**
- **Exchange** (`5082737`): trade-in purchase + sale + optional refund in **one** transaction (a test proves no orphan rows on failure). **Reports**: dashboard, profit & loss, cash flow, tax, stock ageing. → **107 tests.**
- Screens for all of the above (`1e2ad2f`), plus staff management and cash/bank accounts (`466e2c0`).

## A7. First deployment setup and the Easypaisa-style home (sessions 19–24)

**Session 19** (`2218ef5`, ADR-008): Docker Compose for the owner's Hostinger VPS — PostgreSQL 16 + FastAPI + Caddy with automatic HTTPS, nightly `backup.sh`, a guard that refuses a default `SECRET_KEY` in production. 108 tests. Docker was not installed on the dev PC, so the stack was only checked by rendering all 35 tables as PostgreSQL SQL offline.

**Session 20** (`1d6f6c4`): the owner shared **Easypaisa screenshots as a UI guide**. The home was rebuilt in that style (green header band, hidden-amount card with an eye toggle, services grid), plus PIN login with lockout (5 fails / 10 min) and an opening-stock page for phones already in the shop. A bug found here: the dev backend had stopped reloading, so new endpoints returned 404 — restarting it fixed it (this came back several times). 110 tests.

**Session 21**: `npm run dev:lan`; the owner opened the app on an Android phone over Wi-Fi: **"UI ok hai."** Lesson logged: do not leave test credentials (a test PIN) on the owner's demo account.

**Sessions 22–23**: stock as offer-style cards; CSV exports with a UTF-8 BOM so Excel shows Urdu (113 tests); installable PWA (service worker caches only the app shell, never `/api`); Capacitor 6 Android scaffold (`pk.mobileshop.app`); first Playwright E2E at Pixel 7 size (core flow passed in 22 s).

**Session 24 — owner testing fixes** (all 2026-10-22 in the log):
- "Add device not working": (1) an i18n key `stock.condition` had overwritten a whole namespace of labels; (2) on phones over `http://<PC-IP>`, `crypto.randomUUID` does not exist (not a secure context), so the button threw. Fixed with a `uid()` helper; the E2E now removes `randomUUID` to act like the phone. Rule: no secure-context-only browser APIs without a fallback until HTTPS.
- "Purchase is too complex": the start screen became two big choices — **From a dealer** / **Buy a customer's phone** — with "Skip, I know this person" after a customer purchase.
- "One name, one phone": no separate Urdu-name or WhatsApp fields.
- Brands/models/storage/colours: add from the device form, rename/delete shop-own rows.
- Purchase date-time, because a busy shopkeeper enters it later.
- E2E grew from 3 to 5 tests.

## A8. Edit/delete, then the second UI rejection → "Dukaan counter" (2026-10-26, session 25)

**Edit and delete everywhere** (`d348102`, `6720e2e`): the rule is "delete or archive" — a record with history is hidden and kept, money owed or stock left is refused. Backend **127**, Playwright 8.

**The UI was rejected again.** Owner + 10 testers: *not easy, feels like an Easypaisa clone (a payment app)*; too many steps, words not understood, hard to find things, crowded home. The owner chose a "Dukaan counter (POS)" direction and gave a must-answer list: how much I owe / am owed and to whom; stock worth by brand and model; add stock; sell (also on udhaar); any day's sale and udhaar. No code was written until he approved the mockup — then: **"ok start karo."**

Built (`f6a2f5a`, `fa4ed6a`, `4108adc`; ADR-009, docs/11 v2): one colour-coded tile per job with one plain word; a home that answers the owner's questions in place; `/reports/stock-summary` and `/reports/day`; a sale in three steps (which phone → how much and how paid → done); a laptop side menu with F-keys. Backend 129, vitest 14, Playwright 11.

Continued the same day (owner: **"baqi kaam start, return module bhi"**, then **"next kaam start"**):
- **Returns with a cut** (`435f5ff`): the owner's case — a phone sold for 100,000 comes back, the shop keeps 10,000 and gives 90,000. Refund and kept amount can now go together; walk-in cash sales can be returned when someone is named. Backend 130, Playwright 12.
- **Add stock in three steps** (`b333fa1`); v2 colours and plain words on the remaining screens ("ID card check", "Dealer", "New person"). Playwright 13.
- **Owner reports** (`c3d5cd7`, `37a025f`): profit after expenses, best sellers, a 7-day estimate (same weekday over the last 4 weeks) with which phone runs out, who sold / who added stock; any salesman may skip a *pending* ID check (a *flagged* phone still needs owner/manager). Backend 133, Playwright 14.
- **Repairs in three steps** (`84a9f8a`): take in → fix → give back. Playwright 15.
- **Icons on every action** (owner: **"icon use karo, simple text samajh nahi aa raha"**, then **"jahan sirf icon hai wahan naam bhi likhein"**): every action is a button with an icon *and* a word (`6124c68`, `1d5eb30`). Rules 6–7 in docs/11.
- Sale blocked by a pending check → the seller can now skip it at the sale too (`e3495dd`). Backend 134, Playwright 16.
- Home made simpler with "See details ›" on every card (owner: **"modern aur simple, har card par see details"**, `e95c3ca`).

## A9. Downloads and the "cash in hand" question (2026-10-26)

- Owner: **"pdf, excel, csv sab mein report download ka option."** Every report downloads as CSV (with BOM), Excel (`.xlsx` via openpyxl) or PDF. Decision: no server-side PDF library — Nastaliq shaping is unreliable there; "PDF" is a print-ready page that the browser saves as PDF, the same way receipts print (`057ca1c`). Playwright 17.
- Bug: the return amount box refilled itself when cleared (`ac262e7`).
- Bug: a returned phone was still counted as sold in the day's hisaab and home (`e0a21d4`). Backend 135.
- Owner's question: an 800,000 sale returned with 750,000 given back — what is "cash received"? Answer: 800,000 came in, 750,000 went out, 50,000 left in hand. Added money in / out / net to the day report and "Left in hand today" (`5843a27`). When the owner then saw −700,000, his dev data was checked read-only: a 750,000 stock purchase had also been paid that day, so the number was right. The page now explains where money came from and went, by reason (`14ace2d`), and a test reproduces his exact day.

## A10. Roman Urdu, Urdu polish, and the look settles on "Modern" (2026-10-26)

- **Roman Urdu as a third language** (ADR-010, `5e09b5b`): locale `roman` with the same keys (801 keys, written with a helper agent and reviewed); language and Light/Dark buttons on the home header. Known gap: server text (errors, prints) stays English/Urdu in Roman mode.
- Owner: **"Urdu ko theek karo, Urdu ke format ko bhi."** A new `e2e/urdu.spec.ts` walks the screens in Urdu and fails if English words leak in; Urdu letters render in Nastaliq and Latin letters/digits in Manrope everywhere (`c5b684d`). Earlier, `.num` was forced to Manrope because Nastaliq drew 0 as a dot.
- Hisaab for a week, this month, or any from–to period (`385ceb8`).
- Testers: the pastel tiles looked **"like school kids' software, not professional"** → three looks on the same tokens: Professional, Navy, Colorful (`46c4c8e`).
- The owner then decided on a **Stripe- and Google-inspired** UI: look **"Modern"** became the default (ADR-011, `8cb7e41`): Inter font, Stripe navy, one blurple accent, hairline cards with a soft shadow, Material pill on the active tab. The other looks stay selectable until the owner confirms.

The full UI story in one line: v1 prototype ("not modern, not luxury", ~50 shopkeepers) → Emerald & Gold (ADR-007) → Easypaisa-style home (from the owner's screenshots) → rejected by the owner + 10 testers → Dukaan counter (ADR-009) → three looks → **Modern** (ADR-011).

## A11. Super admin, no public signup (2026-10-26)

Owner: there must be no "create a shop" on the login page; only the product owner opens shops. ADR-012 (`2a5f389`): `PUBLIC_SIGNUP` (default false) gates signup; super users are the numbers in `SUPERUSER_PHONES`; `/api/v1/admin/shops` lists and opens shops; More → Super admin ends with the new owner's login and a WhatsApp share. The login page shows the maker footer: OOP Solutions, oopsolutions.com, Abdur Rehman Afzal +92 316 4001668. Backend 139, Playwright 22.

## A12. Remaining screens, full catalogue, field checks (2026-10-27, sessions 26–27)

- Session 26 (owner: **"ok start next kaam"**): settings as three cards; a bug where saved tax/receipt settings showed empty on reopen; Urdu labels clipped by tight line-height (now 1.7); exchange and loans explained in one line.
- Session 27 (owner: **"saare latest models, storage, colour pehle se add karo; purchase price sell price se kam na ho; phone number mein country code; CNIC 13 digit; IMEI length; from date to date se aage na ho"**) (`db73321`):
  - catalogue 108 → **465 models**, colours 16 → 37, 16GB storage added (the newest model names are marked "less certain" in the log);
  - selling price may not be below buying price (owner/manager can override at sale with "I know — sell at a loss");
  - `PhoneInput` (+92 fixed), `CnicInput` (13 digits, auto dashes), `ImeiInput` (15 digits);
  - date ranges: from ≤ to ≤ today, backend `bad_date_range`.
  - vitest 20, Playwright 22.
- **Accessories redesign** (`905587f`): "came with device / pending from vendor" confused shopkeepers. Each item now has three big choices — **No · Got it / Given · Later** (with a date) — and warranty chips are shown directly on the sale. Playwright 23.
- Stock filter as buttons, because Android's own dropdown mixed colours (`3d600b2`).

## A13. IMEI barcode scanning and the Android camera reload problem (2026-10-27)

Owner asked for IMEI barcode scanning in IMEI boxes and a phone photo on the ID check (`38e067b`): zxing (loaded only when scanning), live camera where allowed, otherwise read the barcode from a photo. Only 15-digit codes that pass the Luhn check count, so EAN/serial barcodes are ignored; a label with two IMEIs offers both.

**Problem 1 — the form reset.** On the owner's phone, a photo of the `*#06#` screen did nothing and the add-stock wizard jumped back to the start. Cause: on the plain-http Wi-Fi link the browser cannot open the camera inside the page, so Android opens the camera app and Chrome reloads the page, losing the state. Fixes (`1a322c6`):
1. `npm run dev:phone` — https on port 5174 with a self-signed certificate, so the camera opens inside the page;
2. `useDraft` keeps form state in sessionStorage (30 min) and clears it after saving;
3. stricter scanning (exactly 15 digits + Luhn, so the 32-digit EID never matches).

**Problem 2 — tightly packed box labels.** An iPhone box photo (EID, serial and IMEI stacked tightly) returned no IMEI: each scanned strip held several barcodes and zxing returned the EID. Fix (`f6ab32c`): thin strips (1/16 of the height), half-strip steps, Code 128/39 only, stop at two IMEIs; the live camera uses the same reading. The owner's photo then read in ~0.09 s (checked locally; the photo was not committed because it holds a real IMEI). Playwright 25, including a fake-camera live-scan test.

**Problem 3 — a draft restored at the wrong time.** Add stock opened straight at step 2 because an old draft was restored on a normal visit. Now a draft is restored only after a real browser reload (`baf1596`).

## A14. Going live: VPS, Traefik, CI/CD (2026-10-27)

**Rework for the shared server** (`5df4a78`, ADR-013). All of the owner's projects run on one Hostinger VPS in Docker behind an existing Traefik, deployed by GitHub Actions over SSH as a restricted `deploy` user (the same pattern as the OOP Solutions website). The earlier compose ran its own Caddy on 80/443, which would clash with Traefik. New design:
- the stack opens no ports;
- `web` (Caddy on :80: built SPA + `/api` proxy) joins Traefik's network with labels;
- db and backend sit on a private `internal` network; the backend gets the alias `mobileshop-backend` so it never collides with another app's "backend";
- `ci.yml` runs on develop/PRs: ruff + pytest, Alembic up/down/up on PostgreSQL 16, typecheck + vitest + build, then the real production images together with `deploy/ci/smoke.sh`;
- `deploy.yml` runs on a push to main: CI → images to ghcr.io tagged with the commit → `ssh deploy@VPS "sudo -n /opt/mobileshop/deploy.sh <sha>"` (pull, up, health check, automatic rollback);
- `setup-vps.sh` (one time) prepares `/opt/mobileshop`, a root-only `.env` with generated secrets, a one-command sudoers rule and the nightly backup cron.

**The PostgreSQL migration bug found by CI** (`2c2b538`): the first CI runs failed because migration `ab0e2601f475`'s downgrade dropped a foreign key by the wrong name — SQLite never noticed. The downgrade was fixed and verified locally on PostgreSQL 16 via `pgserver`. The smoke script also hid a failed step (`&& echo`) and used wrong field names; now every step must pass. `TEST_DATABASE_URL` lets the test suite run on PostgreSQL. CI on `69f4597`: backend, frontend and the full Docker stack + smoke all green.

**DNS and the first certificate.** The owner pointed `mobileshop.oopsolutions.com` to the VPS, ran `setup-vps.sh` and added the GitHub secrets. An earlier merge to main had stopped at the checks with nothing deployed. The deploy run on `6cec924` was green for checks, images and the VPS deploy; only the final URL check failed with curl exit 60, because Traefik had not issued the certificate yet. The check now retries for 2 minutes. `/health` → prod, http → https 301. **Live on 2026-10-27.**

**First login.** Signup is closed in production, so there was no way in. New command `python -m app.cli create-owner` (asks shop, name, number and password via getpass; `test_cli.py`) (`2847efa`). Release `00e67d0` was deployed (all green); the owner created the super admin on the server with it and logged in.

## A15. Android APK built in CI (2026-10-27)

The dev PC has no Java or Android SDK, so `android.yml` builds the APK on GitHub (`4aa2437`):
1. `npm run build:native` — `vite --mode native` without the service worker, `VITE_API_URL` = `vars.APP_URL`, `cap sync`;
2. `gradlew assembleRelease`, signed from secrets (a debug-signed test APK if they are missing);
3. the APK is uploaded as a run artifact (90 days). Version code = run number.

The app icon and splash come from `frontend/assets` via `@capacitor/assets`. A first version that published public GitHub Releases was refused by the permission check, so the APK is an artifact only.

**Bug:** gradle read the version and the key password wrongly because of Groovy call precedence in `build.gradle` (`98ecb0a`). After the fix, **APK 1.2** was release-signed, the owner installed it on his phone, and it opens and works against the live API (`0b8b5ab`).

Known gap: print and download do nothing inside the Android WebView yet (docs/13).

---

# Part B — Build it again from zero

This is the order that worked. Detailed commands live in [`04-DEVELOPER-MANUAL.md`](04-DEVELOPER-MANUAL.md), [`../../12-DEPLOYMENT.md`](../../12-DEPLOYMENT.md) and [`../../13-MOBILE-APP.md`](../../13-MOBILE-APP.md). Only the key commands are shown here.

## B1. Tools to install
- Git; Python **3.12**; Node **22** (the version CI uses) with npm.
- Playwright Chromium for E2E (`npx playwright install chromium`).
- Optional locally: Docker (the original dev PC had none — the stack was first run in CI), Java 17 + Android SDK (not needed — CI builds the APK).
- Windows: always `set PYTHONUTF8=1` before Python, or Urdu output crashes on cp1252.

## B2. Repo, branch and project rules
1. Create the repo; `main` = releases, `develop` = daily work.
2. Set the repo-local git author (`git config user.name` / `user.email`); the project rule is a single human author with no AI attribution (ADR-006).
3. Add `.gitattributes` for LF line endings, keeping Windows `.bat` files as CRLF (`0062e08`, `b58eddf`).
4. Write the docs before code: `CLAUDE.md` (hard rules), `docs/01–07` (requirements with FR ids, architecture, data model, roadmap, progress, testing), `09-SESSION-LOG.md`, `10-DECISIONS.md`. Add the `kickoff` / `handoff` / `pk-mobile-domain` skills so every session starts from progress + log and ends by updating them.
5. If there is an old prototype, move it to `legacy/` and audit it (docs/08) instead of extending it.

## B3. Backend skeleton
```
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -e .[dev]
set PYTHONUTF8=1
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```
Put in place: an app factory, settings, a bilingual error envelope, and a SQLAlchemy 2 base with UUID keys, timestamps, a `ShopScoped` mixin and `Numeric(14,2)` money (never float). Add Alembic and pytest on in-memory SQLite.

## B4. Tenancy and auth (first, before any feature)
Organisations → shops → users/user_shops; JWT access + refresh; bcrypt; `X-Shop-Id` context checked against the user's shops; a role → capability matrix; audit log. Write the leakage test straight away: two shops, act in one, assert the other sees nothing. Later add PIN login with a lockout, `PUBLIC_SIGNUP=false` and super users (`SUPERUSER_PHONES`, ADR-012).

## B5. Modules, in this order
1. Catalogue + idempotent seeds (run at startup).
2. Parties + shared Pakistani validators (phone, CNIC, IMEI Luhn).
3. **Ledger** — the `Posting` builder, balanced groups, `reverse()`, statements, cash book; plus a property test that Σdebit = Σcredit.
4. **Devices + device_events** — a transition table; `apply_event()` is the only writer of status.
5. Verification + file uploads (sale block when flagged).
6. Purchases → 7. Sales (tax, COGS, receipt) → 8. Payments (FIFO allocation) → 9. Loans → 10. Returns.
11. Notifications outbox (`wa.me` links first).
12. Expenses + day close → Repairs → Accessories (weighted average cost) → Exchange (one transaction) → Reports → Exports (CSV with BOM, xlsx, print-PDF).
13. Admin (super admin opens shops) and a `create-owner` CLI for the first login on a server.

Each module ships with its Alembic migration and tests. Use named foreign keys (SQLite batch mode) and run migrations up/down/up on **PostgreSQL** too — this is the bug CI caught.

## B6. Frontend skeleton, design system, i18n, screens
```
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api to :8000)
npm run dev:lan    # phone on the same Wi-Fi, http
npm run dev:phone  # https on 5174 (self-signed) so the camera opens inside the page
```
1. Vite + React 18 + TypeScript + Tailwind, TanStack Query, zustand, i18next.
2. **Get the design approved first** with a mockup. Put tokens in CSS variables (light/dark), font and radius as tokens too, so a "look" can change them. Follow `docs/11-DESIGN-SYSTEM.md`: one job = one colour = one word, max three steps, shop words, a button with icon + word for every action, "See details ›" on tappable cards.
3. i18n: `en.json`, `ur.json`, `roman.json` with the same keys. Only one language is shown at a time; Urdu is RTL Nastaliq with Latin digits in Manrope. Never reuse a key that is already a namespace.
4. Screens in the backend's order, built only from the shared primitives (`BiLabel`, `BiButton`, `BiInput`, `Sheet`, `RemoveSheet`, `FieldInputs`, `ScanButton`, `DownloadButton`…).
5. Phone safety: no secure-context-only APIs without a fallback (`uid()`); reload-safe drafts (`useDraft`) for long forms.
6. PWA via `vite-plugin-pwa` (app shell only, never cache `/api`).

## B7. Testing setup
- Backend: `.venv\Scripts\pytest -q`, `ruff check app tests`; `TEST_DATABASE_URL` runs the suite on PostgreSQL.
- Frontend: `npm run typecheck`, `npm test` (vitest), `npm run build`.
- E2E: `npm run e2e` (Playwright, phone viewport; the backend must be running). Include an Urdu walk that fails on leaked English, and a fake-camera scan test.
- Restart the dev backend after adding routes — the reloader on the original PC often missed them. If a route still returns 404, check whether a second process is listening on :8000.

## B8. Docker images
`backend/Dockerfile` (python 3.12 slim, non-root, runs migrations on start, healthcheck) and `deploy/web.Dockerfile` (Vite build → Caddy serving the SPA and proxying `/api`). `deploy/docker-compose.yml`: `db` (postgres:16-alpine), `backend`, `web`; no published ports; `web` on Traefik's network with labels. In production the backend refuses a default `SECRET_KEY` and hides `/docs`.

## B9. VPS, Traefik and DNS
Requires a VPS where Traefik already owns 80/443 and a `deploy` user exists. As root:
```
git clone --depth 1 https://github.com/AbdurRehmanAfzal/mobile-shop-software.git /tmp/ms
bash /tmp/ms/deploy/setup-vps.sh     # /opt/mobileshop, .env with fresh secrets, sudoers rule, backup cron
nano /opt/mobileshop/.env            # APP_DOMAIN, SUPERUSER_PHONES
```
DNS: an A record for the app's subdomain → the VPS IP.

## B10. GitHub secrets and CI/CD
- Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Variable: `APP_URL`.
- `ci.yml` runs on every push to develop. Releasing = merge `develop` into `main` and push; `deploy.yml` builds images to ghcr.io, then runs `deploy.sh <sha>` on the VPS (health check + rollback).
- The first run may fail only the final URL check while the certificate is being issued; the check retries for 2 minutes.

## B11. First login
```
cd /opt/mobileshop && docker compose exec backend python -m app.cli create-owner
```
Use a number listed in `SUPERUSER_PHONES`, then open the domain, log in, and open customer shops from More → Super admin.

## B12. Android APK
1. Make a release key once and keep it forever (docs/13 shows the `keytool` command run inside a JDK container on the VPS).
2. Add the secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.
3. Run **Actions → Android** (or push to main); download the artifact and install it on the phone.
4. Keep an off-server copy of the keystore and its password — losing it means no updates.

## B13. Backups
`setup-vps.sh` installs a nightly cron (02:30): `pg_dump` + uploads to `/opt/mobileshop-backups`, kept 14 days. Restore with `pg_restore` (docs/12). Copy backups off the server regularly — still pending in the log (rclone suggested).

---

# Part C — Lessons learned and what's next

## Lessons (from the session log)
1. **Foundations before features.** Tenancy, decimal money, an append-only ledger and device events made later features (returns with a cut, the "left in hand" explanation, history) explainable rather than patched.
2. **Ask real shopkeepers early and often.** The UI was rejected twice (~50 shopkeepers on v1; owner + 10 testers on the Easypaisa-style home) and refined twice more (looks → Modern). Approval of a mockup before code saved rework.
3. **Shop words and visible buttons.** "Simple text samajh nahi aa raha" led to: every action a button with an icon and a word; every card says "See details".
4. **Test on the real phone, over the real network.** Localhost hid two bugs: `crypto.randomUUID` on http, and Android reloading the page when the camera app opens.
5. **Run migrations on the production database in CI.** SQLite never noticed the wrong FK name in a downgrade; PostgreSQL in CI did.
6. **Smoke tests must fail loudly** — an `&& echo` had hidden a failed step.
7. **Never reuse an i18n key that is already a namespace**; run E2E after UI changes.
8. **Don't leave test credentials on the owner's demo account.**
9. **Restart dev servers after adding routes or Tailwind changes**; look for orphan processes on :8000.
10. **Explain numbers, don't just show them.** The −700,000 "in hand" was correct; the fix was showing in/out by reason.

## Open questions recorded
- The price rule as read: selling (asking) price ≥ buying price — the owner is to confirm.
- The newest model names in the catalogue are uncertain.
- Whether expense voids should net out of the day's in/out tiles.
- Remove the unused looks once Modern is confirmed.

## What's next (from progress and the last log entry)
- The owner tests the live app on the phone (live IMEI scan over https, ID photos, Urdu).
- Copy backups off the server (rclone).
- Printing and downloads inside the Android app (WebView gap).
- Known E2E flake: `admin.spec.ts` under load.
- Laptop side-by-side sale screen if the owner wants it.
- Phase 3: plans and multi-shop, audit viewer, Meta WhatsApp / SMTP senders, phone OTP on signup, moving the login limiter out of process memory, an offline installer (owner to decide), iOS (needs a Mac).
- Phase 4: AI assistant / OCR, FBR POS, cloud sync.

The log does not record plan prices, a Meta Business account, or a Play Store listing; these remain open.

---

## Appendix — Test-count trail (as logged)

| When | Backend pytest | Vitest | Playwright |
|---|---|---|---|
| S1 foundation | 17 | 7 | – |
| S3 design system | – | 9 | – |
| S4 catalogue | 24 | – | – |
| S5–S12 core | 32 → 43 → 52 → 57 → 63 → 72 → 79 → 84 | – | – |
| S14 notifications | 89 | – | – |
| S15 screens | – | 10 | – |
| S16–S17 phase 2 | 103 → 107 | – | – |
| S19–S22 | 108 → 110 → 113 | – | 1 (S23) |
| S24 fixes | not stated | 11 → 12 | 3 → 4 → 5 |
| S25 (2026-10-26) | 127 → 129 → 130 → 133 → 134 → 135 → 139 | 12 → 14 → 16 | 8 → 11 → … → 22 |
| S27 (2026-10-27) | "all passed" | 20 → 22 | 22 → 23 → 24 → 25 |
