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

## ADR-019 · 2026-10-29 · Accepted · Per-shop modules: basics always on, the rest by plan or by hand, gated at the API
Context: Owner: when opening a shop we decide which modules it gets; some are basic, others come with the plan, and some are given individually.
Decision: `modules/admin/modules.py` holds the catalogue of ten switchable modules, each plan's defaults and the API-prefix → module map. `organisations.modules` (JSON) is NULL to follow the plan or a hand-picked list. `get_current_context` calls `assert_module(org, path)` for every shop request (403 `module_off`); super users are exempt. `/me.plan.modules` tells the app what is on; `lib/modules.ts` hides tiles, menu entries and buttons, and `ModuleGate` shows a plain page on a switched-off route. The super admin sets the plan and modules when opening a shop (`AdminShopCreate`) and later (`PATCH /admin/shops/{id}/modules`).
Consequences: basics (stock, sale, purchase, return, khata, payments, invoices, ID check, hisaab, settings, staff) can never be switched off. Dashboard, day hisaab and stock summary stay basic even though they live under /reports. Existing shops have NULL → their plan's defaults (trial = everything), so nothing changes for them until the super admin decides.

## ADR-020 · 2026-10-29 · Accepted · Software fees by manual transfer, reported in the app and approved by the product owner
Context: Owner asked how shops will pay. Pakistani shopkeepers pay by Easypaisa / JazzCash / SadaPay / bank transfer; a payment gateway (Safepay, PayFast) needs a merchant account and takes ~2-3 %, worth it only with many shops.
Decision: `admin/fees.py`: the product owner's accounts live in `platform_settings` (key `payment_accounts`, entered in the Super admin UI, never in code or docs); a shop owner reports a payment (`fee_payments`: amount, method, reference, screenshot via the files API with purpose `fee`, months); the super admin approves (plan extended through `plans.set_plan(extend_months)`, owner told by the `fee_received` WhatsApp template) or rejects with a note. `/api/v1/fees` (owner, MANAGE_SETTINGS) and `/api/v1/admin/fee-payments|fee-stats|payment-accounts`.
Consequences: no money moves through the software; approval is a human step with a record and a monthly total. A gateway can be added later as another "method" that approves itself.

## ADR-021 · 2026-10-29 · Accepted · The landing page lives inside the app at /welcome
Context: Owner wants a public page that sells the software: modules, screenshots, a sample video, prices and payment, deployed with everything else and without a separate site or DNS change.
Decision: `features/landing/LandingPage.tsx` at `/welcome`; `RequireAuth` sends a logged-out visitor on `/` there (deep links still go to /login). Copy in en/ur/roman under `landing.*`. Data from `GET /api/v1/public/info` (plans with prices from `PLAN_PRICES`, modules, the payment accounts entered in Super admin, the contact number). The form posts `POST /api/v1/public/shop-requests` (rate-limited per number) → `shop_requests` + a WhatsApp message to the product owner; Super admin lists them and opens the shop from one (`AdminShopCreate.request_id` closes it). Screenshots and the demo video are produced from a seeded demo shop by `frontend/scripts/landing-assets.mjs` (Playwright; `public/landing/`), webm only when Playwright's ffmpeg has no H.264.
Consequences: one deploy, same look as the app; prices are a constant until a settings screen is needed. The video does not play on iPhone Safari (webm) until the owner replaces it with an mp4 or a YouTube embed.

## ADR-022 · 2026-10-29 · Accepted · Installments (qist) are a plan on top of the normal invoice and payments
Context: Shops sell phones on monthly installments with an advance and a guarantor. The owner wants the schedule, who is late, taking an installment, and WhatsApp reminders, without a second ledger.
Decision: `installment_plans` (one per invoice: total, advance, months, monthly, due_day, first_due, guarantor name/phone/CNIC) is created inside `create_sale` when `SaleCreate.installments` is sent. Nothing is posted to the ledger for the plan itself: the invoice already carries the balance. The schedule (`service.schedule`) is derived on read from `invoice.paid − advance` applied to the installments in order, so a collection is just `payments.create_payment` allocated to that invoice (cash/online/cheque), and khata, day hisaab and statements stay the single truth. The last installment takes the remainder (`monthly × (months−1) < rest` is the only shape rule). Status active/closed/void follows the invoice. Reminders reuse the notifications outbox (`installment_due` / `installment_late`); the night tick's `installment_reminders` claim queues them for plans due tomorrow or late, at most once per 3 days per plan. Gated by module `installments` (pro, chain, trial).
Consequences: no per-installment rows to keep in sync and no new balance to drift; editing a plan after the sale is not offered (void the sale instead). A late fee or rescheduling would need an explicit plan edit later.

## ADR-023 · 2026-10-30 · Accepted · Staff activity is read from the audit log; hazri is one row per person per day
Context: The owner wants to see what each staff member did and who was at the shop, without a second bookkeeping.
Decision: `GET /api/v1/staff-activity` aggregates `audit_log` rows per user for a period (invoice/purchase/payment/expense/repair creates give counts and sums from the audit payload; every row counts as an action) and `/{user_id}/log` lists them with a derived `ref` (no / name) and `amount`. No new recording in the modules. Attendance is `attendance` (shop_id, user_id, day unique; status present/half/leave/absent; in_at/out_at; marked_by = None when the person checked in themselves). Check-in/out are self-service for any logged-in user; listing, summary and marking need MANAGE_STAFF. "Missing" days are counted from the day the user was created. Hazri is a switchable module (`attendance`: pro, chain, trial); the activity view is basic.
Consequences: activity numbers are only as complete as the audit payloads (they carry no/total/amount today); salary stays in expenses; late marks, shifts and leave quotas are not modelled yet.

## ADR-024 · 2026-10-30 · Accepted · Stickers are a server-rendered print page sized to the label
Context: Shops stick a price label with a barcode on every phone and item; printers vary (38–70 mm roll label printers, A4 sheets).
Decision: `GET /api/v1/labels/devices|items?ids&size|w,h&fields&copies&lang` returns HTML whose `@page` is the sticker's size (one sticker per page) or A4 with a flex grid; the browser print dialog / the existing PDF download does the rest, like receipts. Barcodes are Code 128 SVGs from `python-barcode` (pure Python, no fonts), scaled to the label width; the IMEI (or SKU) is also printed as digits. Field choices and size are saved on the shop (`label_prefs`, owner) and on the device (localStorage) for everyone. The buying price can be spelt with a 10-distinct-letter code word (`label_code_word`, default BLACKHORSE); the server only emits it for VIEW_COST roles, whatever the request asks.
Consequences: no label-printer driver or ZPL; any printer the phone/PC can print to works. Barcode scanning already reads Code 128 (IMEI) into search / sale. QR codes and a per-sticker layout designer are not included.

## ADR-025 · 2026-10-30 · Accepted · OTP codes ride on the WhatsApp sender; no sender, no code
Context: Owners and staff forget passwords; waiting for the super admin or the shop owner is slow. Public signup, when it opens, needs a real number.
Decision: `otp_codes` (phone, purpose reset|signup, HMAC-SHA256 hash of the 6-digit code with the app secret, channel, attempts, 10-minute expiry, used_at). `POST /auth/otp/send` (3 per number per 10 min; reveals only "unknown"/"registered") sends through `notifications.provider` when WhatsApp is configured, or echoes the code when `OTP_DEV_ECHO` (dev/e2e only); with neither it answers `delivery: none` and the app offers the old request flow. `POST /auth/otp/verify` burns the code after five tries and returns a 15-minute HMAC token bound to phone + purpose; `POST /auth/reset-password` consumes it once (a `used_token` row) and logs the user in; `/auth/signup` requires it when `SIGNUP_OTP` is on. No SMS gateway yet: the sender is one function to swap.
Consequences: self-service resets only once the VPS has WHATSAPP_* set; until then the UI falls back automatically. Codes never leave the server unhashed except through the configured sender or the dev echo.

## ADR-026 · 2026-10-30 · Accepted · Email goes through plain SMTP, dispatched from the same outbox
Context: Email messages (owner on sale/purchase, customer receipts, the night report) were queued but had no sender; WhatsApp needs a Business API that the owner has not set up yet, while any Gmail app password gives working email in minutes.
Decision: `provider.send_email` (smtplib, STARTTLS, optional login) behind `SMTP_HOST/PORT/USER/PASSWORD/FROM/STARTTLS`; `jobs.dispatch` claims queued rows of every configured channel and records `provider = smtp | whatsapp_api` with the error on failure. The night report can go by WhatsApp, email or both (`owner_daily_report_email`); the tick runs when either is set. No HTML mail, no attachments: the text template is the mail.
Consequences: one env block on the VPS switches email on for every shop; without it the Messages list still shows the queued mails and the settings screen says why. A PDF receipt attachment and per-shop SMTP accounts are not included.
