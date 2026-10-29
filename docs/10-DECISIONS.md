# 10 — Architecture Decision Records

Format: ID · date · status · context · decision · consequences. Append only; supersede rather than edit.

## ADR-001 · 2026-10-22 · Accepted · Rebuild as v2 instead of extending v1
Context: v1 (see docs/08) lacks tenancy, auth, migrations, tests and uses float money with mutable balances and a half-done model refactor. The product must be multi-tenant SaaS with an immutable device history.
Decision: New codebase under `backend/` and `frontend/`; v1 moved to `legacy/` as reference. Reuse seeds, Urdu strings, bilingual component designs, and domain rules.
Consequences: Short-term slower (foundation first); long-term every feature lands on tenancy/ledger/events correctly. Legacy is never deployed.

## ADR-002 · 2026-10-22 · Accepted · Append-only ledger + append-only device events
Context: Balances and device status must always be explainable (shop disputes, audits).
Decision: Money moves only through `ledger_entries` grouped in balanced `ledger_groups`; device status only through `device_events`. Projections (`party balance`, `device.status`) are derived. Corrections are reversing entries.
Consequences: Slightly more code per document type (PostingService), but statements, cash book, P&L and history come from one source; enables offline sync later.

## ADR-003 · 2026-10-22 · Accepted · PostgreSQL for cloud, SQLite for local, same ORM
Context: SaaS needs scale and isolation; a shop PC without internet needs zero-ops.
Decision: SQLAlchemy 2 + Alembic targeting both; UUID keys; no DB-specific SQL outside a small compatibility layer. Row Level Security added on Postgres as a second wall.
Consequences: Avoid Postgres-only features in core paths; CI runs both.

## ADR-004 · 2026-10-22 · Accepted · One frontend codebase: React PWA, then Capacitor for Android/iOS
Context: Owner wants web, Android and iOS with a small team.
Decision: React + TypeScript PWA first; wrap with Capacitor for store builds and native camera/print/share.
Consequences: No React Native; native-only UX is limited to plugins. Revisit only if store-grade performance demands it.

## ADR-005 · 2026-10-22 · Accepted · WhatsApp Cloud API (Meta) over Twilio
Context: Twilio was in v1; cost and local reliability matter in Pakistan.
Decision: Abstract `Messenger` interface; first provider = Meta WhatsApp Cloud API, SMS via a local gateway; until API approval, use "share via WhatsApp" deep links.
Consequences: Needs Meta Business verification before Phase 3 messaging goes live.

## ADR-006 · 2026-10-22 · Accepted · Git authorship
Decision: All commits authored by Abdur Rehman Afzal only; no AI co-author trailers. Enforced via repo-local git config and CLAUDE.md.

## ADR-007 · 2026-10-22 · Accepted · Design direction "Emerald & Gold", light default with dark/system option
Context: v1 UI judged "not modern, not luxury" by ~50 shopkeepers (FR-PLT-08). Mockup of 5 screens reviewed by the owner.
Decision: Adopt Direction A (warm off-white ground, charcoal-green hero surfaces, emerald primary, gold for money). Light is the default; dark and system themes are user-selectable. Tokens live as CSS variables consumed by Tailwind; all UI is built from the bilingual primitives. No emoji icons; Lucide stroke icons.
Consequences: Every new screen must use the tokens and primitives; both themes must be checked for contrast when adding colours.

## ADR-008 · 2026-10-22 · Accepted · Hosting on the owner's Hostinger VPS with Docker Compose
Context: Owner has a Hostinger VPS and Hostinger shared hosting.
Decision: Run PostgreSQL 16 + FastAPI + Caddy (static SPA, reverse proxy, automatic HTTPS) via `deploy/docker-compose.yml` on the VPS. Shared hosting is not used for the app (no long-running Python/Postgres); it may host a static marketing page later. Nightly `deploy/backup.sh` (pg_dump + uploads, 14-day retention). See docs/12-DEPLOYMENT.md.
Consequences: First real PostgreSQL run happens on the VPS; migrations were rendered to PostgreSQL SQL offline and all 35 tables generate cleanly, but runtime behaviour on Postgres must be smoke-tested after the first deploy.

## ADR-009 · 2026-10-26 · Accepted · Design v2 "Dukaan counter" replaces the Easypaisa-style home (supersedes the look of ADR-007)
Context: Owner and 10 testers: the UI is not easy and feels like an Easypaisa clone (a payment app). Named problems: too many steps, words not understood, hard to find things, crowded home. Used on phone and laptop equally. Owner's must-answer list: how much I owe / am owed and to/from whom, stock worth (by brand and model), add stock, sell (also on udhaar), any day's sale and udhaar.
Decision: Counter/POS direction from the approved mockup https://claude.ai/artifact/AyT6sqrTu2u1BTHqowjNqH . One colour-coded tile per job with one plain word; the home answers the owner's questions in place (day chips today / yesterday / date); dark-ink primary instead of the green band and hidden-amount card; sale in three steps with the customer asked only for udhaar; laptop gets the same tiles as a side menu with F-keys. New endpoints `/reports/stock-summary` and `/reports/day` feed it. Token names stay (emerald, receivable, payable, hero…) so older screens keep working while they are moved over.
Consequences: Remaining screens (purchase, repairs, parties detail, settings…) must be restyled on the v2 tiles/tokens and plain words; every new string is written in shopkeeper language, not accounting terms.

## ADR-010 · 2026-10-26 · Accepted · Roman Urdu as a third UI language
Context: Owner asked for Roman Urdu (Urdu in Latin letters, as shopkeepers type on WhatsApp) next to Urdu and English, with language and theme switches on the home header.
Decision: Locale `roman` (`frontend/src/i18n/locales/roman.json`, same keys as en/ur). It renders like English (LTR, Manrope); `useLang()` exposes `roman` and `pick` prefers `BiText.roman`, falling back to English. Header shows Language (sheet: اردو / Roman Urdu / English) and a one-tap Light/Dark switch. Server-side text (API error messages, printed receipts, PDF pages, shop default language) stays en/ur for now: in Roman mode errors show in English.
Consequences: every new string needs en, ur and roman; one-language-at-a-time rule still holds.

## ADR-011 · 2026-10-26 · Accepted · Default look "Modern" (Stripe × Google Material)
Context: Testers found the v2.0 pastel tiles childish; owner decided the UI should be Stripe- and Google-inspired.
Decision: New default look `modern`: Stripe navy text, #F6F9FC ground, white cards with hairline + soft shadow, single blurple accent (#635BFF), Inter, tighter radii, Material-style active-tab pill. Font and radius became tokens (`--font-sans`, `--r-btn`, `--r-card`) so looks can change them. Professional, Navy and Colorful remain selectable until the owner confirms; then the unused ones can be deleted. The look preference moved to storage key `mobileshop.look` so earlier test choices do not hide the new default.
Consequences: blurple is the primary-action colour in Modern (not a default browser blue); money meaning colours (amber to get, red to give) are unchanged.

## ADR-012 · 2026-10-26 · Accepted · Shops are opened only by the product owner (super admin)
Context: Owner: there must be no "create a shop" on the login page; only the product owner opens shops for customers.
Decision: `PUBLIC_SIGNUP` (default false) gates `POST /auth/signup` (`signup_closed` 403); it is on only in the local dev/test setup so automated tests can make throwaway shops. Super users are the mobile numbers in `SUPERUSER_PHONES`; `/me` exposes `is_superuser`. `GET/POST /api/v1/admin/shops` (super user only) lists every shop and opens a new one (organisation, shop, owner login, default cash account) without logging in as it. Frontend: More → Super admin (only for super users) with a shop list and "Open a new shop" that ends with the owner's login and a WhatsApp share. Login page has no create-shop button; it shows "Want this app for your shop? Contact us" and the maker's footer (OOP Solutions, oopsolutions.com, Abdur Rehman Afzal +92 316 4001668).
Consequences: production `.env` must set `SUPERUSER_PHONES` to the owner's login number(s) and keep `PUBLIC_SIGNUP=false` (compose passes both). The /signup page still exists for tests; in production it only shows the "closed" message.

## ADR-013 · 2026-10-27 · Accepted · Deploy like the other OOP Solutions apps: Traefik on the shared VPS, images from CI
Context: All of the owner's projects run on the Hostinger VPS in Docker behind the existing Traefik (`n8n-traefik-1`, network `n8n_default`) and deploy with GitHub Actions over SSH as a restricted `deploy` user (oop-solutions website). Our earlier compose used its own Caddy on 80/443, which would clash with Traefik.
Decision: The stack opens no ports; `web` (Caddy on :80, SPA + `/api` proxy) joins `n8n_default` with Traefik labels (`websecure`, certresolver `mytlschallenge`, http→https). db and backend sit on a private `internal` network; backend has the alias `mobileshop-backend` so it never collides with another app's "backend" on the shared network. CI (`ci.yml`) runs on develop/PRs: ruff + pytest, Alembic up/down/up on PostgreSQL 16, typecheck + vitest + build, and the real production images together with a smoke test. Releases (`deploy.yml`, push to main) build images to ghcr.io tagged with the commit, then `deploy@VPS` runs `sudo -n /opt/mobileshop/deploy.sh <sha>` (pull, up, health check, automatic rollback to the previous tag). `setup-vps.sh` prepares /opt/mobileshop, a root-only .env with generated secrets, the one-command sudoers rule and the nightly backup cron.
Consequences: the VPS never builds code (low RAM use, fast deploys); a deploy is one SSH command; rolling back across a migration still needs a DB restore. Live camera scanning works once the app is on its https domain.

## ADR-014 · 2026-10-28 · Accepted · PDFs are made on the device from the server's print page
Context: Owner: every report and invoice must be downloadable and shareable. "PDF" used to open the print dialog ("Save as PDF"), which gives no file to share and does not exist in the Android WebView. Server-side PDF libraries shape Urdu Nastaliq poorly or need heavy system packages (WeasyPrint); html2canvas was tried and mis-drew Urdu (brackets reversed, words run together, text shifted over borders).
Decision: `lib/share.ts printPagePdf` loads the same print HTML the server already makes into a hidden frame, inlines the Google font files as data URLs, and has the browser itself draw it (SVG foreignObject from a data: URL onto a canvas; a blob: URL would taint the canvas), then jsPDF (lazy-loaded) wraps it: one 80 mm page for thermal receipts, A4 pages cut at blank rows otherwise. Excel/CSV still come from the server. Saving: browser download, or the app's Documents/MobileShop (@capacitor/filesystem 6); sharing: `navigator.share({files})`, or Capacitor Share in the app; a browser that cannot share files downloads instead and says so. If the app cannot save, the older Chrome link path is used.
Consequences: PDFs are pictures of the page (text is not selectable), but Urdu looks exactly as printed and there is one layout to maintain. Very long reports are scaled down to stay under the ~16 megapixel canvas limit of phones. Needs a new APK for the filesystem plugin.

## ADR-015 · 2026-10-28 · Accepted · Held sales are carts kept on the server, not transactions
Context: Owner asked for the POS "hold sale".
Decision: `held_sales` (shop_id, label, total, items, cart JSON as the sale screen had it, created_by). Holding records nothing in the ledger, device_events or stock; the device is not reserved. Resuming loads the cart, deletes the held row and drops phones that are no longer in stock; completing it is an ordinary sale with all the usual checks.
Consequences: a held phone can still be sold to someone else (the held bill then loses it, with a message). Any phone of the shop can resume a held bill. The cart format belongs to the frontend; an old held cart after a format change may need to be re-entered.

## ADR-016 · 2026-10-29 · Accepted · Scheduled messages run inside the API process; WhatsApp through Meta's Cloud API
Context: Owner wants udhaar reminders and the night report to go out by themselves. The VPS runs only the compose stack; adding a cron/worker service means more to set up by hand on the server.
Decision: `modules/notifications/scheduler.py` starts an asyncio task in the FastAPI lifespan that ticks every minute: `jobs.tick()` queues each shop's night report and reminders at the shop's own time (`job_runs` has a unique (shop, job, day) row, so two API workers cannot both send), then `jobs.dispatch()` sends queued WhatsApp messages through Meta's Cloud API (`provider.py`), claiming each row (queued → sending) first. Without WHATSAPP_TOKEN / WHATSAPP_PHONE_ID nothing is sent automatically: rows keep the wa.me link and the Reminders screen opens WhatsApp for one tap per message. Business-initiated messages need Meta-approved templates, mapped per key in WHATSAPP_TEMPLATES (one `{{1}}` body parameter carrying the rendered text).
Consequences: no new service; the clock stops when the API is down (missed days are not sent later). Each API worker ticks, serialised by the DB. The SaaS sends from one business number for every shop; messages name the shop. SMTP email is still not sent.

## ADR-017 · 2026-10-29 · Accepted · Subscription gate: warn, grace, then read-only; branches share the organisation's plan
Context: The owner is about to sell the software per shop per month and needs to see who has paid and to stop non-payers without losing their data.
Decision: `organisations.plan_expires_at` (already there) plus `monthly_fee` / `fee_note`. `modules/admin/plans.py`: status unlimited | ok | due_soon (≤ 7 days) | expired (≤ 15 grace days) | locked. `get_current_context` calls `assert_writable` for every request with a shop: a locked organisation gets 403 `plan_expired` on anything but GET; super users are never gated; `/me` carries `plan` for the banner. No expiry = unlimited, so nothing changes for shops opened before. Branches are more shops in the same organisation; owners are linked to each through `user_shops`, the client picks one with `X-Shop-Id` (More → My shops).
Consequences: a non-payer can still read and export everything (their data stays theirs); nothing is deleted automatically. Payment itself is recorded by hand (the super admin extends after receiving the fee). One plan per organisation, not per branch.

## ADR-018 · 2026-10-29 · Accepted · Offline: cached reads + an outbox of documents, posted once with Idempotency-Key
Context: Owner: markets lose the internet often; a sale must still be recorded. A full offline database with two-way sync is far more than the shops need and would multiply conflicts.
Decision: Reads: react-query's cache is persisted to localStorage (`mobileshop.cache`, 24 h, cleared on logout; queries `networkMode: 'offlineFirst'`), so the screens show what was last loaded. Writes: only the four counter documents (sale, purchase, payment, expense) work offline: `useDocMutation` with an `offline` option sends every such POST with a fresh `Idempotency-Key`; on a network failure it puts the request in `lib/offline.ts` (zustand, persisted as `mobileshop.outbox`) and resolves `{queued: true}`; `OfflineBar` sends the queue in order on reconnect, every 30 s and at start, stopping at the first network failure; a 4xx keeps the item with the reason for the user (retry / delete). Server: `core/idempotency.py` claims (shop, key) before creating, stores the 201 body and replays it for the same key; a concurrent duplicate gets 409 `in_progress`; keys live 7 days. Restored queries are invalidated at once (they are shown, then refetched when online; otherwise a reload within staleTime showed old data). Mutation `onSuccess` awaits invalidation online and not offline (a paused refetch would hold the screen).
Consequences: documents made offline get their numbers when they reach the server; two phones can sell the same device offline and the second is refused on sync (shown in red). Everything else (verification, reports, downloads) needs the server. Cached data sits in the phone's localStorage like the login token already does.

