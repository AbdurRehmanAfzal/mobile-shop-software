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

## ADR-027 · 2026-10-30 · Accepted · The rate suggestion is statistics over the shop's own sales, not a model
Context: FR-AI-03 asks for a resale price suggestion. Shopkeepers mostly want to remember what *they* sold a model for; an LLM would cost money and still not know their shop.
Decision: `price_hint` reads the shop's non-void, non-returned device sale lines of the last 180 days for the model, narrowing to storage + condition when at least two samples exist, else condition, else the model. It returns last price/date/days-to-sell, low/high/median, the median rounded to Rs. 100 as `suggested`, average days to sell, the cost median only for VIEW_COST, and the same model's current stock with its asking range. Shown by one component in sale, add-stock and change-price with a one-tap "Use". Strictly per shop: no cross-tenant aggregation, even anonymised.
Consequences: free and offline-friendly; a new shop sees nothing until it has sold the model. A market rate across shops would be a separate, opt-in product decision.

## ADR-028 · 2026-10-30 · Accepted · The assistant is Claude with read-only, shop-scoped tools; photos are read with structured outputs
Context: Shopkeepers want to ask questions in their own words and to have CNIC and box labels read for them. The owner accepted the API cost once the free parts were done.
Decision: `modules/ai` uses the official `anthropic` SDK. Chat: `client.beta.messages.tool_runner` on `AI_MODEL` (default `claude-opus-5-5`, effort low, max 6 iterations) with `@beta_tool` functions closed over the current shop and `can_cost` — `hisaab`, `khata`, `phone_by_imei`, `stock`, `best_sellers`, `today_overview`, `rate` — which only call existing report/device/party services; the system prompt fixes the language (ur/en/roman), the shop's words and a short format. Photos: `client.messages.parse` on `AI_VISION_MODEL` (default `claude-haiku-5-5`) with Pydantic schemas `CnicRead` / `ImeiRead`; the app tries it first and falls back to tesseract.js / the barcode reader. One platform key; `ai_usage` counts calls and tokens per shop per day and `AI_DAILY_LIMIT` (200) refuses beyond it; the `ai` module switches the feature per shop. No fallbacks beta, no streaming: answers are short; a `refusal` stop reason becomes a one-line "cannot help". Photos are not stored.
Consequences: cost is bounded per shop and visible in the status; the model never writes and never sees another shop. Prompt caching of the system/tool prefix is left to the SDK's defaults for now. FR-AI-04 (drafting reminder messages) can reuse the same client.

## ADR-029 · 2026-10-30 · Accepted · The one-PC install is the same backend serving the web app, wrapped by a tray launcher
Context: Some target shops have poor internet. FR-PLT-04 asks for the same software on a shop PC without a server.
Decision: No second code path. `WEB_DIR` makes the FastAPI app serve the built React app (static `/assets`, SPA fallback) so one process on `127.0.0.1:8787` is the whole product; `app/local.py` prepares `%LOCALAPPDATA%\MobileShop` (SQLite, uploads, backups, `settings.env` with a generated secret and `PUBLIC_SIGNUP=true`), runs the bundled Alembic migrations, starts uvicorn in a thread, opens the browser and sits in the tray (pystray) with Backup / Open data folder / Quit. `LOCAL_MODE=true` makes new organisations `chain` with no expiry so the plan gate never locks a shop that pays nothing to a server. PyInstaller (one folder) + Inno Setup produce `MobileShop-Setup-<version>.exe`; `windows.yml` builds and smoke-tests it on a Windows runner. Phones on the shop's Wi-Fi reach it when `MOBILESHOP_HOST=0.0.0.0`.
Consequences: feature parity with the cloud by construction; updates = run the new Setup, data untouched. Backups are the shop's job (Desktop copy); no cloud sync, no multi-shop; WhatsApp/SMTP/AI features need internet when used.

## ADR-030 · 2026-10-30 · Accepted · Unit-wise money is derived from documents, allocations and the ledger — nothing new is recorded
Context: The owner found the biggest gap: a phone did not show its own money (what is still owed to its seller, what its buyer still owes, every payment on it), a person did not show their phones, and payables/receivables were netted into one balance.
Decision: No schema change. `modules/units` reads what already exists: purchase/invoice lines (one device per line) give the unit's agreed price; the document's `paid` minus its payment allocations gives what was paid at the time; `Payment.allocations` (document + amount) gives every later payment, attributed to a phone in proportion to its line when a bill has several; returns from `ReturnDoc.lines`. The phone's timeline merges device events with these money rows and carries `payable_after` / `receivable_after`. A person's page gets `receivable` (sold_to rows), `payable` (bought_from rows) and `other` = ledger balance − (receivable − payable), so opening balances and misc items stay visible and nothing is netted silently. "Pay / receive for this phone" is the existing payment endpoint with an explicit allocation. Payment receipts are server-rendered HTML like the invoice. Buying-side figures are null for roles without VIEW_COST.
Backdated documents (a `date` before today on a sale, purchase, payment, return or expense) now post their ledger entries at noon UTC of that day (`ledger.at_for`), so statements and day reports file them under their own date; entries typed for today keep their real order.
Consequences: every screen reads the same records, so the Vivo scenario reconciles by construction; no backfill, no new balance caches; proportional sharing on multi-phone bills is a convention the UI explains. A per-line allocation (choosing which phone of a bill a payment belongs to) would need an allocation schema change later.

## ADR-031 · 2026-10-30 · Accepted · The asking price is revised by an event, not an edit; price rules gate it per shop; a confirmation screen precedes every phone sale
Context: The owner's fraud case: a salesman changes a phone's asking price or sells under it and the owner has no trace; worse, a revised asking price at the sale would overwrite the one set at intake. The owner also wants a last look at cost / asking / sold / profit before a bill exists.
Decision: `devices.asking_price` stays the *current* asking; every change is a `PRICE_CHANGED` device event with `from`, `to`, `reason`, `source` (`manual` | `checkout`), the invoice number and `approved_by`, under the acting user and time, and the intake event keeps the first asking (`PURCHASED.data.asking`). A sale line may carry `new_asking_price` + `asking_reason`; the service records the change before the `SOLD` event and freezes the asking in force on the line (`invoice_lines.asking_price`) and in the `SOLD` event with `below_asking` and `approved_by`. Two shop rules (`shops.sale_rules`: `below_asking`, `asking_change`; each `allow` | `manager` | `pin`, default `manager`) are enforced in `sales/approval.require` for the sale and for the manual change: owner and manager always pass; `manager` refuses others (403 `approval_required`); `pin` asks for an owner's quick PIN (409 `pin_required`, 403 `pin_wrong`, five failures per shop lock ten minutes) and records the owner who approved. The sold price is always the line's `unit_price`: receipt, lists, reports and the unit money view read the same column; the report `GET /reports/price-changes` (REPORTS_ALL) lists `asking_changed` and `below_asking` rows with per-user counts. The frontend opens `SaleConfirm` on "Complete sale" whenever a phone is on the bill (cost only for VIEW_COST roles, flags, the PIN box in place), and the unit money view shows `original_asking` beside the current one.
Consequences: an asking-price history exists for every phone without a new table; the original can never be lost; the owner picks how strict the shop is. Invoices remain immutable (no amount PATCH). A rule per staff member and an approval by a manager's PIN (rather than the owner's) are not included.

## ADR-032 · 2026-10-31 · Accepted · The Shop Audit is a read-only module over the ledger, the documents and the device events, with period semantics opening · closing · as-of · current
Context: The owner's brief (`docs/16-SHOP-AUDIT-SPEC.md`): inspect every rupee, phone, person and employee action for any period, with historical balances, drill-down, exports and a security feed — without a rebuild, without fake numbers, without destructive migrations.
Decision: `modules/shopaudit` computes everything from what already exists and writes nothing (the only write that came with the programme is the cash ↔ bank `transfer` posting in `ledger`, P2). `core/periods.py` resolves presets and custom ranges on shop days with a previous period and an `as_of` day; every balance figure is returned as opening / closing / as-of / current (ledger `until`, device-event walk for stock), every flow as the period sum; revenue is the `sales` account, cash is the cash accounts, and the two are never mixed. Thresholds (age bands, high value, thin margin, performance, bypass) are per shop in `shops.audit_prefs` with defaults, validated on save, and returned with every classification. Limitations are stated in the payloads and on the screens rather than papered over (no due dates → age of debt; no purchase tax; no remittance fees). The security feed is owner-only and built from immutable records (device events, audit log, finalised bills); a wrong owner PIN on a price approval is now an audit row. Charts are in-house SVG on the design tokens; the complete report (`/shop-audit/report`) is built from the very same service calls as the screens, as a printable page or a workbook with a sheet per section. Backdated sales and returns now stamp their device events with the document time so history and as-of stock agree with the ledger; stock age counts shop calendar days from the intake of the current cycle. Additive migrations only: indexes (`a2b4c6d8e0f1`) and `shops.audit_prefs` (`b3c5d7e9f1a2`).
Consequences: dashboards, exports and the overview cannot disagree because they share code; nothing historical is rewritten; the owner can change strictness and thresholds without a release. Costs: the as-of stock walk reads every device event of the shop (fine for shop sizes; a materialised daily snapshot would be the next step for very large shops); per-bill remaining amounts are current, not as-of (payment allocations carry no date of their own); due dates, purchase tax and remittance fees need product decisions before they can be shown.

## ADR-033 · 2026-10-31 · Accepted · Promise dates, remittance fee / status and daily stock snapshots are optional, additive and derived-friendly
Context: After the Shop Audit landed, the owner said yes to the three open product decisions: due dates on bills, remittance fees / status, and a daily stock snapshot for very large shops.
Decision: (1) `invoices.due_date` and `purchases.due_date` are optional promise dates typed on udhaar sales and supplier credit; the udhaar audit calls a debt **overdue** only after that date (overdue totals, bands not due / 0-7 / 8-30 / 31-60 / 61+ / no promise date, per-row days) and keeps the age-of-debt view for everything else — nothing without a date is ever labelled overdue. (2) `payment_details.fee` and `status` (pending / received / settled) are typed with the remittance; the international report shows fee, net = PKR booked − fee, status and totals; the ledger still books the gross PKR amount the shop recorded. (3) `stock_snapshots` holds one derived row per shop and day (count, value at cost, value at asking), taken by the nightly tick (`stock_snapshot` job claim, once per shop and day) and rebuildable by the owner (`POST /shop-audit/snapshots/backfill`); `stock_at` reads a snapshot only when one exists for the exact day end asked for and falls back to the device-event walk, so figures never change by having a snapshot — only the cost of producing them. All of it is one additive migration (`c4d6e8f0a1b3`).
Consequences: overdue becomes real for shops that type promise dates, with no change for the rest; remittance costs are visible without altering the books; big shops get constant-time as-of stock for snapshotted days. Open: per-bill remaining as of a past day still needs dated allocations; the snapshot does not store the device ids (the per-unit as-of list still walks events).

## ADR-034 · 2026-10-31 · Accepted · Bulk Excel goes through the same services as the screens, previews first, and imports all-or-nothing
**Context.** Shops migrating from a register or another app have hundreds of phones, people and
accessories. Typing them one by one is the main onboarding pain. The owner asked for Excel
import / export with sample rows a shopkeeper can copy.
**Decision.** (1) A sheet per kind (stock, people, items, sales, expenses) with three sheets: Data,
Help, Lists; three yellow sample rows in realistic Pakistani words, recognised and skipped on
upload. (2) The import never writes rows itself: it calls `add_opening_stock`, `create_purchase`,
`create_party` + `post_party_opening_balance`, `accessories.create`, `create_sale`, `create_expense`,
so ledger postings, device events, verification status, audit rows and price rules are exactly what
the screens produce. Because those services commit, the import runs them under `deferred_commits`
(commit → flush) and commits once; any refusal rolls everything back. (3) Preview first (nothing
written), every row marked ok / note / error / skipped with the reason in the shop's language;
import is all-or-nothing unless the user ticks "skip rows with errors". (4) Each upload is recorded
in `bulk_imports` with its SHA-256, so the same file is warned about; the audit log gets one row per
import. (5) Owner and manager only (the sheets carry cost prices). (6) Returns, repairs, loans,
exchanges and installments are deliberately not importable: they are state machines with documents
behind them.
**Consequences.** Migration of a shop takes minutes instead of days, and the data lands with full
history. New services must keep committing at their boundaries (the deferral relies on it). Payments
by sheet remain a later step (docs/18 §1).

## ADR-035 · 2026-10-31 · Accepted · Subscription reminders: staged bar + trilingual popup decided on the server, snooze server-side, soft-lock that still pays and backs up, signed offline renewal codes
**Context.** Owner addendum 3 (docs/19): shopkeepers must be reminded clearly before the plan ends, never annoyed, and never lose data; the provider needs a simple renewal flow, also for the one-PC install.
**Decision.** (1) The existing organisation plan / fee payments / soft-lock stay the model; new: `grace_days` (default 7, provider-wide and per shop), `plan_started_at`, `paid_on`, `receipt_no`, `plan_reminder_states` per user, `plan_renewal_codes`, `platform_settings.billing`. (2) `GET /plan/reminder` computes the stage with server time (and the clock guard) and decides `show_popup` from the stage rule, the server-side snooze and the last time shown; the client only decides *where* (never on sale / purchase / return / payment forms; on login, Home, or idle on a list). (3) Escalation voids an earlier snooze; a pending proof turns everything calm blue; a verified payment shows one thank-you with the receipt. (4) The popup shows English, Urdu and Roman together — the one deliberate exception to the one-language rule. (5) While locked the API still accepts fees, proof uploads, reminder calls and auth; exports and the backup zip are GETs and always work; nothing is deleted. (6) Renewal codes are Ed25519-signed by the SaaS server and verified locally with the public key, once per nonce, tied to the organisation. (7) Lock, unlock, snooze, report, verify, reject, renewal-code issue / redeem and backup are audit rows.
**Consequences.** Billing details live in the database, never in code; placeholders are hidden from shopkeepers until replaced. The grace default changed from 15 to 7 days. The popup's three-language layout is custom (`Tri`), not `BiLabel`.

## ADR-036 · 2026-10-31 · Accepted · A barcode is born with the unit in the purchase transaction, never changes, and hardware scanners are read by one keyboard-wedge listener
**Context.** Owner addendum 4 (docs/22): automatic barcodes on every purchase, labels that scan reliably, USB / Bluetooth scanners on every main screen, stock count, history under the barcode. Labels (ADR-024) and camera IMEI scanning already existed.
**Decision.** (1) `devices.barcode` / `accessories.barcode` with `barcode_type` and `manufacturer_code`; `new_device` and `accessories.create` assign the value inside the same transaction (`barcodes.service.assign_*`), so a failed purchase leaves nothing and a bought-back phone keeps its code. (2) The value is `shops.barcode_prefs.prefix` + zero-padded `shops.barcode_seq` (or the IMEI when the shop chooses), unless a custom / scanned code is given; uniqueness is checked against barcodes, IMEIs and SKUs of the shop; the sequence only moves forward. (3) Each barcode keeps the type it was made with; the shop's type setting applies to new ones. Code 128 default; EAN-13 (check digit computed), Code 39, QR; no Data Matrix. (4) Labels keep the ADR-024 engine; the barcode SVG is vector with 2.5 mm quiet zones; prints are audited and put on the phone's timeline. (5) Scanners: one capture-phase window listener (`lib/scanner.ts`) turns a fast key burst + Enter into a `scan`; screens claim scans with `useScan`, otherwise the shell looks the code up and opens the item; characters come from `e.code`, so the keyboard layout is irrelevant. (6) Lookup order: barcode → IMEI 1 → IMEI 2 → item barcode → SKU → maker's codes. (7) Backfill is idempotent (only rows without a barcode).
**Consequences.** Every phone and item has a stable scannable identity from day one; old stock gets one by backfill; a reprinted label of any age still works. Shops that scan into the Urdu layout work. The `scan` listener swallows the Enter of a scan so the focused form is not submitted by the scanner.

## ADR-037 · 2026-10-31 · Accepted · Accessories get a product card, purchase batches and price tiers on top of the existing rows — additive, pieces stay the base unit, the average stays the default
**Context.** Owner addendum 5 (docs/24): audit the accessory fields first, then upgrade to what mobile-shop POS systems track (brand, fit, grade, variants, supplier SKUs, warranty, units, price tiers, tax, location), record every purchase as a batch with its cost, keep a full timeline, obey the price rules at the counter, add filters and reports — without duplicating or renaming anything.
**Decision.** (1) The existing `accessories` row stays the item: `qty` is always pieces, `price` is the retail price, `avg_cost` the weighted average per piece; 28 nullable / defaulted columns are added for the card (docs/25 §2). A variant is its own item (own SKU / barcode / stock / prices); there is no parent-child table. (2) `accessory_batches` records every incoming lot (purchase, opening, return, adjustment) with `qty_left`; every outgoing movement empties the oldest first, so batches always show what is still here. Valuation is a shop setting (`item_prefs.valuation`): average (default) keeps `avg_cost` as the cost of a sale; FIFO puts the exact batch cost on the sale. (3) `accessory_price_changes` keeps cost / retail / wholesale / minimum / promo history (edit, purchase, bulk, markup). (4) Units: the shop table (dozen 12, box, carton) plus per-item `pack_units`; a purchase line typed in dozens is converted to pieces and a per-piece cost in the service; the typed unit and count are kept on the line. Freight / loading on a bill is spread over its lines like the discount and added to the item cost and to the supplier total. (5) Price at the counter: promo while running → dealer (`parties.wholesale`) → retail; under the minimum price the sale needs the same approval as a phone under its asking price (`sale_rules.below_asking`); under cost the owner / manager must confirm the loss; negative stock only when `item_prefs.allow_negative_stock`. (6) `invoice_lines.warranty_until` is set from the item's (or the line's) warranty days, so a claim can be checked by invoice or by scanning. (7) Migration `a8b0c2d4e6f8` is additive, backfills one "Opening stock" batch per item with stock, is idempotent and resumable (checks before each add), and drops nothing. (8) Transfers between locations are not stock events (single-shop stock; `location` is a shelf label).
**Consequences.** Old data is untouched and still displays; new screens read the extra columns when present. The item page can answer "where did this come from, what did it cost, what is left" for every piece bought from now on, and at the average for older stock. Per-line GST stays informational until the FBR invoice totals are decided (docs/25 §5).

## ADR-038 · 2026-10-31 · Accepted · Tablets and smart watches stay on the one device model: `category` is the device type, a spec sheet in JSON with a per-shop model library, lock checks as an event, reclassification that touches nothing else
**Context.** Owner addendum 6 (docs/26): audit first, then make tablets and smart watches first-class — spec-sheet fields, grade, lock status of used units, a model library that fills itself, a duplicate check that shows history, PTA only with a SIM, filters and reports by type, a safe reclassification tool, and no regression for phones.
**Decision.** (1) No `device_type` column: `devices.category` (phone / tablet / watch, default phone since 2026-10-28) *is* the type; the brief's MOBILE / TABLET / SMARTWATCH are its labels. (2) What is filtered or enforced becomes a column (`ram_gb`, `grade`, `warranty_by`, `lock_checks`, `lock_checked_at / by`); the rest of the spec sheet is `devices.specs` JSON with a fixed key list (`types.SPEC_KEYS`), because the keys differ per type and change with every new model. (3) The shop's model library `model_specs` (per shop + model, unique) learns from every saved unit (only non-empty values, never erasing), can be edited and imported from CSV, and overlays `models.specs` (global). The add-device form fills itself from it. (4) A used tablet / watch must carry its lock checks (or the tick "lock checked and removed") when bought; used phones only when `device_prefs.require_lock_check` is on (default off, so existing phone flows and tests are unchanged); opening stock is exempt. A lock recorded as `not_cleared` refuses the purchase and later the sale (`lock_not_cleared`). Every check is a `lock_checked` event with who / when / what. (5) `GET /devices/imei/{x}` also takes a serial number, so the duplicate warning and the in-stock block work for Wi-Fi units; the chip links to the unit's page. (6) Reclassification (`/devices/reclassify/preview|apply`) changes only `category` (+ the derived `cellular`, storage / size / PTA consistency) and optionally the model, writes a `reclassified` event, and refuses units whose model is of another type or that lack an IMEI for "phone"; IMEI / serial, barcode, events, invoices and balances are untouched. One counted item becomes one unit (`/devices/from-item/{id}`): the item loses one with a reason, the unit enters as opening stock at the item's cost, both sides note each other. (7) The bill names the type, storage / RAM, colour, condition / grade and PTA under the device line; labels add RAM. (8) `GET /reports/stock-by-type` (count, cost, asking value, used, lock unchecked / failed, non-PTA, older than 60 days); the other asked-for reports already existed by category. (9) Migration `b9c1d3e5f7a9` is additive, idempotent and reversible.
**Consequences.** Phones, tablets and watches share one timeline, ledger, barcode rule, anti-fraud rules, exports and e2e; a unit's type can be fixed later without losing anything. Per-unit specs stay free-form inside a known key list, so reports can still group by RAM / grade. "Factory unlocked" is a lock check (`carrier`), not a PTA status.

## ADR-039 · 2026-11-01 · Accepted · Provider console: the owner's business view is derived from fee payments and organisations; every license key is stored; usage is a throttled last-active stamp and a one-PC heartbeat
**Context.** The owner (docs/28) wants one place to see income, who paid through which channel, time left per shop, packages, pending / upcoming / overdue fees, who uses the cloud app and who the one-PC install, and to find, resend, renew and cancel license keys — with a magic link. Issued renewal codes were not stored, so a lost key could not be found.
**Decision.** (1) `GET /admin/business/{overview,shops,payments,keys}` derive everything from `fee_payments` (approved = received), `organisations` and `license_keys`; MRR = monthly fee of paid plans not expired / locked; "coming" = fee of plans ending in 7 / 30 days; "overdue" = past end. Channels are grouped case-insensitively. (2) `license_keys` keeps every issued key (code, months, note, issuer, status issued / redeemed / revoked, sends, magic-link token valid 7 days and its opens); renewing issues a new key and revokes the unused old one; a revoked key is refused on the cloud and listed in the heartbeat answer. Sending is free: the owner's WhatsApp / SMS app opens with the key, steps and link. (3) `organisations.last_active_at` is stamped once a minute per organisation from the auth dependency (before the request's own work, best-effort); "online now" = used in the last 10 minutes. (4) The one-PC install posts `POST /public/heartbeat` hourly when `SAAS_URL` is set (version, keys used); the provider sees it as offline with its last-seen time. (5) On a one-PC install the first valid key links `license_org_id` to the customer it was issued for (the local organisation has its own id, which made codes unusable before); later keys must match. (6) Migration `c1e3a5b7d9f1` additive and reversible.
**Consequences.** The owner can answer "who paid, how, how much is coming, who is about to lapse, who is actually using it" from one screen and recover any shopkeeper's key in two taps. A key redeemed offline before it was revoked cannot be taken back; the heartbeat needs internet on the shop PC.

## ADR-040 · 2026-11-01 · Accepted · Business profile on the shop row; one printed header / footer; the currency is a label over PKR
**Context.** The owner wants shops to set their logo, their own details, business details, NTN and the currency, with research on what else belongs (docs/30).
**Decision.** (1) Profile fields are columns on `shops` (legal name, tagline en / ur, business type, registration, year, province, email, website, social, opening hours, owner name / CNIC, FBR POS ID, bank details, terms en / ur, currency, print choices); NTN / STRN / CNIC / email are validated. (2) The logo is uploaded through `POST /shops/current/logo` and printed inlined as a data URI, so printed pages, PDFs and shared links show it without a login. (3) `auth/profile.py` builds one header and one footer for printed documents (sale bill, repair slip), driven by the shop's print choices. (4) Money is always PKR (hard rule); `shops.currency` only decides how it is written (sign, before / after, paisa). The app reads it from `/me` and formats every amount through `formatMoney` / `withCur`. (5) Migration `d2f4b6c8e0a2`, additive.
**Consequences.** A shop's change in Settings shows on every bill and screen at once. Notification templates and Excel sheets keep "Rs." until moved to the label. FBR POS transmission stays out of scope.

## ADR-041 · 2026-11-02 · Accepted · Len-den is a payment with purpose `lending` in the person's one khata, posted under its own document type, adjusted against bills only on demand
**Context.** Shops give and take money with people with no bill; the same person may later buy or sell (docs/32). Such money already reached the khata as a stand-alone payment, but every report called it udhaar received / paid to people, and it could never pay a later bill.
**Decision.**
- (1) `payments.purpose` (`bill` default, `lending`), migration `e3a5c7e9f1b3`, additive.
- (2) A lending entry posts to the same party account, so the khata nets with later bills. Its ledger group is `lending` (reversal `reversal:lending`), and every report names it: cash reasons `lent` / `borrowed`, day report `lending`, udhaar movement `lent` / `borrowed`, overview `lent_in_period` / `borrowed_in_period`.
- (3) A lending entry is never allocated when made; allocations on one are refused.
- (4) Open len-den per person = unallocated lending out − unallocated lending in. It is a part of the khata, never a second balance.
- (5) `POST /payments/settle/{party_id}` puts free money (advances first, then the net of len-den) on the person's open bills, oldest first. The ledger is untouched; it only marks the bills paid, and it is an audit row.
- (6) A report screen `/shop-audit/lending` and the complete-report section `lending`.

**Consequences.**
- Existing payments read as before (`bill`).
- Adjusting is a deliberate button, not automatic at the counter.
- No interest, due date or reminder for len-den.


## ADR-042 · 2026-11-02 · Accepted · Len-den return dates: one optional date per entry, the earliest open one counts per person; reminders to people who owe, alerts for what the shop owes
**Context.** The owner wants reminders for len-den (docs/32 §7).
**Decision.** `payments.due_date` and `reminded_at` (migration `f4b6d8f0a2c4`). The status is derived per person from their open entries on their side. A person who owes the shop gets a WhatsApp reminder, by hand or from the night job (a day before, on the day, then every 3 days; only when the shop's udhaar reminders are on). What the shop owes is never messaged to the person; it is shown to the owner (home, overview, audit). Changing a date is an audit row; nothing is deleted.
**Consequences.** The udhaar reminder (balance untouched N days) and the len-den reminder can both reach the same person; each has its own gap.

## ADR-043 · 2026-11-02 · Accepted · Help on everything: one `Help` component, texts per module namespace, a test that no term lacks a language or an example
**Context.** Shopkeepers asked for an info icon with an example on every field, tab and card (docs/33).
**Decision.**
- `Help` takes any `help.<term>` (nested) and a small size; `Section`, `KV` and the phone / CNIC / IMEI inputs take a help key; the phone / CNIC / IMEI inputs show a default one.
- Every term has `title`, `body` and `example` in en / ur / roman. `Help.test.ts` scans the code for literal terms and fails on any gap.
- Terms built from server keys go through literal maps (`helpKey: '...'`), never template strings.
- Shared wording lives once in `help.common.*`; module texts sit under the module's namespace.

**Consequences.**
- A new screen or field without its texts fails the test.
- Tabs that are buttons get one icon beside the group, which explains the selected tab.

## ADR-044 · 2026-11-03 · Accepted · Repair labs are `technician` parties; one `repair_dispatches` row per trip; the lab's charge is booked on return; a repair sticker with picked fields
**Context.** Shops send phones to many repair labs in the market and want each lab's complete record, the history in the repairs module and in the audit, and a sticker with the phone's details whose fields they choose (docs/34).
**Decision.**
- (1) A lab is a party of kind `technician`.
- (2) `repair_dispatches` keeps every trip: sent / back (fixed or not, charge, paid now) / cancelled. One open trip per job.
- (3) The charge is booked when the phone comes back, credited to the lab's khata less what was paid now:
  - customer's phone → `cogs`;
  - own phone → `inventory` and the phone's cost.
  Delivery books only an outside cost no trip already booked.
- (4) Back fixed → `repaired` + the "ready" message.
- (5) Status log, audit row and (own phone) `note` device event on every step.
- (6) `/labels/repairs` prints the sticker with the fields asked for; the barcode is the job number and `barcodes/lookup` resolves it; the screen lock is never printed.
- (7) `/shop-audit/repairs` and the report sections `repairs` / `repair_labs`.

**Consequences.**
- Repair profit now includes outside lab costs on customers' phones.
- A lab's unpaid charges show on its khata like any payable.

## ADR-045 · 2026-11-04 · Accepted · Trial balance and balance sheet are derived from the ledger, never stored
- **Context:** Competitors (HysabOne, BluePrimes) sell "accounts"; shops' accountants ask for a balance sheet (docs/35 §5 item 1).
- **Decision:** `reports/accounts.py` sums the ledger per account up to the end of the shop's day.
  - Cash accounts add their opening balance, which lives on `cash_accounts`, not in the ledger, with the other side on "opening balances" (equity).
  - Party accounts fold into two lines: people who owe the shop / people the shop owes.
  - `expense:owner_drawing` reduces the owner's share on the balance sheet and is not an expense, as in the profit and loss report.
  - Profit so far = −Σ(income + expense accounts), so it equals P&L over all time.
- **Consequences:** Nothing new is stored or posted. Both reports are always balanced by construction; a check line shows it, and a test asserts it. Checked on 1,238 local shops: all balanced, profit equal to P&L.

## ADR-046 · 2026-11-04 · Accepted · Branch transfers: each shop keeps its own row for a phone; the move is two events and two ledger groups
- **Context:** Owners with branches (chain plan) need to move phones and items between them (`docs/35` §5 item 2). IMEI and barcode are unique per shop, and every old bill, return and verification points at the shop's own device row.
- **Decision:**
  - Phones: a move never changes a row's `shop_id`.
    - The sender's row gets `transferred_out` and the new status `transferred`; its history stays in that shop.
    - The receiver gets a row for the same unit, either a new one or its old row if the unit was there before. Its next event is `transferred_in`, and it carries the cost, asking price, barcode (when free in that shop) and verification result.
    - Both events are money events, so the generic events endpoint refuses them.
  - Items: the oldest batches leave the sender at FIFO cost and open a batch at that cost in the receiver's item with the same SKU. If the branch has no item with that SKU, one is made from the sender's card.
  - Money: stock moves at cost through a new equity-like account `branch_transfer`, nothing is sold and profit is untouched. Sender: Dr branch_transfer / Cr inventory. Receiver: Dr inventory / Cr branch_transfer. Across the owner the two sides cancel; the balance sheet shows the line under the owner's share.
  - Who: owner and manager (`view_cost` + `transact`), only to a branch of the same organisation that the user works in. Instant, with no "in transit" step.
  - The table is `branch_transfers` / `branch_transfer_lines` (migration `b6d8f0a2c4e7`, additive); numbers are `TRF-000001` per sending shop.
- **Consequences:**
  - Existing flows are untouched. Buying back a unit whose row is `transferred` works like buying back a sold one.
  - The receiving shop sees no verification documents, only the result; those stay with the sender's row.

## ADR-047 · 2026-11-05 · Accepted · The customer's repair status link is the job id signed with the server secret
- **Context:** Customers ask on WhatsApp "is my phone ready?"; competitors send customer notifications (`docs/35` §5 item 5).
- **Decision:**
  - The link is `/r/<job id hex>.<HMAC-SHA256(secret_key, "repair-status:<id>")[:24]>`. Nothing is stored and it never expires; a changed link fails with "not valid".
  - `GET /api/v1/public/repair/{token}` (no login) returns only:
    - shop name, city and phone;
    - job number, device and the IMEI's last 4 digits;
    - faults, status steps with dates, ready-by day;
    - bill or estimate, paid, left, warranty days;
    - "at the workshop" when the job is at a lab.
  - It never returns the customer's name or phone, the full IMEI, the screen lock, the lab's name, the technician or any cost.
  - The job page sends the link with a WhatsApp button addressed to the customer's number, or copies it. The page builds the link from its own address, as the license magic link does.
- **Consequences:**
  - The automatic "repair ready" WhatsApp message carries the link: "See it here: …". It is added 2026-11-05 through the `PUBLIC_URL` setting, which compose fills as `https://${APP_DOMAIN}`; when it is empty, the https entry of `WEBAUTHN_ORIGINS` is used. On a localhost / one-PC install there is no public address, so the line is left out.
  - The whole message is still the single `{{1}}` of the approved Meta template, so no new template approval is needed.
  - Rotating `SECRET_KEY` invalidates old links (and logs everyone out anyway).

## ADR-048 · 2026-11-05 · Accepted · Accounting audit: stock on the ledger always equals stock in the shop; a loss never reads as a profit
- **Context:** The owner asked for a full recheck of the accounts after shopkeepers were confused by a minus they could not explain. An invariant script ran over all 1,268 local shops and every report of the demo shops. Phone stock matched to the paisa everywhere and every group was balanced; the problems found are listed below.
- **Decisions:**
  - A sale's typed "other item" (not from stock) with a buying price posts Dr cogs / Cr **equity** (the owner's goods, like opening stock), never Cr inventory. A customer return of it reverses into equity.
  - A supplier return of a stock item takes the pieces out at their stock value (FIFO / average) as Cr inventory. A difference from the bill's price is posted to cogs. It no longer credits `purchases`.
  - A repair part's cost is what left the stock (the movement's FIFO / average cost), as for a sale.
  - A dealer bill's other item (not kept in stock) is spending: `expense:other_purchases`, a seeded category "Items bought, not in stock". It reaches every profit report. The old `purchases` account was in no profit report.
  - `ledger/corrections.py` adds new, keyed, dated correction groups for postings made before the fix. It runs once in migration `c7e9a1b3d5f8`; nothing is changed or removed.
  - Shop audit, repairs: profit matches each customer job's lab charge with its bill (the jobs given back in the period). Lab charges on jobs not given back yet are shown apart as "lab_waiting".
  - Display: `MoneyText` shows "−" whenever its colour does not tell the sign (`ink` / `muted`, or `signed`). The day report, Reports (gross / operating profit, best sellers, price changes) and item profit show a loss as "− 2,100", never as a plain number.
  - A cash / bank / wallet account's opening balance can be set later by the owner (audited). Cash & bank explains an account below zero, except cheques given and not cleared.
- **Not changed:**
  - A customer job's lab charge is still booked to cogs when the phone comes back (ADR-044); only the audit card matches it to the bill.
  - Cash can still go below zero; the app explains it instead of blocking a sale.

## ADR-049 · 2026-11-06 · Accepted · Tax-invoice details on every bill; phones taxed at import (Ninth Schedule) by a shop setting
- **Context:** The owner's sample FBR POS receipt and `docs/36` research: mobile phones are in the Ninth Schedule (sales tax paid at import, none added on later supplies), accessories carry the standard rate, and a tax invoice shows the total excluding tax, tax by rate and the amount in words.
- **Decision:**
  - `shops.phones_tax_at_import` (off by default, so existing shops' bills do not change): on, a taxed bill puts rate 0 on phone lines (`category == "phone"`) and prints why. The screen's `billTax` mirrors the server exactly (a per-phone rate).
  - `invoice_lines.tax_rate` stores each line's rate. On a taxed bill the receipt prints "Total excl. tax", one "Tax r% on base" line per rate, the phones' Ninth-Schedule note and "Total tax". Older bills (no stored rates) print as before.
  - `invoices.cash_tendered` (optional, must be ≥ paid) prints "Cash given" and "Change".
  - Every bill prints the cashier, the time, and the amount in words (`core/words.py`: lakh / crore, English and Urdu).
  - Migration `d8f0b2c4e6a9` is additive.
- **Next:** live FBR reporting (POS / IMS or Digital Invoicing) as in `docs/36` §4, once the owner provides sandbox credentials and a tax adviser confirms rates and PCT codes.

## ADR-050 · 2026-11-06 · Accepted · FBR Digital Invoicing built ready-to-plug: queued per bill, sent through PRAL's DI API, never twice, off by default
- **Context:** The owner wants all of our side done, so that only the NTN / STRN, the IRIS token and a tax adviser's word remain (`docs/36` §5). DI is FBR's current direction and has a documented 2025 spec and sandbox; POS / IMS can reuse the same queue later.
- **Decision:**
  - `shops.fbr_settings` (JSON) holds `enabled`, `env` (sandbox / production), `province`, and per kind of goods (phone / other device / item) the sale type, HS code and sandbox scenario.
  - The token is encrypted (Fernet, key derived from `SECRET_KEY`) and is write-only: no API returns it.
  - Switching on needs a token and the shop's NTN.
  - `fbr_submissions`: one row per bill (`invoice_id`, `kind` unique), status pending / sent / rejected, attempts, last error, the request and FBR's answer, `next_try_at`.
  - The bill is queued inside the sale's transaction. It is sent in a background task right after the response, and the scheduler sends what is waiting every minute.
  - A **claim** (`next_try_at` pushed two minutes, conditional update) keeps two workers from posting the same bill. An accepted bill is never posted again.
  - Outcomes:
    - Unreachable: retried after 1, 2, 5, 10, 30, then 60 minutes.
    - FBR "invalid" or a 401 / 403: rejected, until the shop fixes the cause and presses "Send again".
    - Accepted: `invoices.fbr_invoice_no`.
  - The receipt prints "FBR Digital Invoicing System", the QR (1 × 1 inch) of the FBR number and the number; until then it prints "FBR: waiting to be sent".
  - Payload (`build_payload`) follows the PRAL DI spec field names:
    - seller NTN, province (mapped to FBR's names), walk-in buyers "Unregistered";
    - per line: excl. value, tax, total, discount, the sale type and HS code by kind;
    - `scenarioId` only in sandbox.
  - Settings → "FBR Digital Invoicing" card (owner): on / off, sandbox / production, token, sale types and HS codes, "Test with FBR" (sandbox validate method, nothing recorded at FBR), and the waiting / turned-down list with "Send again". Each bill's page shows its FBR status.
- **Consequences:**
  - Nothing changes for shops that do not switch it on, and FBR being down never stops a sale.
  - Still to do once credentials exist:
    - run the sandbox scenarios (SN015 / SN026 / SN027);
    - confirm the DI logo image (we print the text "FBR Digital Invoicing System");
    - add sale returns as debit / credit notes (`invoiceRefNo`);
    - confirm sale types and HS codes with the tax adviser.
  - Tests use a stand-in for FBR; the real FBR is never called from tests.

## ADR-061 · 2026-11-10 · Accepted · A phone's page has selectable styles over the same actions
**Context**: in shop testing, shopkeepers found the phone page hard to use: details, then actions, then customer, then history. They wanted the actions beside the values and the customer with the phone.
**Decision**:
- The page keeps its data and every action and sheet. `DeviceDetailPage` builds one list of actions (`Act`), the same buttons as before with the same rules.
- New styles in `DeviceLayouts.tsx` show the same facts with each action beside its value:
  - **Smart**: facts with inline actions, the people with what is owed and pay / receive, then history.
  - **Tabs**: Phone / Customer & money / History.
  - **Tiles**: tap a fact to change it.
  - **Compact**: a list with Sell pinned at the bottom.
- **Classic** is the old page, unchanged, and stays the default.
- The choice is per device (`localStorage` `device.style`).
- `UnitMoney` gains `historyOnly`, so the new styles do not show the money cards twice.
- Frontend only: no API, data or rule changes.
**Consequences**: every style has to be kept in step when an action is added to the page (add it to `acts`; unknown ones appear under "More actions" automatically).

## ADR-060 · 2026-11-10 · Accepted · Reserve stock for a customer without posting; a shelf for a phone; SIM time optional
**Context**: after ADR-059 the owner asked for reserve and shelf, and to make the SIM time of a Non-PTA / JV phone optional.
**Decision**:
- **Phone:**
  - New columns: `devices.reserved_party_id / reserved_at / reserved_until / reserved_note / reserved_by`.
  - `POST /devices/{id}/reserve` (in stock only, one hold at a time) and `POST /devices/{id}/release`. Each writes a status-neutral event, `reserved` / `unreserved`.
  - The status stays `in_stock` and nothing is posted.
  - The sale (`check_device_sale`) refuses a reserved unit for anyone else (`reserved_for_other`, walk-in included) and clears the hold when its customer buys it.
  - "Available to sell" excludes reserved units, and the stock screen has a **Reserved** card / filter.
- **Item:**
  - New table `accessory_reservations`, with fields `qty`, `fulfilled_qty` and `status` (open / done / released).
  - Reserving is limited to free pieces (`not_enough_free`).
  - The sale refuses selling pieces held for others unless the shop allows selling into minus (`reserved_stock`), and fills the buyer's own hold oldest first.
  - Release: `POST /accessories/reservations/{id}/release`.
- **Shelf:** `devices.location` (String 60). It is set on purchase, opening stock or edit, searched, filtered (`location`) and shown in the spec line and a "Shelf / place" field.
- **SIM time:** the SIM time of a Non-PTA / JV phone is optional (schema, edit, bulk import, form).
- **Change seller:** the phone page has "Change dealer / customer", which opens its purchase with the ADR-056 change sheet (`?change=1`).
- Migration `a7c9e1b3d5f8` is additive (nullable columns + new table).
**Consequences**:
- A hold does not expire by itself; the owner releases it.
- Reserving takes no advance; an advance is taken as a normal payment.
- A reserved unit can still go out on loan or to repair; the hold stays on it.

## ADR-059 · 2026-11-10 · Accepted · The stock screen's kind tabs, status cards and filters are read-only views over the existing statuses; "reserved" is not added
**Context**: an owner brief asked for the stock screen to show available / reserved / inspection / low / out / value, filters by status, source, age and cost, and filters kept when coming back from an item. The shops are live, so only gaps that are safe to add were in scope.
**Decision**:
- `GET /devices/stock-status`: counts units held by the shop (in stock, faulty, in repair, with a customer for approval, on loan).
  - **Available** uses the sale's own rule: in stock, ID check not pending / flagged, no lock `not_cleared`.
  - **Inspection** is an in-stock unit that the sale would refuse.
  - Items low / out use each item's `reorder_level`.
  - Value at cost (devices' cost + items' qty × avg cost) is for `VIEW_COST` only.
- `GET /devices` takes optional `sellable`, `inspection`, `cost_min / cost_max` (ignored for staff) and `supplier_id`. The search also matches the barcode / maker's code. Each row carries `source_party_id / name` (its latest purchase or branch intake), read in one query.
- The stock export can include a "Bought from" column.
- **Screen**:
  - Kind tabs: phones / tablets / watches filter the list; accessories / spare parts / other open the items screen with `?category=`.
  - Status cards that toggle a filter, and more filters (condition, PTA, age 30 / 60 / 90, bought from, cost range).
  - The kind, card, status, filters and sort are kept in `sessionStorage` for the tab, so returning from a phone restores them; a Shop Audit link starts fresh.
  - The phone page has a "Get / give" link to its open balances.
- Defaults, routes and the existing API fields are unchanged; no migration.
**Not done (would change transaction rules)**: reserving a unit or part of an item's quantity. There is no reservation in the app; the closest existing state is "with customer for approval", shown as its own card. Also not done: branch / shelf filters for phones (phones have no shelf), and a received-date range (age buckets cover it).

## ADR-058 · 2026-11-10 · Accepted · Open balances: one read-only view of lena / dena by phone, customer, dealer and technician
**Context**: an owner brief asked for one screen of what is still owed, both ways, by Mobile / IMEI, customer, dealer and technician, with drill-down and payment straight from a row. The audit found:
- The **Udhaar khata** shows one net balance per person, with no split, no dealer / technician tabs and no IMEI view.
- **Money on this phone** (`/devices/{id}/money`) and **a person's phones** (`/parties/{id}/units`) show one phone or one person at a time.
- Payments posted fine, and `PaymentForm` already took an allocation, but it sent a new Idempotency-Key on every try.
**Decision**:
- `GET /balances?view=imei|customer|dealer|technician&direction=&q=` (owner / manager, `VIEW_COST`), `balances/service.py`. It is read-only: nothing new is stored. Its sources are:
  - sale bills (`total − returned − paid`; below zero a return credit to give);
  - purchase bills (the same, the other way);
  - repair jobs delivered on udhaar;
  - repair-lab charges not paid (`final_cost − paid_now`);
  - a person's payments not on a bill, applied oldest first to their non-bill items (lab charges, return credits / repair jobs).
- What the bills cannot explain becomes one **Other** row per person, so each person's get − give equals their ledger balance and every amount is counted once.
- A phone's key is the single IMEI on the item. A bill with more than one phone goes under **Unallocated by IMEI**, never split.
- The tab follows the person's kinds: technician, then dealer (supplier / shop), then customer.
- The screen is `/balances` (**Udhaar → Get / give**, **More → Open balances**, owner / manager). A row opens its items; **Receive / Make payment** opens `PaymentForm` with the person, the direction, the amount and the bill.
- `PaymentForm`: an `amount` prefill, `noAllocation` (money for a non-bill item is not put on another bill), and one Idempotency-Key per form.
**Consequences**:
- A payment for a lab charge or a return credit is recorded "not on a bill" (allocations only exist for sale / purchase bills); the view applies it oldest first.
- Salesmen keep the khata, not this screen.
- An open amount on a multi-phone bill is not apportioned per phone here; **Money on this phone** still shows its proportional share.

## ADR-057 · 2026-11-10 · Accepted · Exchanges and returns settle like udhaar: the trade-in is put against the new bill, the rest is paid now, partly or later
**Context**: an owner audit brief with tables of exchange and return cases (a phone sold days ago comes back; trade-in at an agreed value or a return; whoever owes pays all, part or nothing now).
- The khata and cash were already right in every case, and the IMEI history kept the first sale.
- The bills were not: the trade-in purchase and the new bill both stayed "open" (e.g. 70,000 to give and 82,000 to get on a 12,000 receivable).
- The screen always paid the shop's whole difference, the exchange had no payment method, no link to the first bill and no Idempotency-Key.
- The return screen could not keep the rest in the khata after a part refund, nor give less credit than was owed.
- The dashboard's "received today" counted `invoice.paid`.
**Decision**:
- **Exchange**:
  - The trade-in value is applied to the new bill (`invoice.paid`) and its own bill (`purchase.paid`) without moving money, like len-den adjusting (ADR-041); a refund also marks the trade-in bill paid.
  - The refund is limited to what the shop owes (`refund_exceeds`).
  - The money paid now or back carries a `payment` method (cash / online / cheque).
  - `exchanges.original_invoice_id` (the bill this shop sold the phone on to this customer, found from its `sold` event), `trade_in_applied` and `refund` (migration `f3a5c7e9b1d4`, additive).
  - The POST takes an Idempotency-Key.
- **Return**:
  - The cut (`kept_amount`) may be larger than what was paid for the returned lines, so the credit can be less than the bill price; nothing may then be handed back and the rest of the old udhaar stays due (`cut_exceeds_value` when the cut is more than the value).
  - The POST takes an Idempotency-Key.
- **Screens**:
  - Exchange: "Shop pays now" (all / part / none), a payment method, "To get from customer / To give to customer / Settled", "First bill".
  - Return: "Credit for what came back", "The rest: customer's khata / shop keeps it", and a card with who owes whom.
  - Both send one Idempotency-Key per form (`useDocMutation(..., { key })`).
- **Receipt**: an exchange bill shows "Old phone taken back · EXC-…", "Paid now", "Paid to customer". Any bill's balance line reads "To get from customer / To give to customer" (ur: گاہک سے لینا / گاہک کو دینا) instead of a signed "Account balance".
- **Dashboard**: `received_today` is the money in cash / bank accounts inside today's sale postings.
**Consequences**:
- Old exchanges keep their open bills; nothing is rewritten.
- A negotiated buyback with no replacement stays a normal "Buy a customer's phone" purchase (already right; the first sale stays in the phone's history).
- The return has no printed slip of its own (unchanged).

## ADR-056 · 2026-11-09 · Accepted · A wrong IMEI or seller is corrected, never erased; stock is checked before it is saved
**Context**: in testing the owner found no way to put right an IMEI typed wrong, or the wrong dealer / customer picked, once the stock was saved, and asked for a final check before saving.
**Decision**:
- `POST /devices/{id}/correct-imei` (owner / manager, `Cap.VOID`, reason required):
  - IMEI 1 / IMEI 2 must be 15 digits, unique in the shop and not equal to each other; IMEI 2 can be removed.
  - The barcode and the history stay.
  - A new status-neutral event `corrected` (`{field, from, to, reason}`) is written per changed number, plus an audit row.
- `POST /purchases/{id}/party` (owner / manager, reason required): a new group `purchase_party_change`, dated like the purchase, moves the bill total and the amount paid with it from the old person's account to the new one's (debit old / credit new for the total, the reverse for the paid part). Cash is untouched.
  - `purchase.party_id` changes.
  - Each phone gets a `corrected` event (`field = seller`) and an audit row is written.
  - Refused when a later payment is allocated to the bill or anything was returned on it (those were made with the old person).
- The Add stock wizard shows every detail once more ("Check before saving"). Save stays disabled until "I have checked" is ticked; Edit on a phone goes back to its sheet.
**Consequences**: older readers ignore the unknown event type. Sales and other documents keep the IMEI as printed at the time.

## ADR-055 · 2026-11-09 · Accepted · An Apple unit's region code and SIM setup are per-unit fields with shop-added values
**Context**: shopkeepers buy and sell iPhones by their region code (the letters after the part number, e.g. MLPF3LL/A → LL/A) and SIM setup (US iPhones from the 14 have no SIM tray: dual eSIM; most others physical + eSIM; China / Hong Kong two physical SIMs). The owner asked for both, with "New" for values not in the list.
**Decision**:
- `devices.region_code` (String 12, kept in capitals) and `devices.sim_type` (String 30: a key `physical_esim | dual_esim | dual_physical | physical`, or the shop's own words). Migration `d7f9b1c3e5a8`, additive and nullable.
- Presets live in `devices/types.py` (`REGION_CODES`, `SIM_TYPES`). Values the shop added are not stored in settings. `GET /devices/options` derives them from what the shop's devices already use, so a new value is offered again from then on.
- The form asks both only for an Apple device (brand Apple, or a model starting iPhone / iPad / Apple watch). The SIM row only shows on a unit that takes a SIM. Neither is required.
- `devices.battery_cycles` (Integer 0–5000, migration `e1a3c5e7f9b2`): an Apple unit's battery cycle count. It is asked next to battery health for a used / open-box Apple unit and is not required.
- They show in the stock line, on the device page and on the price sticker (English short form).
**Consequences**: there is no stock filter by region yet, and the bulk Excel import / export does not carry these two columns yet.

## ADR-054 · 2026-11-09 · Accepted · Deleting a customer moves it to the bin; nothing is erased
**Context**: the owner asked for a "delete shop" option. A shop's bills, khata, ledger and device events are append-only and tied together; erasing them would break the project's rules and could not be undone after a mistake.
**Decision** (owner chose "bin" and "super admin, whole customer"):
- Only the super admin deletes, and only a whole customer (organisation, all its branches), from the shop sheet. The shop's name must be typed again; an optional private reason is kept. The provider's own organisation can never be deleted.
- Delete sets `organisations.is_active = false` with `deleted_at / deleted_by / deleted_reason` (migration `c5e7a9b1d3f6`, additive). No row of the shop is changed or removed. Each delete and restore writes an audit row.
- A deleted customer cannot sign in (`shop_closed`), its tokens stop working on the next request, refresh fails, the super admin cannot open it, it leaves the shop list, the business console figures and the night jobs. It is listed under the **Deleted** filter.
- **Bring it back** clears the fields; the shop works exactly as before.
- The one-PC heartbeat / licence routes do not look at `is_active`, so a PC install keeps working even if its cloud entry is deleted.
**Consequences**: permanent erasure (e.g. a data request) is not built; if needed later it is a separate, deliberate step. A deleted customer's owner phone stays taken, so the same number cannot open a new shop; restore the old one instead.

## ADR-053 · 2026-11-09 · Accepted · A package given on credit is an unpaid fee; payments clear it first
**Context**: some customers ask the provider to extend the package and promise to pay later (agreed by word). The owner wants to do that, with the customer never seeing a credit option, and the fee invoice showing the fee as not paid / part paid.
**Decision**:
- `fee_dues`: one row per extension on credit (invoice `FEE-0001` …, months, amount, period, promised day, the provider's own note). Made only by the super admin (`POST /admin/shops/{id}/credit`); the plan is extended in the same step. Never edited.
- `fee_payments.to_dues`: the part of an approved payment that cleared unpaid fee, set at approval and never changed. By default a payment clears all the unpaid fee it can, then buys months (reported months, or none when it all went to the fee). A renewal code never counts against unpaid fee.
- Paid / left / status per invoice are derived (dues oldest first against the sum of `to_dues`), never stored.
- The shop sees `dues` on its fees page (without the note), the fee invoice (`/plan/fee-invoice`, the provider prints the same page), and `fee_unpaid` in the reminder popup. The word "credit" never reaches the shop.
**Consequences**: the provider's list shows "Owes" and a "Fee unpaid" filter; the plan stage (reminders, lock) still follows only the paid-until date, so a shop with unpaid fee keeps working until its package ends.

## ADR-052 · 2026-11-07 · Accepted · Appearance is per device; the bill QR is a signed link
**Context**: the owner asked for three more designs of the dashboard and side panel, an "Appearance" option where users change theme, design and colours, and a QR on the invoice.
**Decision**:
- Appearance (theme, palette, layout, accent, text size, corners, font) is stored in the browser (`mobileshop.look`, as the theme already was), not on the server: every counter PC / phone can look the way its user likes, and nothing changes for other staff. Accent / corners / font / text size are applied as inline CSS variables on `<html>`; the layout is `data-layout` and the dashboard and side panel render one of four designs (classic, tiles, simple, bold) from the same page list.
- The bill QR holds `<public_base>/b/<invoice-id>.<hmac>` (as the repair status link, ADR in docs/35): nothing stored, cannot be guessed or edited. The page shows the bill and what is left on it, never the customer, the full IMEI, a cost or the khata balance. Without a public address the QR holds the bill number. A shop can switch it off (`print_prefs.qr`).
**Consequences**: a user who changes PCs picks their look again; production needs `PUBLIC_URL` (or an https `WEBAUTHN_ORIGINS`) for the QR to carry a link.

## ADR-051 · 2026-11-07 · Accepted · Extra cash given on a sale can go to the customer's old udhaar
- **Context:** A customer hands over Rs. 5,000 for a Rs. 2,000 bill. Usually the change goes back, but when he owes the shop from before, the shopkeeper wants to keep the extra against that.
- **Decision:**
  - `SaleCreate.khata_adjust` is the part of the cash given above the bill that is not returned.
  - It needs:
    - a chosen customer;
    - a fully paid bill;
    - cash given ≥ paid + adjust;
    - adjust ≤ what the customer owed before the sale (`party_balance`).
  - The sale posts, **in the same transaction**, an ordinary payment in from the customer (`create_payment(..., commit=False)`). It is allocated FIFO to their oldest open bills, the same as taking it on the khata screen.
  - The amount is kept on `invoices.khata_adjusted`. The receipt prints "Cash given", "Taken against old udhaar", and "Change" (= given − paid − adjusted).
  - A sale with no customer is labelled "Walk-in customer" (was "Cash customer") on screen and on the bill.
- **Consequences:** No new ledger type. The khata, statements, cash and reports see a normal payment in. Voiding the sale does not void that payment; void it from the payments list if needed.

