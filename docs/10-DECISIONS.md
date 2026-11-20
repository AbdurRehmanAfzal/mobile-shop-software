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

## ADR-120 · 2026-11-20 · Accepted · The FBR guide: what the shop brings, what it does, what we do — a public page in three languages

**Context**: the owner (2026-11-20): "FBR ke related bhi guide likh do — jo jo client ki taraf se humein chahiye FBR configure karne ke liye aur jo hum karenge, each step, taake layman bhi samajh jaye." Until now this lived in `docs/36` (research, for us) and in the "?" texts of the FBR card; nothing a shopkeeper or his tax adviser could be sent.

**Decision**
1. A page of the app, `/fbr-guide` (`FbrGuidePage.tsx`), open without a login, in English, Urdu and Roman Urdu, built like the printer guide (ADR-119): nine short sections — the short answer; what happens to a bill; **what we need from you** (NTN, STRN, the registered name / address / province, what the shop sells, the tax adviser's four confirmations, a token from IRIS) with an example for each and a red box of what is never asked for (the IRIS password; the token over WhatsApp); how the shop gets the token; **what we do, step by step** — eight steps, each tagged You / We / Together; what the shop sees afterwards; what to do when a bill waits or is turned down; what is not built yet; common questions.
2. A button "Open the FBR guide" at the top of the FBR card in Shop settings; the page is in the sitemap.
3. **Buttons are named as the app shows them in that language** (the Urdu guide says "بل FBR کو بھیجیں", not "Send bills to FBR") — one language at a time holds inside a guide too.
4. **It says what is not true yet**, because a client will act on it: the integration has never been run against a real FBR account (ADR-050's open items stand); sale returns are not sent as credit notes; POS integration (Tier-1, POS ID) is not built; repairs are provincial. And: it is not tax advice — rates, codes and who must issue digital invoices are the tax adviser's to confirm.
5. **The token is typed by the shop**, not sent to us — the guide puts that step on "You", in line with the card (write-only, never shown again).

**Not claimed**: the exact IRIS menu path for the token (it changes; the guide sends the reader to his adviser or FBR's helpline), a time to go live, or any fee.

**Consequences**: when the FBR card's labels, the open items of ADR-050 (returns, POS, a real sandbox run) or the list of what a shop must bring change, `fguide.*` changes in three languages in the same commit.

## ADR-119 · 2026-11-20 · Accepted · Printers in Shop settings (set up per device, with a test page) and a printer guide open to anyone

**Context**: the owner (2026-11-20): "shop setting mein printer connect ka option bhi daal do — Bluetooth ke sath USB ya Wi-Fi — sticker ke liye, 80 mm ke liye aur A4 wala bhi; aur jo printers ki guide banayi thi us ka button bhi shop setting mein … koi bhi person wo guide dekh sakta hai, easy to read, proper example ke sath taake lay man ko bhi samajh aaye." The guide of 2026-11-16 was a Roman-Urdu PDF in `docs/guides`, not reachable from the app.

**What "connect" can honestly mean here.** The app is a web page (and, on Android, the same page in a shell that prints through Chrome). It cannot pair with a printer or keep a connection to one: every print opens the phone's or computer's own print window and the printer is chosen there. Talking to a printer directly (Web Bluetooth / WebUSB with ESC/POS) would mean a second way of drawing every bill, sticker and report, would not work in most browsers, and was not built.

**Decision**
1. **Shop settings → Printers** (`PrintersCard.tsx`): three printers — sticker, receipt (80 mm), A4. For each the shop says how it is connected (USB cable / Wi-Fi-LAN / Bluetooth) and gets four numbered steps for *this kind of device* (computer or phone / tablet — guessed, changeable), a warning where that pair is known to be troublesome (a Bluetooth printer on Windows, a thermal printer over Wi-Fi from Android, OTG power), a **Test print**, and "Did it print right?" — Yes marks the printer Working with the date; No lists what to try.
2. **The test page is the server's** (`labels/printer_test.py`, `GET /labels/printer-test?kind=&size=`): a page of exactly that paper size (the sticker size chosen, an 80 mm slip, A4) with a frame along its edge, a millimetre ruler and a Code 128 barcode. Whole frame on the paper = the size is right; the scanner reads the barcode = stickers will scan. No shop data on it, nothing saved, any login of the shop.
3. **Kept on the device, not on the shop** (`localStorage`): a printer belongs to the phone or computer it is installed on; the counter laptop and the owner's phone set up their own. Nothing is written to the server, so no migration and no setting another shop could see.
4. **The printer guide** is a page of the app, `/printer-guide` (`PrinterGuidePage.tsx`), open without a login, in English, Urdu and Roman Urdu: the short answer, how printing works here, sticker sizes, the three ways to connect each with an example, phone or computer, setting it up in the software, what to do when it goes wrong, what to ask the seller. A button on the Printers card opens it; it is in the sitemap. It replaces the PDF as the place this is written.

**Honest limits**: the steps are general (Windows settings names, the RawBT app on Android) — no printer model was tested for this change; the facts come from the 2026-11-16 guide and the one shop's report of an MPT-II over RawBT. "Working" is the shopkeeper's own tick, not something the software can see. iPhone / iPad printing is described (AirPrint) but was not tried.

**Consequences**: a new kind of printed paper (e.g. a 58 mm receipt) is a `kind` in `printer_test.py`, a row in the card and its texts. Printer advice changes in `pguide.*` (three languages), not in a PDF.

## ADR-118 · 2026-11-20 · Accepted · A built-in list of accessories, and variants of one product (colour, length, size) as items of a group

**Context**: an accessories shop that sells in a shop and online (xcessorieshub.com, Lahore — 3,114 products, about 40% with variants, mobile + laptop + gadget accessories) asked for the software for its shop only (no WooCommerce sync, no courier / COD yet). Their two conditions: "accessories mein bohat cheezein built-in honi chahiyein — sirf search kar ke select kar ke stock mein add ho jayein", and "variants bhi built-in hon; built-in na hon to khud add kar sakein". docs/40 §4 already listed variants as the biggest gap; until now every colour was an unrelated item written by hand.

**Decision**
1. **A variant is an ordinary item.** Two nullable columns on `accessories` (migration `b4d6f8a0c2e4`): `variant_group` (which items are kinds of one product) and `variant` (this one's label: "Black", "2m"). Each variant keeps its own stock, batches, cost, SKU, barcode, price and sticker, so `stock.py`, purchases, sales, returns, transfers, reports and the books are untouched — they already work per item. Existing items keep NULL and stand alone.
2. **Made together, all or none.** `POST /accessories/with-variants` = the item card + `variant_by` (colour / size / other) + the variants (label, opening quantity, optional own price and cost). The server makes one item per variant by calling the existing `service.create` (now with `commit=False`) inside one transaction: SKU, barcode, opening stock and its posting exactly as for a single item. The label is also written to `color` or `size`, so the old filters and the duplicate warning keep working. A SKU / barcode typed for the product is dropped (it cannot belong to every variant).
3. **Added later.** `POST /accessories/{id}/variants` copies the item's card (never its stock or codes) into new variants; an item that stood alone becomes the first of its group, labelled by its colour or size. The same label twice is refused (`variant_exists`). `GET /accessories/{id}/variants` lists the kinds.
4. **The built-in list is data in code, not rows.** `seeds/accessory_library.py`: 185 kinds of product (chargers, cables, power banks, audio, watches, holders, memory, computer and laptop goods, networking, cameras, personal care, parts) written once and once per brand usual in Pakistan — 2,480 lines — each with its kind, what it is for, usual details (watts, connector, capacity) and usual variants. `accessories/library.py` searches it in memory (every word must match) and, from the same words, makes "Back Cover / Tempered Glass / Battery / LCD … for <model>" and "Laptop Charger / Battery / Keyboard / Screen for <laptop model>" on the fly from the catalogue's models. `GET /accessories/library?q=` is read-only; `have` says how many of the shop's items already carry that name. No table, no migration, no per-shop copy.
5. **In the app** (`ItemVariants.tsx`): the new-item form shows matching lines under the name ("From the built-in list"); a tap fills name, kind, brand, details and offers the usual variants. "Colours or sizes you keep": chips to tick, "Add your own", a count per variant. An item's page has "Kinds of this item" with the stock of each and "Add another colour or size". Lists and the sale / purchase picker show the variant as a chip; the search finds it.
6. **Laptop model names in the list.** ADR-108 hides laptop brands and models from a shop without the laptops module; the built-in list still offers "Laptop Charger for HP …" to an accessories shop, because that is what it sells. Only the name is used — no laptop device, brand or model becomes selectable.

**Not done (said to the shop as "later")**: WooCommerce sync; courier / COD; one screen that shows a product's variants as a grid with a combined total (they are separate rows with a chip); two attributes at once as a matrix (colour × length is written as a label, "Black 2m"); sub-categories; product pictures; quantity-tier prices (docs/40 §4).

**Honest limits of the list**: the lines are kinds of product per brand ("Anker 20W USB-C Charger"), not makers' model numbers, and were written from general knowledge of the market, not from a supplier's price list — the shop corrects the name before saving. It grows by adding lines to the seed file.

**Consequences**: anything that lists items may show `variant`; anything that makes items in bulk (Excel import) still makes single items. A change to `service.create` reaches variants too, since they are made by it.

## ADR-117 · 2026-11-20 · Accepted · The shop's own price code on stickers: signs for digits, lakh / thousand / hundred, prefix and postfix; for cost and for the asking price

**Context**: shopkeepers (2026-11-20): each shop has its own "price keywords" — 1 = A, 2 = B … 9 = I, 0 = Z, lakh L, thousand T, hundred H, something before and after — and wants to print the cost and the asking price on a sticker in it, with a setting of its own. Their example: 285,000 → `##BHEL@@` (## prefix, 285 = BHE, L because the price is in lakhs, @@ postfix). Until now a sticker had only the "cost code": the cost spelled with a 10-letter word (BLACKHORSE), no units, no affixes, cost only.

**Decision**
1. **The pattern** is `shops.price_code` (one nullable JSON column, migration `a3c5e7f9b1d2`): `digits` (ten signs for 0-9, one character each, all different), `lakh` / `thousand` / `hundred` (one character or empty, different from each other), `prefix` / `postfix` (up to 8 characters), `style`. `labels/pricecode.py` validates (`clean`) and encodes (`encode`). NULL = the shop keeps its code word; nothing changes for an existing shop.
2. **Three styles**, because the shopkeepers' own rule loses information:
   - `short` (the default, their example): the digits without the zeros at the end, then the sign of the price's size — 285,000 → BHE L, 45,000 → DE T, 950 → IE H. Short, but 2,500 and 25,000 read the same; the settings page says so.
   - `exact`: each part with its sign, as the price is spoken — 285,500 → B L · HE T · E H. Two different prices never share a code (tested).
   - `digits`: every digit, zeros too.
   A unit sign left empty falls to the next one down (no lakh sign → 285 thousand); with none, every digit is written.
3. **A unit may use a digit's sign.** Their example has 8 = H and hundred = H; refusing it would refuse the pattern they already use. It is allowed and the page says "Used for a digit and for a size too: H".
4. **On the sticker**: the existing tick `code` ("Cost in code") now prints in the pattern when the shop has one, else in the code word as before; a new tick `pcode` ("Asking price in code") prints the asking price the same way, beside or instead of the plain price. Both for phones and for items. An old app never asks for `pcode`, so its stickers do not change (ADR-106's rule).
5. **Who sees it**: a price in code gives the pattern away to anyone who also knows the price, and the pattern reads the cost off every sticker. So `pcode` and `code` are printed only with `VIEW_COST` (owner, manager), `GET /shops/current` blanks `price_code` for other logins, and the preview route needs `MANAGE_SETTINGS`. (The 10-letter word is still sent to every login as before — not changed here.)
6. **The app never encodes a price.** The settings card (`PriceCodeCard.tsx`) shows "How your prices will look" from `POST /labels/price-code/preview`, which runs the same `encode` that prints the sticker and saves nothing.

**Not done**: a different pattern for cost and for asking (one pattern, two ticks); decoding a code back into a price in the app; the code on the phone's slip / A4 page (ADR-114) or on bills.

**Consequences**: a new place that prints a coded price must call `labels.service.shop_code` (pattern, else word), never `cost_code` directly. A change to the pattern's fields changes `pricecode.clean`, `PriceCodeCard` and the help texts together.

## ADR-116 · 2026-11-20 · Accepted · "Add old dealing" asks one question at a time, and picks what went like a purchase

**Context**: the owner (2026-11-20, with a screenshot of the ADR-110 form): shopkeepers find the two rows of choices on one screen hard. His suggestion: a step-by-step flow — first "they owe me / I owe them", then "write what went / only the amount", then, for goods, the purchase's own way of choosing (mobile, tablet, watch, laptop, accessories → brand → model → pieces → rate each, "add another item"), then already paid, still left, date, note, save. "Is ko apnay according better kr lyna."

**Decision**
1. `OldDealingWizard.tsx` replaces the one-screen sheet with four steps under the usual `Stepper`: **who owes** (two large answers with a line of explanation and, in English, a Roman Urdu `Say` line) → **goods or amount** (the question follows the first answer: "What did you give them?" / "What did you take from them?") → **what went** → **paid and left**. Tapping an answer moves on; Back keeps everything written.
2. **What went**: the type first — the types this shop trades (`useTrade`: mobile / tablet / watch, laptop with its module, accessory) plus "Something else" always — then, for a device, the brand chips and the model search of the purchase form; "Not in the list? Write the name" turns it into a typed name. An accessory or "something else" is a typed name. Then pieces and rate; "Add to the list" puts the line in the list with its total. Next takes a finished item along, and is refused while an item is half written.
3. **Nothing changes on the server or in the books** (ADR-110 stands): what is sent is still `items[{description, qty, rate}]` — the description is "Brand Model" — or `amount`; the server's sum is what is saved. No device row, no IMEI, no stock; the wizard does not add brands or models to the catalogue (so no `QuickAdd` here).
4. The "already paid" field is named by the first answer ("Already received from them" / "Already paid to them") with a hint that it may stay empty.

**Not done**: storage / colour per line (a balance does not need them); a promise date for the old balance (len-den has `due_date`; an old balance has none — would need a column, ask first).

**Consequences**: a change to how the purchase form picks a brand or model should be mirrored here by hand (the pickers are small and were not extracted, to leave `DeviceLineSheet` untouched). `e2e/old-dealings-bulk.spec.ts` walks the four steps, both ways of naming an item, Back, and 320 px.

## ADR-115 · 2026-11-20 · Accepted · The provider's control room at `/control`; the landing page for accessories and laptop shops, with an address and an HTML head per kind of shop

**Context**: the owner (2026-11-20): (1) "super admin ka ak alg say url hona chye jis may only software ko control kiye jaye" — the provider's screens sat inside a shop's app (`/admin`, reached through More), with the shop's counter, menu and search around them. (2) The landing page still described the product of 2026-11-16: nothing about accessories-only shops (ADR-109), laptops (ADR-108), the reports list (ADR-111), old dealings and several pieces (ADR-110), numbers of any country (ADR-107), the phone's slip / A4 page (ADR-114); "SEO, AEO, GEO ko dakhtay ho info add krna so google pr rank krainy r hm ko orders hn".

**Decision**
1. **`/control`** is the provider's own address with its own frame (`ControlShell`): title, the provider's name, language, logout, two tabs (Shops and plans → `AdminPage`, Business → `ProviderPage` at `/control/business`) and a link into the shop app. It sits outside the shop `Shell`: no counter search, no shop menu, no plan reminders. `/admin` and `/admin/business` redirect there, so old links and bookmarks keep working. Not logged in → the login, and back to `/control…` after it (the path is kept in `sessionStorage`, only a `/control` path is honoured, a logout from the control room is not remembered). A login that is not the provider's sees "Only for the software provider". Nothing changed on the server: `is_superuser` is still checked on every admin request — the frame only separates the two for the eye. `robots.txt` disallows `/control` and `/admin`.
2. **A separate domain** (e.g. `control.…`) was not built: it is DNS + Traefik on the owner's server and would need the login shared across two origins. `/control` works on the present domain today; the sub-domain is listed in docs/29 as an option.
3. **Landing page**: twelve new cards on top of "What came in the last round" (accessories-only shops, laptops, every report in one list, old dealings without IMEIs, several pieces at once, numbers of any country, the phone's slip / A4 page, the IMEI sticker, amanat to anyone, returns report, general ledger and trial balance, buttons that say what they do); "who it is for" grows from three cards to six (accessories shops, laptop shops, dealers and wholesalers); six new questions in the FAQ; hero badge, sub-line, title and description name mobiles, laptops and accessories.
4. **An address per kind of shop** (`landing/topics.ts`): `/accessories-shop-software`, `/laptop-shop-software`, `/used-mobile-shop-software`. Each is the same landing page with that shop's h1, sub-line, a question answered first and four points (`landing.topic.<key>.*`, three languages), linked from the "who it is for" cards and the footer. The page sets its own title, description, canonical address and link-preview tags while it is open.
5. **A real HTML head per address** (`frontend/seo-pages.ts`, a build step): crawlers and answer engines that do not run JavaScript would otherwise get `index.html` with the canonical address of `/welcome` for every address. The build writes `dist/<slug>.html` — `index.html` with that page's title, description, canonical, og / twitter tags, a `WebPage` JSON-LD entry carrying the question and its answer, and its own `<noscript>` text — and Caddy serves it for that address (`try_files {path} {path}.html /index.html`). The texts are the app's English strings, not a second copy; a tag the step cannot find stops the build. Not in the Android build.
6. **`index.html`, `llms.txt`, `sitemap.xml`**: description, keywords, `featureList` and six more `FAQPage` questions (accessories-only shop, laptop shop software, which reports, old dealings, several phones at once, foreign numbers); `<noscript>` lists who it is made for with links; `llms.txt` gains "Who it is for", the new modules and questions; the sitemap lists the four addresses.

**Not done / honest limits**: ranking is not something code can promise — it needs Google Search Console (submit the sitemap), a Google Business Profile, and links from oopsolutions.com and elsewhere (docs/29). No new screenshots were taken: the new cards reuse existing screens or show none. The app is still a single-page app; a full pre-render of the page body was not built — the `<noscript>` text and structured data carry the content for readers without JavaScript.

**Consequences**: a new kind-of-shop page is one line in `topics.ts`, its `landing.topic.<key>` strings in three languages, a line in `sitemap.xml` / `robots.txt` / the Caddyfile's `@fresh` (`seo.test.ts` checks the first three). A new provider screen is a child route of `/control` and a tab in `ControlShell`.

## ADR-114 · 2026-11-20 · Accepted · A phone's page: a details table, and its printed details as an 80 mm slip or an A4 page
**Context**: shopkeepers said that on a phone's page several values (colour, IMEI 2 and others) have no edit beside them; they want one "edit everything" at the top that opens the purchase form; they could not tell the Smart / Tabs / Tiles / Compact styles apart and want them replaced by an 80 mm thermal preview and an A4 preview of the phone's details, with the lines ticked like the sticker, to print, download and share; IMEI 2, the accessories and the money on the phone belong with the other details; they dislike the coloured "Bought from" card and the tinted backgrounds, and asked for a table: icon, name, value, action button, small info button.

**Decision**:
- **Three views** (`DeviceLayouts.tsx`): Details · 80 mm slip · A4 page. Smart, Tabs, Tiles and Compact are removed; a style saved before opens as Details.
- **Details is one table** (`DeviceEasyView.tsx`): bands Identity, Details, Money on this phone, People, Accessories; each line = icon + name | value | action + "?". Every line is always shown — an unwritten one says "—" with Add / Edit — so nothing is without a way to change it. A line with a job of its own keeps it (Correct IMEI, Change price, Correct cost, PTA check, Mark faulty, lock check, ID check, Change dealer / customer); every other line's Edit opens the whole form, and so does "Edit all details" at the top. The money tiles and the accessories chips became lines of the table (the money figures are still the server's `/devices/{id}/money`).
- **The bought / sold cards are calm**: white, a coloured edge, grey inner tiles, a filled pay / receive button.
- **Printed details** (`devices/sheet.py`, `GET /devices/{id}/sheet?format=thermal|a4&fields=…`, `GET /devices/sheet-options`): the shop's header (`profile.header_html`), the phone's name, price, the lines ticked, the barcode (the IMEI when it has one, ADR-106). Read-only — it writes no event. Cost and "Bought from" only with `VIEW_COST`. The app's preview (`DeviceSheetPreview.tsx`) is this page in a frame, so what is seen is what prints; print, PDF download and share use the existing document actions; the ticks are kept per format on the device.

**Consequences**: one page to maintain instead of five layouts. The printed details are a slip about the phone, not a bill — a sale's bill is still the receipt on the sale. Editing what came with a phone (accessories) is still done at purchase or sale, not from this table.

## ADR-113 · 2026-11-19 · Accepted · The money buttons look like buttons: `ActionButton`
**Context**: after ADR-112 the four money buttons on a person's page carried a line of explanation, and shopkeepers said they could no longer tell that they were to be tapped: with two lines of text, a thin border and a white fill they read as notes.

**Decision**: one component, `components/ActionButton.tsx`, for a big action with an explanation — a filled colour, an icon in its own well at the start, the name in bold with its `Say` line, a round arrow at the end, a shadow that lifts it off the page and a press-down on tap; the "?" in the top corner, outside the button. Tones: `get` (emerald, money received), `give` (ink, money paid), `out` (red tint, gave with no bill), `in` (amber tint, took with no bill). One per row on a phone, two per row from the laptop width; checked at 320, 412 and 1280 px.

**Consequences**: an action that needs a line of explanation uses `ActionButton`, not a plain bordered button with more text in it.

## ADR-112 · 2026-11-19 · Accepted · A line under a confusing button says what it is for — Roman Urdu under English
**Context**: shopkeepers said the four money buttons on a person's page confuse them: "Money received", "Money paid", "I gave money", "I took money". The first pair is money against bills (udhaar being paid back), the second pair is money with no bill (len-den) — the names did not say so, and most users do not read English natively. The owner asked for one line under each button in the shopkeeper's words, and the same wherever a button or heading can be misread, in Roman Urdu beside the English.

**Decision**:
- **`Say`** (`components/Say.tsx`): a small line under a button, or under a heading, that says what it is for. The texts are the `say.*` keys. **In English mode the line is Roman Urdu**; in Urdu and Roman Urdu it is in that language. A heading that already carries a hint in the app's language gets its `Say` line only in English mode (`englishOnly`).
- This widens the one exception to "one language at a time" (ADR-094 allowed a short Roman hint in brackets after an English money word): an English button or heading about money may also carry one Roman Urdu line beneath it. Nothing else changes — Urdu mode stays only Urdu, Roman only Roman.
- **Applied to**: Money received / Money paid on a person's page (full line) and on the udhaar khata (short line); the two len-den buttons; the len-den heading, "Adjust against bills", and the Old balance heading (English mode); the top of the payment form, which repeats the line of the button that opened it.
- **The two len-den buttons are renamed** "Gave money, no bill" / "Took money, no bill" (ur: بغیر بل پیسے دیے / لیے; roman: Baghair bill paise diye / liye). Not "lent / borrowed": the same button also records the loan coming back, so the line says both ("udhaar diya, ya is se liya hua udhaar wapas kiya").

**Consequences**: the person page's money buttons are one per row on a narrow phone (two per row from 480 px). A new confusing action gets a `say.*` key in three files (en = Roman Urdu) rather than a longer button name.

## ADR-111 · 2026-11-19 · Accepted · Reports: one list of every report, the daily ones first
**Context**: shopkeepers coming from other software expect every report under "Reports". Here the reports had grown with their modules: the stock tally on the stock worth page, the khata on its own tab, the hisaab on another, accessory reports under Accessories, a dozen sections under Shop audit, the profit tabs under Reports. The owner asked for all of them reachable from the Reports module through a clear screen, with the reports wanted every day (stock tally, udhaar, sales, purchases, len-den) apart from the general ones.

**Decision**:
- **`/reports` is now a list of every report and sheet** (`ReportsHub`, drawn from `features/reports/catalog.ts` — 45 entries). "Every day" first, as tiles (hisaab, stock tally, udhaar khata, sales bills, purchases, len-den, cash and bank, expenses, returns); then by subject (sales and profit, stock, udhaar and people, money and accounts, staff and security). A search box filters by name; one date picker feeds the downloads and the screens that take dates; a row with an export gets compact download / share buttons.
- **No report was moved, copied or recomputed.** Each entry only says where the report lives, which module and role it needs, and its export if it has one. The old places keep working.
- **Everyone may open the list; each person sees what he may open** (`reportsFor`): module, owner / manager, owner-only, more-than-one-shop, and "keeps phones or laptops" (ADR-109). So `/reports` is no longer behind the `reports` module — a basic-plan shop gets its daily reports there — while the profit tabs moved to `/reports?tab=…` and gate themselves. Links that meant "profit" now say `?tab=profit`.
- A unit test keeps the list honest: every entry has its name and line in three languages, opens a route the router has, and the role / module / shop rules give the expected set.

**Consequences**: a new report must be added to the catalogue (the test fails on a name without an entry, not on a missing entry — a reviewer's job). Found while testing and fixed: the khata header's five buttons overflowed a 320 px phone; they wrap now, and the layout test waits for them before measuring. Still open: the Urdu-only test reports the Latin "CP" of "CP ID" on the settings page (older than this change).

## ADR-110 · 2026-11-19 · Accepted · Old dealings on the khata without IMEIs; several pieces of one model at once
**Context**: shops and dealers starting the software asked (1) how to enter what they gave to other shops and customers before — so many pieces of each model, part paid, IMEIs forgotten, sometimes money they owe — and (2) to enter several phones of one model together at a purchase, and sell several together. Plan: `docs/41-OLD-DEALINGS-AND-BULK-ENTRY-PLAN.md`.

**Decision**:
- **An old dealing is a balance, not stock.** It is entered on the person's page ("Old balance") as the amount still open, or as lines of what went (what · pieces · rate) with what was already settled; the server adds the lines and posts what is left through the existing `opening_balance` entry (the person's khata against the owner's capital). No device, stock, sale or profit is created — those phones left before the software, so their IMEIs are not needed. The lines are kept as words on the khata entry. The route gained `items`, `settled`, `as_of`; a list (`GET …/opening-balances`) and an undo (`POST /ledger/opening-balances/{group}/undo`, a reversing entry, only for this kind of entry, with a reason). No migration.
- **Several pieces of the same at a purchase / in old stock**: a switch in the add-device form; details once, then an IMEI (or serial number) per piece; the line expands to one line per piece in the app (`expandDraft`). The server and the device model are unchanged — every piece is its own unit with its own barcode and history, and every IMEI is checked again on save. IMEI 2 and an own barcode are not asked in this mode.
- **Several of one model on a sale**: "Pick several" (tick and add together) and "one price for all" of a model; each phone stays its own bill line, so cost and profit per phone are unchanged.

**Consequences**: the old-balance card is for owner and manager (the permission the route had). The app shows a running total of an old dealing while typing; the saved figure is the server's. Not built: old dealings with lines from Excel, a printed confirmation, pasting a column of IMEIs, several pieces in the exchange form.

## ADR-109 · 2026-11-19 · Accepted · What a shop trades: accessories-only and laptop-only shops by one switch
**Context**: three or four shops asked for the software for accessories alone; the owner's brief ("Accessories Business Mode", audited in `docs/40-ACCESSORIES-MODE-AUDIT.md`) asks for accessories-only, mobile + accessories and wholesale businesses inside the existing software, configured in the existing Super Admin, with live shops untouched. The audit found the foundation in place — two tracking strategies (units and counted items), branches with transfers, one ledger, retail and wholesale prices, modules per shop. The one thing missing for "accessories alone" was a way to say that a shop does not trade mobiles: the mobile side was the always-on basis of the app.

**Decision**:
- **One more tick in the existing module list: `no_mobiles`** ("Without mobiles — accessories / laptops only"), opt-in like `laptops` and `login_activity` (never in a plan). No new column, table, settings screen or migration. `admin/modules.lines(org)` derives what the shop trades: mobiles unless `no_mobiles`, laptops and accessories by their modules. It is absent for every existing shop, whatever its plan or hand-picked list, so their mobile side cannot change.
- **Server**: without mobiles, `new_device` refuses a phone / tablet / watch (`module_off`, module `mobiles`); "without mobiles" needs accessories or laptops (`no_business_line`). Existing phones of such a shop stay and can be sold — nothing is deleted or blocked on reading.
- **A package order keeps the provider's switches** (`plan/order.apply`): OPT_IN keys in force are carried into the new module list. Before, buying another package reset the list to the package and would have turned an accessories-only shop back into a mobile shop (and dropped laptops / login activity).
- **App** (`useTrade`): a shop with no phones and no laptops opens its items where a mobile shop opens its phones (Stock tab, Stock job, home search and glance), has no device, locked phone or walk-in purchase on Add stock, starts Sell on the items and is not offered the phone-only tiles; a shop without mobiles sees only the device types it trades and "stock" wording instead of "phone".
- The rest of the brief is listed with phases in docs/40 §4 (accessories "made for" a device type, variants, quantity tiers and selling by box, customer prices, transfers with in-transit, consolidated reports, purchase orders, an accessories dashboard).

**Consequences**: the name `no_mobiles` reads as a negative among positive modules; it is shown with a clear label and was chosen because a positive `mobiles` key would have had to be added to every existing shop's stored list. A few deeper screens still say "phone" for an accessories-only shop.

## ADR-108 · 2026-11-18 · Accepted · Laptops as a fourth device type, behind an opt-in module
**Context**: shopkeepers who also trade laptops (new and used, retail and wholesale) asked for them in the software. The owner asked for research and a plan first (`docs/39-LAPTOPS-PLAN.md`), the laptop on the purchase form like a mobile, shown only to shops that ask, common details first, and every brand and model (gaming too) built in.

**Decision**:
- **`devices.category = "laptop"`** — the device type of ADR-038 gets a fourth value; no new table, no copied screen, no migration. Purchases, stock, sales, returns, exchange, amanat, repairs, transfers, the ledger and every report work on it as on a phone.
- **Module `laptops`, opt-in** (like `login_activity`: never in a plan; the provider switches it on per shop). Without it a shop sees nothing new — no type, no tab, no laptop-only brand (Dell, HP …) or laptop model in any list — and adding a laptop is refused with `module_off`. Switched off later, laptops in stock stay and can be sold.
- **Identity is the serial number / service tag** (in `imei1`, as for every serial-only unit); when the sticker is gone the unit gets the shop's own code `LAP…`. IMEI 2, PTA, SIM time, SIM type / lock and region code are dropped on the server.
- **Spec sheet**: RAM and storage stay columns (RAM up to 256 GB); processor, generation, graphics, drive type, second drive, screen, touch, x360, backlit, gaming, battery backup are `specs` keys. The app asks the common ones in the main form and the rest under "More details". One line names a laptop everywhere (`types.laptop_line` on the bill and sticker, `laptopLine` in the app).
- **Catalogue**: 15 laptop brands and 1,143 models (228 gaming, marked so the form ticks "Gaming") seeded at start (`seeds/laptops.py`); storages 2TB / 4TB. A brand that makes only laptops is hidden from the phone list always, and from "all brands" for a shop without the module.
- **No ID check for a laptop** (the check is built on the IMEI — e-Gadget, PTA); a laptop is never held back from sale for it. Lock checks of a used laptop (BIOS password, activation lock, company lock) follow the shop's own "lock check for used" setting; a lock marked not cleared blocks the sale.
- **A laptop is never reclassified** to or from another type (`CATEGORIES` stays phone / tablet / watch for that tool and for the model-library CSV).

**Consequences**: shops without the module are unchanged (tested). Open for the owner (docs/39 §4, docs/29): a stored wholesale price per laptop, an ID check for laptops bought from walk-in people, laptops in the Excel import, a price for the module.

## ADR-107 · 2026-11-18 · Accepted · Mobile numbers of any country
**Context**: shopkeepers complained that only a Pakistani mobile number can be written, while their customers and dealers also come from other countries (the Gulf, the UK, Afghanistan, China …). Every mobile-number box showed a fixed +92 and the server refused anything that was not 03XXXXXXXXX.

**Decision**:
- **Storage: nothing existing changes.** A Pakistani number is stored as it always was — `03XXXXXXXXX` (logins, uniqueness, every saved row stay valid). A number of another country is stored with its country code — `+971501234567` (E.164; the 0 people write after the code is dropped). No migration; the columns are already wide enough.
- **One rule on the server** (`core/pk.normalise_phone`): Pakistani forms as before; otherwise `+<code>…` or `00<code>…` with a known country calling code (`DIAL_CODES`, the ITU list) and a sensible length — exact for the ~35 countries shops meet most (`NATIONAL_LEN`), 4–13 digits for the rest. `+92` must still be a Pakistani mobile. A foreign number without its code is refused (it cannot be told from a wrong Pakistani number). Every schema already used this one function, so parties, staff, sign-up, login, the guarantor, notification numbers, OTP, the shop request and the Excel import all accept it.
- **One input in the app** (`PhoneInput`): the code in front is a picker (a native list: country name and code, Pakistan first, then the countries shops meet most, then all others by name in the app's language via `Intl.DisplayNames`). For another country the box shows its name and how its numbers are written, stops at that country's length, and a whole number pasted with its code picks the country itself. The parent still gets one string (`03…` or `+…`). The table lives in `lib/phone.ts`; a server test reads that file and keeps it equal to the server's.
- **WhatsApp** links and Cloud-API messages use the number's own country code (`pk.wa_number`, `phone.waNumber`) instead of always putting 92 in front.

**Consequences**: Pakistan stays the default everywhere; a shop that never deals abroad sees only a small arrow beside +92. A CNIC stays Pakistani and optional. Landlines are still not accepted. Country names are not translated for Roman Urdu (English names are shown).

## ADR-106 · 2026-11-18 · Accepted · Amanat to anyone; sticker ticks for RAM / battery / serial; the IMEI as the sticker's barcode
**Context**: three requests from a shopkeeper. (1) Amanat (a phone given out on trust) was allowed only to a party of kind "shop", yet customers, dealers and technicians take phones the same way. (2) On a used iPhone the battery health and battery cycles sell the phone, and RAM and the serial number are wanted too — the shop should choose them for the sticker. (3) The sticker's barcode should be the IMEI, because the sticker is scanned where an IMEI is asked (buying a phone back); the shop's own code must stay available, since some units have no IMEI.

**Decision**:
- **Amanat to anyone.** The "must be a shop" rule is removed from `loans.create_loan` and from the device-event route. Nothing else changes: the loan, its events, return, cancel, and "they kept it" (a sale on that person's khata) work for any person of the shop. Both give-on-amanat forms use the people picker without a kind.
- **Four sticker ticks**: `ram`, `battery`, `cycles`, `serial`. RAM / battery health / cycles print on a line of their own (they used to ride on the "Storage · colour" line, which is cut off when long); the serial prints as `S/N …`. Each prints only when the phone has the value.
- **The bars are the IMEI when the phone has one** (`bar=imei`, the app's default), else the shop's own code; `bar=code` asks for the shop's code. `devices.barcode` is not touched — ADR-036's rule (assigned once, never changes) stands; only what the sticker prints is chosen. Both values already find the phone (`barcodes.lookup` matches barcode, IMEI 1, IMEI 2). A real IMEI is 15 digits (`imei1` may hold a serial or a made-up code for a unit without one). The IMEI prints as Code 128, or as QR when the shop's type is QR.
- **Old apps keep their sticker.** The new behaviour is asked for with `fv=2`; a request without it (an app not yet updated) gets the old "specs" line with RAM / battery / cycles and the shop's code in the bars. A label choice saved before this ADR keeps RAM / battery / cycles ticked when "Storage · colour" was ticked.

**Consequences**: no migration. Stickers already printed with the shop's code keep scanning. After the update a shop's new stickers carry the IMEI in the bars unless it chooses "Shop's own code" (remembered with the other label choices). Counted items (accessories) are unchanged. The short sticker (under 22 mm) takes the IMEI barcode but not the four new lines.

## ADR-105 · 2026-11-18 · Accepted · The "plan renewed" thank-you shows once
**Context**: a shopkeeper reported that after paying the fee, the "Thank you! Your plan is renewed" popup came back on every login. The server cleared it only when the app sent "seen" after the OK button, with the id of the payment it had shown. Closing the app, a reload, a failed request, or a manager (the route was owner-only, yet the popup shows to everyone who sees money) left it unmarked, so every later login showed it again — for ever, since nothing aged it out.

**Decision**:
- **Seen means shown.** The app tells the server as soon as the popup is on screen (`planReminder.refresh`), not when OK is tapped; OK sends it once more. The popup keeps its own copy of the payment, so a later refresh without `renewed` does not close it under the shopkeeper's finger.
- **The server marks the newest approved payment**, whatever id the app sent (`thanks_seen`): a stale id can no longer leave the newest one unmarked.
- **A thank-you is only for a fresh payment**: `renewed` is sent only while the payment was approved within `THANKS_DAYS` (3). An old payment never brings the popup back.
- **Whoever sees the popup can mark it** (`MANAGE_SETTINGS` or `VIEW_COST`), as the popup itself is shown to them.
- The reminder-state row is created race-safe (two requests at login could both insert it).

**Consequences**: no migration; shops that have the popup stuck today stop seeing it after the first login on the new version (payments older than three days at once, newer ones after one showing). A shopkeeper who pays and does not open the app for more than three days gets no thank-you — the fees page still shows the payment and its receipt.

## ADR-104 · 2026-11-18 · Accepted · Accounts & Reports: audit first, then only what is missing — phase 1
**Context**: the owner's brief asks for a complete Accounts and Reports module (19 accounts items, five report families, integrity rules, report UX), reusing what exists, in small phases, without disturbing live shops. It asks for an existing-versus-missing matrix before any code.

**Decision**:
- **The audit is `docs/38-ACCOUNTS-REPORTS-AUDIT.md`.** Most of the brief already exists: a double-entry append-only ledger, several money accounts with transfers, expenses with categories and receipts, khatas with allocations and advances, opening balances, day close, the audit trail, profit and loss, balance sheet, trial balance, cash flow, each account's book, ageing, and the Shop Audit's sales / purchases / stock / staff sections. No second accounting module is built.
- **Phase 1 (this ADR) — three read-only additions, no migration:**
  - **Chart of accounts** (`GET /reports/chart-of-accounts`): the trial balance's own lines with their balances.
  - **General ledger** (`GET /reports/general-ledger?account=&date_from=&date_to=`, export `GET /exports/general-ledger`): every line of one account for a period — balance before, debit, credit, running balance, totals, the document's number and the person. Everything ever posted is listed; a deleted entry and its reversal are both shown and marked. `receivable` / `payable` open the one sub-ledger of all khatas. The closing balance equals the chart's and the trial balance's figure for the account (a test walks every account). A request loads at most 5,000 lines and says so if the period has more.
  - **Accounts page** (`/accounts`): cash in hand, bank and wallets, to get, to give, and links to every accounts screen and report. A trial-balance line now opens its general ledger.
- **Phase 2 and 3** are listed in docs/38 §3 for the owner to order: other income with categories, recurring expenses, a consolidated view over branches, retail versus wholesale, a credit limit; later bank reconciliation and cost history by model.
- **Manual journal entries are not built** (docs/38 §4): a free journal would break "every figure traces to a document". An owner-only, reasoned adjustment limited to named accounts is offered as a decision.

**Consequences**: nothing existing changes. The general ledger shows raw ledger lines, so its wording is closer to an accountant's than the rest of the app; it sits behind Reports (owner / manager).

## ADR-103 · 2026-11-18 · Accepted · Account ledger and item-wise stock sheet
**Context**: a shopkeeper sent two printouts from his old software and asked for the same: an "Account Ledger" of one person (opening balance; each bill with its items — "Vivo X90 Pro 12/512 — 1 @ 90,000 = 90,000" — and each payment; debit, credit, running balance; totals) and a "Stock with Cost Price (Item Wise)" sheet (by brand, each model with quantity, unit price and cost; a total per brand and a grand total).

**What existed**: a person's statement export (date, memo, type, debit, credit, balance — no bill number, no items, no totals, and a deleted bill left a jump in the balance) and a stock-worth export (brand, model, count, value — no memory variant, no unit price, no totals lines).

**Decision** — two new reports beside the old ones, which are untouched (`exports/statements.py`; read-only, no migration):
- **`GET /exports/parties/{id}/ledger`** (`date_from`, `date_to`; pdf / xlsx / csv; en / ur): opening balance, then every ledger line of the person in date order with the document's number and, on the bill's first line, its items (sale and purchase lines as `model + RAM/memory — qty @ price = total`; a payment's method, reference and note; a return's lines). Debit, credit, running balance; totals, closing balance, and the balance in words.
  - A deleted bill (its ledger group reversed) and the reversal are both left out; they cancel, so the closing balance is still the person's real balance (asserted against `parties.balance`).
  - A balance where the shop owes is shown with "−", never in brackets (the house rule).
- **`GET /exports/stock-cost`**: the phones in hand (the stock screen's own rule, the same set as the stock-worth report) grouped by brand, then by model + memory: quantity, the average of one, the value; a total per brand and a grand total. At cost with `VIEW_COST`, at asking price otherwise ("Stock with Selling Price").
- Both print with the shop's own header and footer (`profile.header_html / footer_html`, ADR-040).
- App: an "Account ledger" card with From / To on the person's page; an "Item-wise stock sheet" card on the stock-worth page.

**Limits**: counted items (accessories) are not on the stock sheet — it lists phones, tablets and watches, like the stock-worth report it sits beside; the ledger has no "company / branch" column (one khata belongs to one shop).

## ADR-102 · 2026-11-18 · Accepted · The impact preview: the server runs the posting and rolls it back
**Context**: the owner's second brief (IMEI-level inventory and full accounting integration) asks, as mandatory, that no return or undo be posted before the user has seen and confirmed its effect on stock, cash, the khata and the accounts — worked out by the backend with the posting's own logic, never by the app — plus IMEI integrity, statuses, concurrency protection and reconciliation tests. Live shops must not be disturbed.

**Audit against the brief** (what the system already is — nothing here was rebuilt):
- **Per-IMEI inventory**: one `devices` row per unit, never duplicated; a return puts the same row back. Every movement is an immutable `device_events` row (purchase, sale, return, …) carrying the document it came from, numbered per device with a unique constraint.
- **Double-entry ledger**: every document posts one balanced `ledger_group`; undo posts a reversing group linked both ways (`reverses_group_id` / `reversed_by_group_id`). Balances are derived; `parties.balance` is a cache of the ledger.
- **Statuses**: in stock, sold, faulty, returned to supplier, on loan, at repair, with a customer for approval, transferred, used for parts — a state machine refuses an invalid move. The brief's "Damaged" and "Under inspection" are both the existing **Faulty** (ADR-101: a damaged return goes there and is cleared after it is checked). A new status was **not** added: it would touch every stock filter, report and transition of a live system for no gain.
- **Wrong kind**: a customer's return can only be made from a sale bill line, so a never-sold phone cannot be "returned by a customer". A sold phone cannot go back to the seller.

**Decision — what was added** (no migration, no change to how anything is posted):
- **`returns/preview.py`**: the preview calls the very function that posts (`sale_return`, `purchase_return`, `void_return`, or undo + re-entry for a correction) with `commit=False`, reads what it changed — the new ledger lines (caught on flush), the phones' statuses, the cash accounts, the khata — and **rolls the transaction back**. It cannot disagree with the posting, and it writes nothing (not a return, a ledger line, an event or a return number; tests assert it).
  - Routes: `POST /returns/sale/preview`, `POST /returns/purchase/preview`, `GET /returns/{id}/void-preview`, `POST /returns/{id}/replace/preview`.
  - Everyone gets the plain impact (phones in / out, cash by account, the khata before → after, the cut). Cost, stock value, sales taken back, cost put back, the profit effect and the journal lines only with `VIEW_COST`.
  - A phone that is not in the shop makes the purchase-return preview answer `ok: false` with where it is (sold: the bill and the customer) instead of an impact.
- **Stale preview**: the preview returns a `token`, a fingerprint of what it looked at (the bill, its lines, the phones' status and last movement, the khata, the amounts). A confirm that carries the token is refused with `preview_stale` when the fingerprint no longer matches; the app shows a fresh preview and asks again. The token is optional, so older clients and the existing API calls work unchanged.
- **Row locks**: returns and undo lock the bill and its phones (`SELECT … FOR UPDATE` on PostgreSQL; SQLite on the one-PC install has a single writer). Two people returning the same phone at once: the second waits and is refused as "already returned". The unique `(device_id, seq)` on events remains the last line of defence for every other pair of postings.
- **App**: `ReturnPreview.tsx` (one component, server figures only) in the customer's return, the return to the seller (a new "check" step) and the undo sheet; "Confirm return" / "Go back / change".
- **Reconciliation tests** (`tests/test_returns_preview.py`): every ledger group balanced; each phone's status equals its last movement; a returned phone is the same row; stock at cost equals the phones in the shop at their bill cost; each khata and the galla equal the sum of their ledger lines; profit after returns, cuts and a supplier's cut; an undone return out of the totals but on record with its reversal linked; undo restores the exact earlier state.

**Not done / limits**: no "Under inspection" status (Faulty is used); the preview is for returns and their undo, not yet for deleting a sale or a purchase (those have the "first do this" check, ADR-100); a sale itself does not take the row lock (it relies on the event constraint).

## ADR-101 · 2026-11-17 · Accepted · Return Sale / Return Purchase audit: condition, confirm, correct, undo
**Context**: the owner sent a ten-phase brief to audit and improve sale returns and purchase returns on a system that live shops already use: correct accounting, a safe undo, editing, the wrong kind of return corrected, an easy form with a confirmation, damaged stock kept apart, twenty test scenarios, and nothing existing disturbed.

**Audit — what the code already did** (each now pinned by a test in `tests/test_returns_audit.py`):
- **Sale return**: debits `sales` (net) and `tax_payable`, debits `inventory` / credits `cogs` at the line's own cost (a phone is specific-item cost; a counted item re-enters its batches at the sold cost), credits the customer's khata with the value, then cash handed back and the shop's cut (`other_income`) are debited from the khata. The purchase and its cost are never touched.
- **Purchase return**: credits `inventory` at the line's cost (a counted item leaves FIFO), debits the supplier's khata; cash moves only for what is really handed back; the seller's cut is a cost. Full and partial (by line).
- **Undo** (ADR-090): reverses the ledger group, puts the phone back (sold again / in stock again), restores the bill; the return stays as Deleted with who and why; a second undo is refused; refused once the phone moved on.
- **Guards**: a line cannot be returned twice; a line of another bill is refused; every read and write is by `shop_id`; undo needs the owner / manager.
- **The brief's example**: 65,000 cost, sold 70,000, 68,000 handed back, 2,000 kept. The brief asks for "net profit 7,000". The books show **2,000 after the return**: the sale is reversed, so its 5,000 margin is reversed with it, and the 2,000 kept is income. The phone is back in stock at 65,000, and **when it is sold again for 70,000 the total is 5,000 + 2,000 = 7,000**. Showing 7,000 while the phone sits unsold in stock would count a profit that has not been earned, so this was not changed; the test asserts both figures.

**What was missing, and the decision** (all additive; migration `e2a4c6b8d0f3` adds three nullable columns to `returns`):
- **Condition**: `item_condition` ok / damaged. A damaged phone returns at its cost and is marked Faulty in the same transaction (no money on that event), so it is not sold as sound stock by mistake; its return can still be undone.
- **When it was undone**: `voided_at` beside the existing who / why.
- **Correcting in one step**: `POST /returns/{id}/replace` undoes the wrong return and enters the right one — a customer's return or a return to the seller — in **one database transaction** (both or neither); the new one carries `replaces_id`. A new return may also name a wrong one already undone (`replaces_id`). `PATCH /returns/{id}` corrects the reason / note only. Owner / manager.
- **Confirm before saving**: the return form shows a summary (phone, IMEI, cost for those who may see it, sold for, handed back, cut, khata, stock change, galla change) with Confirm / Cancel. The undo sheet lists what it puts back.
- **Wrong kind**: after an undo the report offers "Customer's return" / "Return to the seller".
- **No double posting**: a return to the seller now takes an `Idempotency-Key` like a customer's return.

**Not changed, on purpose**: no existing return, ledger entry, cost or stock figure is rewritten; existing API fields and routes are unchanged (new fields are optional); nothing is recalculated.

**Limits**: a line is returned whole (5 covers on one line come back together, not 2 of 5); a return to the seller is corrected through the API or by undo and re-entry — the app's one-step correction form is for customers' returns; the damaged flag applies to phones (counted items go back to stock).

## ADR-100 · 2026-11-17 · Accepted · The delete sheet says what must be undone first
**Context**: shopkeepers want a wrong purchase, return, sale, payment or expense deleted with one tap and a warning, and — when something must be undone first — to be told what ("the phone is at repair"). The owner asked whether deleting should undo everything by itself, and whether the system already does.

**What already happens** (ADR-090): deleting an entry reverses that entry's own effect — stock, galla and the person's khata — and keeps it as Deleted. Things done later as separate entries (a payment against the bill, a loan, a repair, the phone sold on) are never deleted along with it; the delete is refused. The refusal only showed after Confirm, and for a phone it only said "has moved … use a return instead".

**Decision**:
- **Keep that rule.** An entry's own effect is undone automatically; later, separate entries are not cascaded. One tap must never remove things the shopkeeper did not look at.
- **Say it beforehand**: `GET /api/v1/delete-check/{kind}/{id}` (`delcheck/service.py`) returns `{ok, blockers: [{code, to, phone, who, ref, amount}]}`. `DeleteBlockers.tsx` shows them at the top of every bill's delete sheet as "First do this", each with an Open button.
  - Purchase: phone at repair / on loan / with a customer to look at / sold on / reserved / already returned / went out and came back; a later payment; part of an exchange.
  - Sale: a later payment, a return, len-den adjusted against it, installments, an exchange, the phone no longer as sold.
  - Return: the phone moved on (sold again shows the bill).
  - Repair: already given back; a lab charge booked.
  - Payment, len-den, expense, exchange: no rule here; their own delete speaks.
- **Read-only and harmless to shops already running**: no migration, nothing stored, and the delete itself is unchanged — the form stays below the box and the delete's own checks decide. If the check fails or the server is older, the app shows nothing extra. A wrong answer from the check can therefore neither let a bad delete through nor stop a good one.

**Consequences**: the check repeats the delete's rules in words; when a rule changes, both must follow (tests assert that they agree).

## ADR-099 · 2026-11-17 · Accepted · A fault mark, a label or a price change does not stop a wrong entry being deleted
**Context**: a salesman entered an iPhone in the wrong category. The owner tried to delete its purchase and got "Device … has moved since this purchase; use a return instead". The phone had never left the shop: its history only had "Marked faulty" and "Faulty cleared". The check (ADR-090) allowed nothing but a verification after the purchase, so even a printed label or a price change blocked the delete.

**Decision**: one rule, `devices.state.moved_since`, used by the three deletes that had the check — a purchase (`void_purchase`), an old-stock phone (`cancel_opening_stock`) and a sale (`void_invoice`).
- **Not a move**: every status-neutral event (verification, price change, note, barcode, label, lock check, PTA check, reclassification, correction, reserve / unreserve) and a fault marked or cleared — as long as the event posted no money.
- **Still a move**: a loan, approval, repair, transfer, sale, return, used for parts, or any event with a ledger posting.
- A purchase or old-stock phone may be deleted while it is in stock **or marked faulty**, and not while it is reserved for a customer.

**Consequences**: nothing else about deleting changes (later payments, exchanges and installments still block; the entry is kept as Deleted; the ledger is reversed, not edited).

## ADR-098 · 2026-11-17 · Accepted · A special price for one shop, a sale for everyone, and a payment recorded with its package
**Context**: the owner gives some customers a lower fee (a shop gets Pro for 3,000 instead of 5,000). That shop sent 3,000 but its fees page still said 5,000, because a package the shop is not yet on always costs the list price. The owner asked for a way to give one shop a discount for a number of months — the shop still sees 5,000, with a line saying the provider gave it the old price — plus "sale" options, and a way to record a payment himself with the package, modules and months, for customers who just send the money and ask to be activated.

**Decision**:
- **Special price for one shop**: `organisations.fee_deal` (JSON, migration `c6e8a0b2d4f7`, NULL for every existing shop): `{plan, price, months, months_left, note, set_on}`; `months_left` NULL = no end. `PUT / DELETE /admin/shops/{id}/deal`; audited.
  - In the quote the special price covers the months it has left; the rest of the order costs the usual price (a year with 6 special months = 6 × 3,000 + 6 × 5,000). The discount for years still applies on top.
  - Approving a payment uses the months up (`order.apply`); nothing is used up by looking or by a rejected payment.
  - The shop sees the list price crossed out, its own price, how many months remain and the provider's note; the summary has "Your discount".
  - When the months are over the package costs the list price again, and the shop's monthly fee is set to it by the payment that used the last month. Removing the special price puts a shop that was paying it back on the list price.
- **Sale for everyone**: `sale_pct` and `sale_until` in the pricing settings (Website prices). It takes that much off the list price of packages and of modules added to a package. It never applies to a shop's own agreed fee or special price, and the monthly fee stored after a sale order is the list price, so the sale ends when it ends. The landing page is not changed by it.
- **Payment recorded with its package**: `POST /admin/shops/{id}/payments` takes `order` (package, extra modules, months 1–60 — any number, not only whole years); `POST /admin/shops/{id}/quote` shows what it should cost that shop first. It is logged as received with a receipt and applied at once through the same `order.apply`. A payment without `order` still only adds months.
- App: `AdminDealCard.tsx` in the shop sheet (both actions), sale fields in Website prices, the banner and crossed-out prices in `PackagePicker.tsx`.

**Consequences**: the rule "a shop's own package costs its own agreed fee" (ADR-095) now has one exception: a package that has or had a special price goes back to the list price when the special months are over. The quote's `monthly` is the fee the shop is on after the order; `per_month` is what the first month of the order costs.

## ADR-097 · 2026-11-17 · Accepted · Returns report: every phone that came back, with all its details
**Context**: a shopkeeper asked where the returned phones are: how many came back, their figures, whether a return was a loss or a profit, when, who returned it, for how much, what money was given or taken, and whether the customer took another phone. The owner asked for the count on the dashboard, the business overview and the shop audit, with every detail, and for a check of what a return itself is missing.

**What a return already had**: the bill and its lines, the customer (asked for on a walk-in sale), value, cash handed back and from which account, the shop's cut, the rest to the khata, a free-text reason, the staff member, the phone's `sale_returned` event, undo. The list showed only the name, numbers, date and value.

**What was missing, and the decision**:
- **Why it came back** was free text only, so it could not be counted. New nullable `returns.reason_code` (migration `b4d6f8a0c2e5`): changed mind, fault, not as told, price, wants another phone, did not sell, other. Chips in the return form; optional; the note stays. The supplier form's existing three choices send a code too. The code is also on the phone's event.
- **What comes next** had no action. The done screen now offers "Sell another phone to this customer" (the sale form opens on him: `/sale/new?party=`), "Open the phone to write its fault" (when the reason was a fault) and "See all returns".
- Nothing else is stored. "Took another phone", "sold again", "days after the sale", "inside warranty" and the effect on profit are all derived.

**The report** (`returns/report.py`, read-only):
- `GET /api/v1/returns/report?date_from&date_to` (every role; default this month) and `GET /api/v1/shop-audit/returns` (the audit's period). Customers' returns and returns to suppliers are kept apart.
- Per return: number, date, days after the bill, bill, person and phone number, staff member, reason and note, each phone (label, IMEI, sold / bought for, where it is now, sold again: date and price), value, handed back and from which account, cut, what went to the khata, inside warranty, the customer's next bill within 3 days ("took another phone").
- Totals: returns, phones, value, handed back, cut, to khata, took another, sold again, inside warranty, deleted returns, and "of N phones sold, M came back".
- **Effect on profit** (only with `VIEW_COST`, like cost): the sale's profit is gone (`line_total − tax − cost`), the cut is what the shop made instead, so effect = cut − profit taken back. For a return to a supplier the cut is the loss.
- A return undone later (ADR-090) is not counted; the business overview's old return figure counted it and no longer does.

**Where it shows**: More → Returns list (now the report, with its own dates), a "Phones returned (this month)" card on Home (`returns_today` / `returns_month` on the dashboard), a Returns card in Business overview (count, phones, handed back, cut), and a Returns section in Shop Audit.

**Consequences**: "took another phone" is a rule of thumb (a new bill for the same person within 3 days), not a stored link. Existing returns have no reason code and show "Not said".

## ADR-096 · 2026-11-17 · Accepted · Graphs on the home screen and the business overview
**Context**: shopkeepers asked for graphs on the dashboard and in Business overview showing sales, purchases, profit / loss, and what is to get (lene) and to give (dene). The home screen had one 7-day sales bar chart and a money donut; the overview had none.

**Decision**:
- **One read-only series**: `GET /api/v1/reports/trends?days=7|30` (`reports/trends.py`), a row per day:
  - sales = the day's bills less returns (the dashboard's own week figure);
  - purchases = the day's purchase bills less returns;
  - profit = the ledger's net profit of the day, through `shopaudit.finance.pnl` (the profit report's rule);
  - to get / to give = every person's ledger balance at the end of the day, positive ones added as "to get", negative ones as "to give" (`debt_split`'s rule). Today's pair equals the dashboard's.
- The route is basic (not in `ROUTE_MODULES`), so every package gets the graphs. Purchases and profit are returned only with `VIEW_COST`; a salesman gets sales and the khata totals, which the home screen already shows him.
- **`TrendCharts.tsx`** on the home screen (under the existing charts) and at the top of Business overview (above its period picker, because the graphs have their own 7 / 30 days): "Sales and purchases" (two lines), "Profit / loss by day" (bars; a loss is a red bar below the line; tap → that day's hisaab), "To get and to give" (two lines). Each has its figures above it.
- In-house SVG as before (`Lines`, `Bars`); no chart library. `Lines` gained `dash`: the second line of each pair is dashed, because the design tokens for to get / to give are too close for colour-blind readers (checked: ΔE 2.4), so the pair is told apart by more than colour.

**Consequences**: the home screen shows sales twice (the 7-day bars and the line); the bars stay because they open a day's hisaab. Nothing is stored; no migration.

## ADR-095 · 2026-11-17 · Accepted · The shop chooses its package, modules and years when it pays
**Context**: "Pay now" opened a page with only the accounts and an amount. The owner wants the shopkeeper to see the packages, the modules he can take and what each costs, and to choose how long to pay for — 1 month, 1 year, 2 years … 5 years — with a discount that grows 5% with every year (5 years = 25%). The super admin sets the fee of every package, every module and his own extra items.

**Decision**:
- **Prices** live in the existing `platform_settings["pricing"]` (Super admin → Website prices): package prices (already there), `module_prices` (PKR per month for a module added on top of a package; 0 = not sold on its own), the add-ons list (already there — these are the provider's own "custom" items), `discount_per_year` (default 5) and `max_years` (default 5).
- **`plan/order.py`** works out everything on the server: `catalog` (packages, modules, add-ons, durations for this shop) and `quote` (lines, per month, discount, total). The app never sends a total.
  - A shop's **own package costs its own agreed fee** (`organisations.monthly_fee`); every other package costs the list price. So nobody's fee rises by opening the page.
  - Modules already in the package are never charged again; a module priced 0 cannot be bought.
  - The discount is `years × discount_per_year` per cent (capped at 90) on what repeats — package, modules, monthly / yearly add-ons — rounded to whole rupees. One-time add-ons are never discounted. One month has no discount.
- **The order rides on the payment**: `fee_payments.package_order` (JSON snapshot of the quote; migration `f2b4d6a8c0e3`, additive, NULL for every old payment). `POST /api/v1/fees` takes `order`; the months come from it.
- **Nothing changes for the shop until the provider approves.** On approval `order.apply` sets the package, the modules (only when the package or the extras differ), the monthly fee (package + extras) and extends the months. The super admin sees the order on the pending payment, is warned when less than the total was paid, and can use "Months only, package unchanged" (`apply_order: false`).
- A payment that went wholly to unpaid fee (ADR-053) applies no order.
- Routes: `GET /api/v1/fees/catalog`, `POST /api/v1/fees/quote` (owner only; under `/api/v1/fees`, so they work while soft-locked). Months limits rose from 36 to 60.
- App: `PackagePicker.tsx` on the fees page (packages, included modules, add a module, extra services, duration, summary); the amount in "I have paid" is the total plus any unpaid fee.

**Consequences**:
- The landing page still shows the older yearly offer ("a year costs 10 months", about 17% off) while the app gives 5% for one year. The owner must choose one (docs/29 §E).
- A smaller package hides modules; their data is never deleted.
- The one-PC install shows the same chooser from its own settings; its renewal still arrives as a code.

## ADR-094 · 2026-11-17 · Accepted · English money words carry a small Roman Urdu hint
**Context**: shopkeepers using the app in English did not understand the money-direction words — "Gave money", "Took money", "I will get", "I have to give", credit / debit — and the loan (amanat) screen. The owner asked for easier words and a small Roman Urdu hint beside the English, so someone who reads English reads that and everyone else reads the hint.

**Decision**:
- **Only English mode changes.** Urdu and Roman Urdu already use the shopkeeper's own words.
- 78 short labels in `i18n/locales/en.json` now end with a hint in brackets. Examples:
  - "I will get (lene hain)", "I have to give (dene hain)";
  - "To get (lene hain)", "To give (dene hain)", "Still to pay (dene baqi)";
  - "I gave money (de diye)", "I took money (le liye)" — these replace "Gave money (len-den)" / "Took money (len-den)";
  - "Receive (lena)", "Pay (dena)";
  - "Debit" / "Credit" (trial balance only) carry no hint: "naam / jama" was tried and shopkeepers found it confusing (owner 2026-11-17), so a line above the trial balance says in plain words what each side holds (`books.trialHint`, all three languages);
  - "Opening balance (purana hisaab)";
  - loans: "Give a phone to another shop (amanat)", "To which shop (kis dukaan ko)", "Expected back (wapsi kab)", "Device came back (wapas aa gaya)".
- A few labels were also reworded: "Party owes me" → "They owe me", "I owe party" → "I owe them", "To receive" → "To get", and the "(receivable)" / "(payable)" jargon is gone.
- The hint lives in the string itself, so it shows everywhere the label does (buttons, chips, lists, aria labels). `i18n/gloss.ts` lists the hints; `Glossed` (used by `BiLabel`, `BiButton`, `Chip`) draws the bracketed hint a little smaller and lighter.
- **This is an exception to the one-language rule** (owner 2026-10-22), agreed by the owner: English mode may carry a Roman Urdu hint in brackets on money / loan words. Nothing else is stacked, and Urdu script is never mixed into English mode.
- Help texts, the landing page and printed documents are unchanged.

**Consequences**: some English labels are longer; buttons wrap where needed. New money-direction labels in English should follow the same pattern and add their hint to `i18n/gloss.ts`.

## ADR-093 · 2026-11-17 · Accepted · Who a phone was bought from on the tally sheet and price lists
**Context**: shopkeepers asked whether the A4 tally sheet (owner and staff copies) and the A4 stock / price lists can show who each phone was bought from — name and phone number on the owner's, only the name on the staff's — without upsetting the PDF layout.

Before this change:
- the owner's tally had the seller only in Excel;
- the staff tally and the staff price list had no seller at all (ADR-077 / ADR-078);
- the owner's own stock list showed the name when the **Bought from** field was ticked.

**Decision**:
- `list_devices` also returns `source_party_phone`. It is used only by the printed lists and is **not** in `DeviceOut`, so the app's API does not carry it.
- **Tally sheet (PDF)**: the seller sits as a third small line in the Status / Days cell, so no column is added.
  - The name shows on every copy.
  - The phone number shows only when the reader may see costs and the copy is not the staff one.
  - Excel: **Bought from** on every copy, **Seller phone** only on the owner's.
- **Price lists**:
  - the staff list gains **Bought from** (name only);
  - the customer list is unchanged (no seller);
  - the owner's / manager's own list (the screen's fields, with **Bought from** ticked) shows `name · phone` in PDF, Excel and CSV;
  - a salesman's own list shows the name only.
- This replaces the "no seller on the staff copy" part of ADR-077 / ADR-078: a salesman may know who a phone came from, but not the seller's number, the cost or the money.

**Consequences**: no data change and no migration. Rows with a seller are one line taller on the tally sheet. Rendered with a long seller name: nothing leaves the page.

## ADR-092 · 2026-11-16 · Accepted · Faster landing page; website prices editable; landing updated; competitor comparison
**Context**: visitors complained that the website loads slowly. The owner asked for a full study of a competitor's mobile-shop page (pricing and gaps), our prices to be shown "like that", and the landing page to be brought up to date.

**What made the page slow** (measured):
- 100 PNG screenshots, 22 MB, each 200–350 KB.
- The entry bundle was the whole app (1.28 MB), because every route was imported eagerly.
- All three languages' texts were imported up front (about 490 KB compressed), two thirds of it the "?" explanations.
- The server already compresses and caches assets (Caddy: gzip / zstd, immutable).

**Decision**:
- **Images**: `frontend/scripts/landing-webp.py` (Pillow) turns every `public/landing/*.png` into WebP at the size shown — phone shots 540 px wide, laptop shots 1280 px, quality 78 — and removes the PNG.
  - Result: 18.6 MB → 3.5 MB; the largest image is about 57 KB.
  - `og-home.jpg` is kept for link previews.
  - The hero image loads eagerly with high priority; the rest are lazy with width / height set.
  - The demo video is `preload="none"`, and the missing `demo.mp4` source is removed.
  - Two leftover recordings (2.6 MB) are deleted.
  - Run the script after `landing-assets.mjs`.
- **Code split**: `app/pages.ts` re-exports every screen behind the login; `router.tsx` loads it with `React.lazy` as **one** chunk under a `Suspense`. The landing, login and sign-up pages stay in the entry. Entry: 1.28 MB → 449 KB (137 KB gzip). The service worker still precaches every chunk, so the app opens offline as before.
- **Help texts**: moved from `i18n/locales/<lang>.json` to `i18n/help/<lang>.json` (the `help.what / example / language` labels stay). `loadHelp(lang)` imports them when a "?" is first opened. Locale chunks: about 160 KB → about 57 KB gzip each. **New "?" texts now go in `i18n/help/`**; `Help.test` reads those files.
- **First visit** (compressed JS): about 865 KB → about 308 KB.
- **Website prices** (`public/pricing.py`, `platform_settings["pricing"]`): monthly price and one-time setup fee per plan, the yearly offer, trial days and add-ons. `GET / PUT /admin/pricing` (super admin), edited in **Super admin → Website prices**. The defaults are the old numbers (1,500 / 3,000 / 6,000, 10 months, 14 days, no setup fee, no add-ons). A shop's own fee is still `organisations.monthly_fee`.
- **Landing pricing section**: per-month price with "paid for the year"; a setup-fee line; "Everything in <plan>, plus …"; an "In every plan, at no extra charge" block (only claims the code supports); an add-ons table when there are any.
- **Landing content**: nine new entries lead the "new" list (edit / delete, fix a bill, the plain stock list, the phone page with sticker, locked phones, repairs by technician or lab, A4 reports, safer logins, price lists and PTA check). Every screenshot was retaken from the current UI.
- **Comparison**: `docs/37-CLOUDPOS-COMPARISON.md` — their plans and add-ons, ours, feature by feature, 13 gaps in a suggested order, and the decisions left to the owner. The price numbers were not changed.

**Update, same day (owner's decision)**: the monthly prices are 2,000 / 5,000 / 7,500 (first set to 2,500 / 4,000 / 7,000 on 2026-11-16, changed by the owner the next day), with a one-time setup fee of 5,000 / 8,000 / 15,000 and four service add-ons (old-stock entry, shop visit, offline install: 5,000 once each; priority phone support: 1,000 a month). These are the new defaults in `public/pricing.py`; `llms.txt`, `index.html` and the price note were updated to match. This changes what a visitor sees, not what an existing shop pays (`organisations.monthly_fee`).

**Consequences**:
- `llms.txt` and the JSON-LD in `index.html` state prices as text. If the owner changes the prices, those two need the same edit.
- The demo video was not re-recorded (its step timed out); the existing one stays.

## ADR-091 · 2026-11-16 · Accepted · Stock page and a phone's page made plain for shopkeepers
**Context**: shopkeepers found the stock screen and a phone's page (classic view) confusing.
- **Stock screen**: eight rows of controls came before the phones. Filters were hidden, and once on they could not be seen or removed. The search was not at the top, and Reports / Download / Share were buried.
- **Phone page**: the information was split between a dark card and a "Device" section. About 20 equal action buttons stood apart from the information they act on. IMEI 2, RAM and the customer were not at the top, and there was no sticker preview.

They asked for: tick-box filters; a × on the search and on every active filter; the search on top; reports easy to reach; the price visible in every list; the whole phone at the top with icons; each action beside its information; and a sticker preview whose fields can be ticked.

**Decision**:
- **Stock screen** (`StockPage`, `StockFilters`), from the top:
  1. The search, with **×** (`SearchBox` shows × whenever something is typed, on every screen).
  2. The kind tabs.
  3. One bar: **Filters (n)**, **Order**, **Reports**.
  4. The active filters as chips with **×**, plus **Clear all**.
  5. The status cards.
  6. The view switch and **Fields**.
  7. A line with the count, the asking total and the cost total (owner / manager).
- **Filters sheet**: tick boxes for **Status** (in stock / on loan / in repair / faulty / sold), **Brand** (with counts), **Condition** and **PTA**. Several in a group means "any of them"; groups together narrow the list. **More filters** holds price, grade, RAM, age, supplier, shelf, cost and lock unchecked. The apply button shows how many phones match. **Reports** opens Download / Share / Price lists for exactly the list on screen. The asking price shows in every view.
- **Backend**: `GET /devices` and `GET /exports/stock` take comma-separated `statuses`, `brand_ids`, `conditions`, `pta_statuses` and `categories` (each an IN filter; "in stock" includes faulty, ADR-066). The single-value params are unchanged. Brand stays a client-side filter on screen so every brand keeps its count in the sheet; it is sent as `brand_ids` to the download. Kept filters use a new key (`stock.filters.v2`), so the old saved shape is ignored.
- **Phone page, classic view** (`DeviceEasyView`):
  - **One card at the top**: brand mark, model, specs and status; asking price (→ change) and cost (→ change purchase price); then one line per fact with an icon — IMEI, IMEI 2, serial, barcode, memory / RAM, colour, condition / grade / faults, PTA, SIM lock, lock check, ID check, bought from, customer (walk-in too), shelf, warranty, days in the shop. Each line carries its own job (Correct IMEI, Edit details, Mark faulty, PTA Check, Lock check, ID card check, change seller / buyer).
  - **Main jobs** as big buttons: Sell, loan, repair, return, and the repair / approval / faulty "back" jobs.
  - **More actions** (collapsed) holds every other job. It is computed as "everything not already shown on a line", so no job is lost.
  - The old Actions grid and the duplicated "Device" rows are gone. The other four views (smart, tabs, tiles, compact) are unchanged.
  - Action test ids are kept (`fix-imei`, `device-change-paid` …).
- **Sticker preview** (`StickerPreview`): beside the details on a laptop, under them on a phone. Ticking the fields shows the preview at once (`/labels/devices?preview=true`). The preview **records no print**, so it does not write `label_printed` events into the phone's history; a test covers this. **Print** is there, and **Size & copies** opens the usual sticker sheet. The ticks are remembered with the sticker choices.

**Consequences**: no data change. Saved stock filters from before start fresh once. Manual ch. 2 (stock list, a phone's page) is rewritten and its two screenshots are retaken.

## ADR-090 · 2026-11-15 · Accepted · Edit / Delete on every entry, with what a delete does; safe deletes
**Context**: a shopkeeper entered expenses wrongly and could not find a way to delete them. The owner asked for Edit / Delete on every entry (expenses, len-den, purchases, sales — everything), active buttons, and before a delete a warning with an example of its effect.

An audit found:
- **Already editable / deletable, but hidden**: expense edit / delete was there, but only after tapping a row.
- **Detail-only**: people and accessories had Edit / Delete only on their own page.
- **No effect text**: the sale and purchase detail delete sheets, the catalogue and held-sale `window.confirm`, and the lab-trip cancel did not say what would happen.
- **No undo at all**: returns, loans, branch transfers, stock adjustments, cash transfers, day close and bulk imports.
- **Unsafe**: deleting one half of an exchange left the other half and its refund, and a sale or purchase could be voided while a later payment still pointed at it.

**Decision (part 1, this change)**:
- **`DeleteWarning`**: one component, shown in every delete sheet. It has a red **What will happen** box (stock, galla, khata, reports) and an **Example**, in en / ur / roman, keyed by kind under `del.<kind>.effect / .example`. Kinds: sale, purchase, repair, payment, lending, expense, exchange, party, accessory, oldStock, cashAccount, expenseCategory, catalogue, held, labTrip.
- **Where it is shown**: `RemoveSheet` takes `warn`; `BillActions` always shows it; the sale / purchase detail void sheets, len-den cancel and lab-trip cancel show it; catalogue and held-sale deletes use `RemoveSheet` instead of `window.confirm`.
- **Row buttons**:
  - `BillActions` gains the kinds expense, lending and exchange, `onEdit` (opens an edit form in place) and `label` (a full button on detail screens).
  - Expense rows get Edit / Delete.
  - `RowActions` (new) puts Edit (`?edit=1` opens the form) / Delete on people and accessory rows.
  - A phone's page gets **Delete (its purchase bill)** / **Delete (its sale bill)** (`?delete=1` opens that bill's delete).
- **Safe deletes (backend)**:
  - `void_invoice` refuses (`sale_has_later_money`, 409) when money was received against the sale later, or something was returned, exchanged or put on installments on it. The same check (`_later_links`) is now shared with change-customer.
  - `void_purchase` refuses (`purchase_has_later_money`) when a later payment points at it or it is an exchange's trade-in.
  - **Delete exchange** (`POST /exchanges/{id}/void`, VOID): both halves are voided in one transaction, the `exchange_refund` group is reversed and an audit row is written. Sale / purchase detail carry `exchange_id`, and the app offers **Delete this exchange** there.
- Nothing is ever wiped. A delete is a void / reversal kept as Deleted with who, when and why (ledger append-only).

**Part 2 (2026-11-16)**:
- **Edit a payment / len-den**: `PUT /payments/{id} {amount, date?, notes?, due_date?, reason}` (VOID).
  - The old one is voided and a corrected one is posted for the same person, direction and purpose, in one transaction.
  - Bills it paid become unpaid and are allocated again FIFO.
  - The old one keeps "Edited, replaced by …".
  - `PaymentEditSheet` opens from the Payments row's Edit (owner / manager) and from a len-den row's Edit.
- **Undo a return**: `POST /returns/{id}/void` (VOID); additive migration `e4a6c8d0f2b5` adds `returns.status / void_reason / voided_by`, every old return `posted`.
  - A sale return puts the phone back as sold to that customer (event `sold`, document `sale_return_void`) and the items out of stock. A purchase return puts the phone back in stock (event `purchased`, `purchase_return_void`) and the items back at their return cost.
  - The ledger group is reversed, `returned_at` is cleared and the bill's `returned_total` / status go back.
  - It is refused once a phone's last money event is not this return (sold again, bought again, moved on).
  - The Returns list shows Delete with the warning; undone returns show crossed out with Deleted.
  - `ledger/corrections.py` now selects only the return columns it reads, so the old migration that calls it still runs on a fresh database.
- **Undo a stock adjustment**: `POST /accessories/{id}/movements/{mid}/undo` (VOID).
  - The opposite movement (`adjust_undo`, pointing at the original) is written, and the adjustment's posting is reversed.
  - New adjustments post with `document_id` = the movement. Older ones are matched by time and memo.
  - Each adjustment can be undone only once; the item's history row has the button.
- **Undo a cash move** (galla ↔ bank): the transfers list row's Delete → the existing `POST /ledger/groups/{id}/reverse`; the row shows crossed out.

**Part 3 (2026-11-16)**:
- Migration `e4a6c8d0f2b5` is still unreleased, so it also carries `branch_transfers.undone_by` and `installment_plans.cancelled_at / cancel_reason`. All additive.
- **Cancel a loan** (amanat): `POST /loans/{id}/cancel` (VOID). Allowed only while the loan is still out.
  - The phone gets `loan_returned` with `cancelled`, and the loan status becomes `cancelled`.
  - It is listed under Returned with a Deleted chip. No money ever moved.
- **Send a branch transfer back**: `POST /transfers/{id}/undo` (VIEW_COST + VOID, sender's side).
  - A transfer from the receiving branch back to this one, at the same cost, with the same rules (ADR-046: rows never change shop).
  - It is refused when something there was sold or moved on. The original is marked `undone_by`, once.
- **Cancel an installment plan**: `POST /installments/{id}/cancel` (VOID).
  - The plan stops (status `cancelled`; no due dates, no reminders, out of the active views), and the balance stays as normal udhaar.
  - A cancelled plan no longer blocks deleting its sale (`_later_links`).

**Part 4 (2026-11-16)**:
- **Stock list**: ✎ / 🗑 on every phone in all four styles (`DeviceActions`). 🗑 opens the phone with `?delete=1`, and the page offers the delete that fits:
  - an old-stock entry → Remove old stock;
  - a bought phone still in stock → its purchase bill's delete;
  - a sold phone → its sale bill's delete;
  - anything else → it says why not.
- **Edit a sale / purchase bill** (lines, prices / costs, items, discount, payment, customer / dealer): `POST /sales/{id}/replace` and `POST /purchases/{id}/replace` (body = the create body + `reason`).
  - The old bill is voided and the corrected one created in one transaction. The old bill keeps "Edited, replaced by …".
  - The same refusals as a delete apply.
  - The bill's **Edit this bill** button opens the sale / purchase form filled from it (`?replace=<id>`): phones with what went with them, items, discount, paid / udhaar, the person. A reason is asked.
  - The new bill is dated now: a back-dated one would come before the phone's own latest events.
  - A bill made through an exchange is still deleted as one exchange, not edited.

**Consequences**: no data change and no migration. Two deletes that used to leave the books half-undone now explain what to undo first.

## ADR-089 · 2026-11-15 · Accepted · One global row per brand / model / storage / colour / expense category
**Context**: a live shop saw every brand twice in the purchase form ("Apple, Apple") and the stock summary split the same brand (Apple 98 phones + Apple 15). The cause: production runs `uvicorn --workers 2`, and the startup seed (`seed_catalogue`, `seed_categories`) has no lock and the tables had no unique rule. On the first start both workers saw an empty list and each inserted the whole global catalogue. Phones were then bought against whichever copy the shopkeeper tapped. Expense categories were seeded the same way.
**Decision**:
- **Merge, additive migration `c1e3a5b7d9f2`**: for each set of global rows with the same name (brands, storages, colours; models by brand and name; expense categories by key), keep the row with the most phones (or expenses), then a stable order.
  - Phones, models, a shop's spec sheets (merged if both had one) and accessories' "fits" lists, plus expenses, are moved onto the keeper.
  - Only then is the empty duplicate removed. FKs are RESTRICT, so a missed reference fails the migration instead of losing data.
  - No bill, payment, ledger row or device event changes: expense ledger accounts are named by the category key, not its row.
- **Never again**:
  - partial unique indexes on `lower(name)` (models: `brand_id, lower(name)`; expense categories: `key`) for global rows only — a shop's own rows are unaffected;
  - the seed takes a Postgres transaction lock (`pg_advisory_xact_lock`), so workers seed one after another;
  - startup treats a unique-index clash in the seed as "another worker already did it" instead of crashing.
**Consequences**: on deploy the migration folds the duplicates. The shop sees one Apple with all its phones (98 + 15 = 113) and its stock value unchanged. Nothing to do in the app.

## ADR-088 · 2026-11-15 · Accepted · Change own password, password / PIN history, super admin PIN reset, both login ways
**Context**: the owner asked for the super admin to be able to see shop passwords and PINs, for the owner and staff to change their own password and PIN, a history of "which password / PIN was used", and both Password and PIN on the login screen.
**Decision**:
- **Values are never viewable.** Passwords and PINs stay one-way hashes. Nobody can read them, the super admin included, and no history keeps them. Showing them would mean storing them reversibly; one leaked database or admin session would then expose every shop's login (people reuse passwords for WhatsApp, bank apps). The owner accepted this: a forgotten one is replaced, never read.
- **History** (`credential_changes`, additive migration `b8d0f2a4c6e9`): one row per set / changed / removed / reset of a password or PIN. Each row holds whose, `by_kind` (self | owner | super_admin | code), by whom, the IP, the user agent and when.
  - Written best-effort inside a savepoint (`credentials.service.log`), so a history failure never blocks the change itself.
  - Hooks: `set_own_pin`, `update_staff` (owner resets), the forgot-password code reset, the super admin's `set_password` / new `set_pin`.
  - `GET /credentials/history`: the owner sees the whole organisation; anyone else only their own. The super admin is never named to the shop ("software support").
- **Change own password**: `PUT /me/password {current_password, new_password (min 6)}` → 204, and a More tile with a sheet (current, new, confirm). The PIN is still changed / removed from More → Set quick PIN.
- **Super admin**: `POST /admin/shops/{id}/owner-pin {pin, user_id?}` sets a new PIN for the owner (or the user picked for the password reset). `GET /admin/shops/{id}/credential-history` shows the shop's history. Both appear in the shop's sheet (`AdminCredentials.tsx`).
- **Login**: Password / PIN tabs are always shown. The PIN tab no longer needs an earlier login on that phone: it asks for the mobile number when it does not know it.
**Consequences**: nothing changes for existing logins or data. The history starts empty and fills from now on. Shop owners can now audit who changed whose password.

## ADR-087 · 2026-11-15 · Accepted · Repairs: own technician or outside lab, delete, reports; Edit / Delete on more rows
**Context**: the owner asked for several things:
- Edit / Delete on every row;
- every repair (from the Repairs module or a phone's page) to start with a choice: the shop's own technician, or an outside lab (what was sent, the problem, the price, when back, paid, owed);
- delete for a repair sent by mistake;
- full reports for both — every job, customer / shop phones, udhaar, profit / loss, parts, debit / credit, per lab — with download / share, also in the business overview and audit.

Already there: repair jobs, lab trips (`repair_dispatches`, ADR-044), lab stats / detail, and the audit's repairs section.
**Decision**:
- **New repair** (`NewRepairPage`):
  - The first choice is **Who will repair it**: the shop's technician (`GET /repairs/technicians`; optional) or an outside lab (party picker of kind technician, what to do, the agreed price, back by). The lab path creates the job and then the existing lab trip.
  - `?device=` repairs the shop's own phone. A phone's page **Send to repair** now opens this form instead of a bare event.
- **Delete a repair**:
  - `POST /repairs/{id}/cancel {reason}` (owner / manager; new status `cancelled`, closed).
  - It reverses the advance's ledger group, cancels an open lab trip, and brings the shop's own phone back to stock (`repair_returned`).
  - It is refused once delivered, or once a lab charge was booked.
- **Reports** (`repairs/report.py`, the shared A4 page; owner / manager): `GET /repairs/report` and `GET /repairs/labs/report?lab_id` (pdf / xlsx; the default is this month).
  - Shop repairs: figures; every job with its bill, paid, udhaar, parts, lab charge and profit; by status; by technician / lab; who owes; parts used.
  - Labs: per lab and every trip.
  - Deleted repairs are left out.
  - A reports card sits on Repairs (with a period picker); there are downloads on Repair labs and on each lab.
- **Business overview**: a repairs block (taken in, customer / own, given back, open, at a lab, bills, profit), as a card and a report section.
- **Edit / Delete** (`BillActions`, generalised): repairs (rows and the job page) and payments (rows; Edit opens the khata), as well as sales and purchases. Expenses already had cancel.
**Consequences**:
- No migration; `cancelled` is a new value in a string column.
- The audit's repairs section counts every job, including deleted ones. The new reports leave deleted ones out.

## ADR-086 · 2026-11-15 · Accepted · Edit / Delete on every sale and purchase row
**Context**: the owner asked how to delete a purchase or a product, and asked for small Edit and Delete buttons on every sale and purchase row, and Delete in the bill's own view, for bills entered by mistake. The ledger is append-only; void (Cancel this bill) already existed, but only on the bill's page.
**Decision**:
- `BillActions` sits beside each row of the Sales list and the Purchases list (not on deleted bills):
  - **Edit** opens the bill, where its fixes live.
  - **Delete** (owner / manager) asks for a reason and calls the existing `POST /sales|purchases/{id}/void`.
- The words change, the behaviour does not. "Cancel this bill" becomes **Delete this bill**, and status `void` reads **Deleted**. The help explains that the bill stays in the record with who, when and why, and is reversed in stock, khata and galla.
- The backend refusal for a bill whose phone has moved on stays as it was; its message is shown in the sheet.
**Consequences**: no API or data change. A deleted bill is still listed, marked Deleted, without the buttons.

## ADR-085 · 2026-11-15 · Accepted · Locked phones (iCloud / Google FRP): bought for parts or sold as they are
**Context**: shops buy locked phones (mostly iCloud-locked iPhones) for their parts or to sell them on as they are. Their IMEI often cannot be seen. The owner asked for a separate, short purchase form (brand, model, cost, colour, common iPhone details; the rest optional, payment as usual), a separate place in stock, and reports.
**Decision**:
- **Data**: `devices.lock_type` (`icloud` | `google` | `other`; None = a normal phone). Migration `f6b8d0a2c4e7` adds it as a nullable column.
  - Without an IMEI, the unit is identified by its serial, or by a code the shop makes (`LCK` + 12 hex), stored in `imei1` like a Wi-Fi tablet's serial. It gets its own barcode as usual.
- **Buying**: no lock check (`require_lock_check` is skipped for a locked unit) and no PTA; everything else goes through the usual purchase and payment, unchanged.
  - The UI is `LockedLineSheet`, from **+ Locked phone (iCloud / FRP)** in the purchase. It has the lock, brand (Apple first), model, storage, colour, cost and asking price, with IMEI / serial / RAM / shelf under More details.
- **Stock**:
  - `stock-status` counts `locked` separately, and they are not counted as available.
  - `GET /devices?locked=` and the stock export take a `locked` filter.
  - The stock page has a **Locked** card that filters the list; the overview's stock alerts include them.
  - Every paper says the lock (`devices.types.lock_text`): the stock CSV / Excel condition column, the A4 stock list, the tally page and Excel, stickers, and bills.
- **Selling**: a locked unit is sold as it is. It has no "not cleared" lock check, so the ADR-038 rule does not stop it, and the bill names the lock.
- **Used for parts**: new status `used_for_parts` and event `used_for_parts`, reached from in stock or faulty.
  - `POST /devices/{id}/use-for-parts {parts, note}` (owner / manager) posts Dr COGS / Cr Inventory at the unit's cost, so the cost reaches the profit report.
  - The event keeps the parts and the note. It cannot be undone.
- **Lock removed**: `PATCH /devices/{id} {lock_type: null}` makes it a normal phone; Correct IMEI then sets its IMEI.
- **On the phone's page**: `LockedPanel` shows the lock and the two actions. The PTA "Unknown" and "Lock not checked" chips are hidden for a locked unit.
**Consequences**:
- Existing phones are unchanged.
- The parts taken out are recorded on the phone's history; they are not added to a spare-parts stock. That can come later if the shop wants a parts inventory.

## ADR-084 · 2026-11-15 · Accepted · Business overview and shop audit as detailed A4 reports
**Context**: the owner asked for detailed A4 PDFs of the shop audit and the business overview, for the selected filter, to print, keep in a file, or present.
- The audit's printable report already existed, but its header was bare (name only) and wide tables did not wrap.
- Its download on the audit overview covered only two sections.
- The business overview had no report at all.
**Decision**:
- **Shared A4 page**: `exports/a4.py`.
  - `page()` shows the shop's header (name, address, number, NTN, the period, who printed it and when), figure boxes, then sections: a table with notes and a count.
  - Type size and padding shrink as columns grow, and text wraps. Table headers repeat, a row never splits, negatives are red, and a footer line ends the page.
  - `workbook()` produces the Excel: a Summary sheet plus one sheet per section, set to print on A4.
- **Shop audit**: `report.printable` uses this page, so every audit print gets it. The audit overview gets a **Full shop audit report (A4)** card: every section in `detail` mode for the selected period, as PDF or Excel.
- **Business overview**:
  - `GET /reports/overview/export?date_from&date_to&format=pdf|xlsx`. It is `overview(full=True)`, so payments by person, dues and recent activity are not cut to the top 10.
  - The report has: figures; sales / purchases / returns; this month; received from; paid to; who owes; whom the shop owes; models sold (with profit) and bought; stock now; people; module totals; recent activity.
  - It needs `REPORTS_ALL`. Profit appears only with `VIEW_COST`.
  - On the overview screen: Download / Share with the period.
- `DownloadButton` takes `formats`, so a report without a CSV does not offer one.
**Consequences**: no data change. Every audit printout looks different (better) from now on.

## ADR-083 · 2026-11-15 · Accepted · A shop's own name for CP ID phones; a trend icon for profit
**Context**: CP ID phones are no longer allowed in Pakistan, yet shops still hold and trade them. In their reports, shops want their own word or mark instead of "CP ID". The owner also asked for a better profit icon on the home screen.
**Decision**:
- **Storage**: `shops.device_prefs.cpid_label` (≤ 20 characters; empty or "CP ID" means the default). `devices.types.cpid_label(shop)` and `pta_out(value, label)` read it.
- **Where it applies**: the tally sheet (page and Excel), the A4 stock list and price lists (`stock_sheet`), the stock CSV / Excel (the `pta` column; other PTA values stay raw), stickers, and receipt lines.
- **In the app**: `lib/cpid.ts`, run from the Shell, overrides `stock.pta.cpid` / `wa.pta.cpid` in every language from the shop's setting.
- **Settings**: under Device settings, a text box plus marks (★ ◆ ● ▲ ■ ✦ ♦ ✱ C S) and a CP ID reset. Sent together with the other device preferences.
- **Unchanged**: the stored value stays `cpid`. Bulk export / import keep "CP ID" so a backup stays re-importable.
- **Home profit card**: TrendingUp in green, or TrendingDown in red for a loss, instead of the piggy bank.
**Consequences**: no migration. A shop that sets nothing sees "CP ID" as before.

## ADR-082 · 2026-11-15 · Accepted · PTA check: open DIRBS with the IMEI copied, save the answer
**Context**: the owner asked whether PTA's DIRBS check (an IMEI box and "I'm not a robot") can open inside the software.
- It cannot: `dirbs.pta.gov.pk` sends `X-Frame-Options: SAMEORIGIN`, so it may not be framed.
- Its reCAPTCHA works only on PTA's own domain. Getting around it is neither possible nor allowed.
**Decision**:
- **PTA check** (`features/stock/PtaCheck.tsx`), on a phone's page and next to PTA status in the add-phone sheet:
  - copies the IMEI and opens DIRBS in a new tab or the system browser;
  - or opens `sms:8484?body=<IMEI>`;
  - then asks what PTA said: Approved / Non-PTA / Blocked.
- **On a phone in stock**, `POST /devices/{id}/pta-check {result, via}` records a new neutral event `pta_checked` (result, via, the status before). Approved / Non-PTA set `pta_status`; Blocked is recorded only. Any role that can transact may call it.
- **While buying**, the answer sets the sheet's PTA choice. Blocked shows a warning.
- No migration (`device_events.type` is a string). Tests never call PTA (the e2e stubs the site).
**Consequences**: the check stays the shopkeeper's own, on PTA's site. The app makes it two taps and keeps the result on the phone's history.

## ADR-081 · 2026-11-15 · Accepted · Returning a bought phone to its seller, with the money worked out
**Context**: a phone bought from someone may turn out faulty, or the shop may not want to keep it, and it goes back. The owner asked:
- should the bill be cancelled? (No: cancel means the deal never happened.)
- the record must show it was bought, then returned;
- the money must settle, sometimes with a cut. Example: a 50,000 phone with 25,000 paid. On return, the 25,000 paid comes back and the 25,000 owed disappears, so the balance is zero.
`POST /returns/purchase` already returned lines (inventory out, `returned_to_supplier` event, party debited at value, an optional refund). The UI only asked for a refund amount, with no explanation and no cut.
**Decision**:
- **Cut**: `PurchaseReturnIn.cut_amount`, saved as `kept_amount`. The seller takes the goods back for less. The party is debited with value − cut; the cut is debited to COGS ("Cut on return"), so it reaches the profit report. The cut cannot exceed the value, and the refund cannot exceed value − cut.
- **UI**: `PurchaseReturnSheet`, opened from the purchase bill, or from the phone's page as **Return to the seller** (`?return=<device id>` preselects that phone). It has:
  - the reason as Faulty / Don't want / Other, plus a note;
  - the cut;
  - a worked statement: value; still owed on this bill (cancelled first); still owed after; the seller gives back;
  - **Received now** (cash or bank), with the rest shown as staying in the seller's khata;
  - "balance zero" when it is all settled.
- No migration and no change to an existing return; a cut of 0 behaves exactly as before.
**Consequences**: Cancel this bill stays for bills entered by mistake. Returns keep the purchase and the phone's history.

## ADR-080 · 2026-11-15 · Accepted · Login security: approved devices and staff login hours
**Context**: shopkeepers worry that anyone who learns a password, including a salesman, can log in from anywhere and see sensitive data. They want something free (no SMS). The options considered:
- device approval;
- staff login hours;
- Authenticator 2-step for the owner;
- fingerprint only;
- an IP lock, rejected because IPs change in Pakistan;
- SMS OTP, rejected because it is paid.
The owner chose the recommended first set.
**Decision**:
- **Device key**: every request carries `X-Device-Key`, the app's own random key in localStorage (`lib/deviceKey.ts`). The server stores only its SHA-256 (`trusted_devices`).
- **Rules** are in `organisations.login_rules` (JSON, empty = off): `device_approval`, `hours_on`, `hours_from` and `hours_to` (HH:MM, may run past midnight). Both rules are off by default. Neither applies to the owner or the super admin.
- **`security.guard_login`** runs for every new sign-in, inside `auth._tokens(method)`: password, PIN, fingerprint, passkey and reset; not signup or resumed. In order:
  1. Outside the hours: `403 outside_hours`.
  2. With device approval on:
     - no key (an old app): `device_unknown`;
     - an approved device: the login session gets its `device_id` (new nullable column on `login_sessions`) and the login goes ahead;
     - a rejected device: `device_rejected`;
     - otherwise the device is recorded or re-asked as pending: `device_pending`, with a message telling the staff member to ask the owner. The login page shows the server's message.
- **`guard_refresh`** applies the hours when a login is renewed, so an open login stops within the access-token lifetime (30 min).
- **Owner screens**:
  - Routes (`/security`, `MANAGE_STAFF`): rules; devices with approve / reject / revoke; `logout-staff`, which ends every non-owner session.
  - **Take back** ends that device's sessions at once.
  - Switching a staff member off ends all their sessions.
  - UI: More → Login security (`LoginSecurityPage.tsx`) and a home banner "N new phones waiting".
- Migration d4f6a8c0e2b5 (additive): the `trusted_devices` table plus two nullable columns. Nothing is deleted; statuses change.
**Consequences**:
- With device approval on, a cleared browser or a reinstalled app is a new device and needs the owner once more.
- Logins already open when the rule is switched on continue until they end; the owner can end them all with Log out all staff.
- Owner 2-step (Authenticator) is left for later.

## ADR-079 · 2026-11-15 · Accepted · WhatsApp entries: a standard group message, read back into the forms
**Context**: shops post every sale, purchase, payment and len-den in WhatsApp groups with the staff, and one person types them into the software. Each message is written differently, often with a photo of the IMEI or the box. The owner asked for standard templates that are easy for the writers and for the person entering.
**Decision**:
- **One standard message** (`lib/waMessage.ts`): a title line (`*SALE*`, `*PURCHASE*`, `*PAYMENT RECEIVED*`, `*PAYMENT PAID*`, `*LEN DEN*`), then `Key: value` lines. The keys are English so the format stays the same in every language.
- **The reader is forgiving:**
  - Roman Urdu / Urdu keys, any order, and WhatsApp bold;
  - amounts as 1,25,000, 125k or 1.25 lakh; the method after Paid;
  - an IMEI found anywhere, only if the check digit is valid; a mobile number found anywhere;
  - model, storage, RAM, condition and PTA read from the model line;
  - for a purchase, Price counts as the cost; Udhaar gives Paid;
  - lines it cannot read are shown, never guessed.
  It is unit-tested (`waMessage.test.ts`).
- **`/whatsapp`** (More → WhatsApp entries) has two parts:
  - *Write a message*: a few boxes and Scan for the IMEI, which build the standard message. *Send on WhatsApp* opens `wa.me/?text=`; *Copy* and *Copy blank form* copy it.
  - *Enter from a message*: paste the message, or read the IMEI from a photo with `scanPhoto`. The app finds the phone by IMEI and the person by number or name (`/parties/by-phone`, `/parties?q=`), then opens the usual form already filled. The purchase line is matched to the catalogue (brand by name or alias, model by the longest name in the text, storage by name); its sheet opens filled, and the kind comes from the person (dealer → supplier, else walk-in). A payment or len-den opens `PaymentForm` with the person, direction, amount and the len-den flag.
- **Filling the forms**: `seedDrafts(prefix, values)` (`lib/draft.ts`) hands values to the form's `useDraft` keys once. The forms open at step 2 (`?step=2`), so the step-from-URL logic keeps them there. The value is read in the initializer and forgotten in the effect, because React may run the initializer twice.
- **Nothing is saved by this screen.** The person checks the usual form and saves it, with every usual check (verification, lock checks, prices, permissions). There is no backend change and no migration.
**Consequences**: the message format is a convention people can also type by hand. The reader accepts what it can and shows the rest.

## ADR-078 · 2026-11-15 · Accepted · Stock lists on A4, and price lists for staff and customers
**Context**: the stock page's PDF (card / table / grid / list, with the picked fields) was one wide table. The app's PDF is A4 portrait, so with many fields it ran off the page; no PDF printed properly on A4. The owner also wants to send the stock with the asking price: one list for the staff (every detail) and one for customers.
**Decision**:
- `exports/stock_sheet.py` renders `/exports/stock?format=pdf` when the page's fields are given. The layout matches the tally sheet:
  - A4 portrait;
  - a header with the shop, the date and who printed it;
  - figures: phones, brands, models, the total at asking, and the total at cost (only when cost is picked and allowed);
  - By brand / By model tables;
  - every phone grouped brand → model, one row each: # | IMEI / IMEI 2 / serial | every other picked field as "label value", wrapping | asking / cost.
- `copy=staff`: every field and the asking price; no cost, no seller. `copy=customer`: customer fields and the price, in-stock phones only; no IMEI, serial, barcode, cost, seller, days or status. Both keep the page's search, filters and order. They are available as PDF, Excel and CSV (`stock-prices`, `phones-for-sale`) to every role, since neither has a cost.
- The generic report PDF (`_printable`) is always A4 portrait. More columns get a smaller type and wrap, the header repeats, and rows are not split.
- The generic Excel prints on A4 (landscape over 6 columns), one page wide, with the header row on every page.
- UI: a **Price lists** button beside Download on the stock page opens the two copies, each with Print (A4) and Download / Share.
- The app's own A4 PDF (`printPagePdf`) lays the page out 190 mm wide and places it 10 mm from the left and right edges (owner 2026-11-15: "left right space"), so nothing touches the paper's edge; nothing is shrunk.
**Consequences**: no data change. The stock CSV / Excel with the page's fields are unchanged apart from the print setup.

## ADR-077 · 2026-11-14 · Accepted · Stock tally staff copy, given to staff only with the owner's permission
**Context**: the owner wants an A4 tally sheet to hand to the staff with no amount on it: no cost, no asking, no lena / dena. A salesman should download it only after the owner accepts their request. Until now any logged-in user could download the full tally sheet.
**Decision**:
- `GET /exports/stock-tally?staff=true` gives the staff copy (`tally.page / workbook(..., blind=True)` and the csv). It has no cost, asking, stock value, to get / to give, cash or seller. The title is "Stock tally sheet (staff copy)" and the file name is `stock-tally-staff`.
- **Access:**
  - Owner and manager (`REPORTS_ALL`) get either copy.
  - Any other role gets 403 unless the latest request is approved, and then always gets the staff copy.
- New table `staff_access` (migration c8e2a4f6b0d1, additive): shop, user, kind (`stock_tally`), status pending / approved / rejected / revoked, requested / decided at / by. Nothing is ever deleted.
- **Routes** (`/staff-access`):
  - `GET /stock_tally`: the owner gets `requests`, the latest of each staff member that is pending or approved;
  - `POST /stock_tally/request`: asking twice keeps one request;
  - `POST /requests/{id}/approve|reject|revoke`: owner only (`MANAGE_STAFF`); a request already answered gives 409.
  - Approval lasts until the owner takes it back.
- **UI:**
  - The tally card shows the owner / manager the full copy and the Staff copy, plus the requests with Allow / Say no / Take back.
  - Staff see Ask the owner, then the waiting state, then the staff copy only.
  - The owner's home screen shows "N staff asked for the stock tally sheet".
**Consequences**:
- A salesman who downloaded the full sheet (live since ADR-075, the same day) now needs the owner's approval.
- The stock-worth page itself is unchanged for staff (asking-price value, as before).

## ADR-076 · 2026-11-14 · Accepted · Business overview: every figure on one screen
**Context**: the owner asked for one dashboard with the figures they check daily:
- total sale, purchase, credit and debit; phones sold and bought with the paid / udhaar split;
- customers and dealers, total and new; payments received and paid, and from / to whom;
- payment reminders, this month's sales and expenses, customer due;
- top sales with profit, top purchases, stock alerts, recent activity, module counts;
- return amount, udhaar given and collected.

Each card needs "View details". 2–3 shops run live installs, so existing data must not change.
**Decision**:
- `GET /reports/overview?date_from&date_to` (`reports/overview.py`) is read-only and needs owner / manager (`REPORTS_ALL`). It reuses `day_report` (period and month-to-date), `top_sellers` and `stock_status`. It adds:
  - the paid / udhaar split of sale and purchase bills;
  - payments by person;
  - people counts (new = `created_at` in the period);
  - dues from the parties' balance (top 10 each way);
  - returns, module counts, the last 12 audit entries, and phones in stock for more than 60 days.
- Profit is `null` without `VIEW_COST`.
- It is not behind the `reports` module: the same profit is already on the home screen for every plan.
- UI: `/overview` (`OverviewPage.tsx`), with a period picker and 13 cards. Each card links to its screen; each person row links to `/parties/{id}`. It is reached from the home screen and **More**.
**Consequences**:
- No migration, no write, no new setting.
- Received / Paid out and the people lists count `payments` rows plus the money paid on the bill itself (a bill's paid less what later payments put on it; `at_bill`). Walk-in sales are one row with no person.

## ADR-075 · 2026-11-14 · Accepted · A stock tally sheet for A4, and sharper PDFs
**Context**: the shop counts stock by hand and needs a PDF / Excel with every field, a header with the shop and its figures, and counts by brand and model. The stock export's PDF put every field on one line, so it did not fit A4. The app's PDF drew the whole page once and shrank it to the phone's canvas limit, so long reports came out blurred.
**Decision**:
- `GET /exports/stock-tally?format=pdf|xlsx|csv` (`exports/tally.py`), read-only, over the phones the shop holds (in stock, faulty, in repair, approval, on loan).
  - **Print page:** A4 portrait. The header has the shop, address, number, NTN, date and who printed it; 10–13 figure boxes; By brand / By model tables. Then every phone grouped brand → model, two lines a phone so every field fits, with a Found box and a Note column. The table header repeats; rows never split. Then the items with Counted, and signature lines.
  - **Excel:** Summary / Phones / Items sheets. Phones has one column per field, Found, filters and frozen panes, and prints A4 landscape fit to one page wide with the header row repeated.
  - Cost and cash appear only with `VIEW_COST`.
- **App PDF** (`printPagePdf`, A4): page breaks are still found on the shrunk drawing (never through a line). Each page is then drawn again on its own at 2× and added to the PDF, so every page is sharp whatever the length. The thermal receipt path is unchanged. If a page cannot be drawn alone, the old shrunk slice is used.
- UI: a **Stock tally sheet** card (Print (A4), Download / Share) on the stock-worth and stock-count pages.
**Consequences**: every A4 report the app saves as PDF is now sharp, not only the tally.

## ADR-074 · 2026-11-14 · Accepted · Login sessions; the owner sees and ends them when the super admin allows
**Context**: the owner wants to know where the software is logged in, who is active, and with what login time and activity. This is visible to the owner only when the super admin allows it. Asked choices:
- the owner can see **and** log out a device;
- logins are recorded always, and shown only when allowed.
**Decision**:
- **Sessions.** New table `login_sessions` (additive migration `a9c1e3f5b7d9`): user, organisation, method (password / pin / fingerprint / passkey / signup / reset / resumed), IP, user agent, started, last seen, ended, ended by, reason.
  - A sign-in starts a session; access and refresh tokens carry its id (`sid`).
  - The refresh keeps the sid.
  - A token from before (no sid) gets a session at its next refresh (`resumed`), so nobody has to log in again.
  - Starting, touching and ending a session is best-effort: it never blocks a login or a request.
- **Each request.** An ended session's token is refused with `session_ended`, and its refresh too. `last_seen_at` is written at most once a minute per session. `/auth/logout` ends the caller's own session, and the app calls it on logout.
- **Owner page.** `/api/v1/login-activity` lists the sessions (online = used in the last 5 min) and `/{id}/end` ends one. It is owner-only (`Cap.MANAGE_STAFF`).
- **Gate.** The routes sit behind the new module `login_activity`, which is in no plan (`OPT_IN`): the super admin switches it on per shop in the modules card. The More tile shows only then.
- **UI.** More → Login activity: Online now / Logged in / Ended, device text from the user agent, "What they did" → Staff → Activity for that person, **Log out this device**.
- Times are returned with UTC.
**Consequences**:
- The owner's tile appears after their next login once the module is on, because the plan is read at login.
- The IP is the one the server sees (proxy headers on).
- There is no geolocation.

## ADR-073 · 2026-11-14 · Accepted · A purchase price is changed as a typing mistake (cash) or a real change (khata); a wrong len-den is cancelled and re-entered
**Context**:
- **Purchase price typed wrong.** A customer's phone was entered at 40,000 paid 40,000, but 45,000 was really paid. "Change purchase price" (ADR-063) put the 5,000 on the seller's khata, as if the shop still owed it. The reverse happens too: typed 30,000 for a 25,000 phone.
- **Len-den the wrong way.** A len-den was entered as "taken" when the money was "given", and could not be undone.
**Decision**:
- `POST /purchases/cost` takes `mode`:
  - `khata` (the default, as before): the price really changed, and the difference is owed.
  - `paid`: a typing mistake, where the money paid at the purchase was the corrected price.
- In `paid` mode, the same correction group also posts the difference between the khata and the money account: more paid → out of the account the bill was paid from (or the default cash); less → back into it. The seller's khata nets to nothing.
  - `purchases.paid` and the payment detail follow.
  - It is refused when less than the new price was paid at the purchase.
  - It is dated today when that day's cash is closed.
- The sheet asks **Why is it changing?** (Typing mistake / The price really changed) before saving, and shows the effect on the galla or the khata.
- Len-den: each posted entry has **Cancel** (owner / manager) with a reason. It uses the existing payment void, which reverses it; the entry stays in the list crossed out. **Cancel and enter as Gave / Took money** opens the other side with the same amount.
**Consequences**:
- Old API calls without `mode` behave as before.
- The cancelled entry is never deleted.

## ADR-072 · 2026-11-13 · Accepted · A salesman sees today's cash in hand and bank only
**Context**: the owner wants a salesman to see only today's cash in hand and bank money. The salesman should not see the galla / bank totals, other days, or account balances.
**Decision** (roles without `VIEW_COST`: salesman, technician; owner / manager unchanged):
- `/reports/dashboard`:
  - `cash_in_hand` (all accounts' balance) is `null`;
  - new `today_cash` and `today_bank` give today's net movement (in − out since the shop day began) on cash accounts and on bank / wallet / cheque accounts. They are returned for everyone.
- `/reports/day` and `/exports/day` serve today only for these roles, whatever dates are asked.
- `/ledger/accounts` returns names (for picking) with `balance` and `opening_balance` as `null`. The cash book was already manager-only.
- Home: the salesman has no period picker. The cash tile is **Cash in hand today** with **Bank / online today**, linking to today's hisaab, and the donut uses today's cash.
- Hisaab: no period picker for a salesman.
**Consequences**: the owner sees exactly what they saw before.

## ADR-071 · 2026-11-13 · Accepted · CP ID as a PTA status; the purchase's person from everyone; an existing number is offered
**Context**: the owner asked for three things:
- CP ID as a PTA option;
- a way to put the SIM lock on phones already added;
- a fix for "Change dealer / customer" on a purchase. It listed dealers only, so a customer could not be found, and "New person" said the number was already saved without showing whom.
**Decision**:
- **CP ID.** `PtaStatus.CPID = "cpid"`. The column is text, so no migration.
  - It appears in the add / edit form, the ID check, the stock filter, the sticker, the bill and the bulk import ("cpid", "cp").
  - It does not ask for SIM time (only Non-PTA / JV do).
- **SIM lock on old phones.** It is set by **Edit details** on the phone page (ADR-070's field is in the edit form).
- **Purchase's person.** The change sheet's picker lists everyone, with no kind filter, so a dealer bill can move to a customer and the other way.
- **Existing number.** When a new person's number is already saved (`party_phone_exists`), the person form looks it up and shows **Use this person**. This works in every picker.
**Consequences**: the purchase keeps its own kind (dealer / customer) when its person changes; only the person moves.

## ADR-070 · 2026-11-13 · Accepted · A phone's SIM (carrier) lock, for information
**Context**: shopkeepers want to know which phones are locked to a network (US / Japan / UK carrier phones), for both iPhone and Android.
**Decision**:
- Additive migration `e7a9c1d3f5b8` adds `devices.sim_lock` (`unlocked` | `locked`, nullable) and `devices.sim_lock_carrier` (≤ 40, nullable).
- It is set when stock is added (any SIM-taking unit) and in Edit details, with network chips (AT&T, T-Mobile, Verizon, Sprint, Cricket, Docomo, KDDI / au, SoftBank, EE, Vodafone) or free text.
- It shows:
  - in the review before saving;
  - as a chip on the phone's page;
  - as a stock list field;
  - in the Download / Share column "SIM lock".
- It is separate from the lock checks (`lock_checks.carrier`), which stop a sale when not cleared. The SIM lock never stops a sale.
**Consequences**: empty means "not checked"; old phones stay empty until edited.

## ADR-069 · 2026-11-13 · Accepted · The ID check keeps an optional photo of the seller's thumb impression
**Context**: shopkeepers want the seller's thumb on record when buying a used phone, as an option. A real biometric match against NADRA needs a NADRA-licensed scanner and NADRA's BVS service, which a shop app cannot use.
**Decision**:
- Additive migration `d5f7b9c1e3a6` adds `verifications.thumb_path` (nullable).
- The verification form has a **Thumb (optional)** photo tile. The seller presses an inked thumb on paper or in the declaration's box; the shop takes a photo. The file is shop-scoped like the CNIC photos.
- It is not in `REQUIRED_FOR_CLEAR`: it never holds the check back or changes `missing`.
- The printed declaration gets a **Thumb impression** box (34 × 38 mm). It holds the photo when there is one; otherwise it stays empty for an inked thumb on the paper.
**Consequences**:
- A fingerprint scanner could later fill the same `thumb_path` with its image without a schema change.
- Matching or verifying a fingerprint is out of scope.

## ADR-068 · 2026-11-13 · Accepted · A person's phones by brand and model, with group pay / receive
**Context**: on a customer's or dealer's page, the shopkeeper wants to see:
- which brands and models, and how many;
- per phone what is left to give / to get, with totals per model, per brand and in all;
- everything clickable, with pay / receive at each level and a ledger for everything.
**Decision**:
- The existing `/parties/{id}/units` rows gain `brand_id/name` and `model_id/name` (additive).
- `PartyUnits.tsx` shows the grand totals (bought / sold with their agreed sums, still to pay, still to get) and a **By brand and model** view (the default) next to **One list** (the old list, unchanged; the choice is kept per device).
  - Brand → model → phones. Each level shows its count and what is left to give / to get.
  - Pay / Receive on a brand or model sends one payment allocated over its open bills, oldest first, each up to what it has left; a bill shared by two phones is taken once. `PaymentForm` gains `allocations`.
  - Each phone keeps its own Pay / Receive. A phone opens its page (its money ledger `UnitMoney` and history). The person's khata (statement) stays as it is.
- No new money rules, no migration.
**Consequences**: a group payment larger than the open bills leaves the rest on the khata, as an unallocated payment does today.

## ADR-067 · 2026-11-13 · Accepted · What was paid at a purchase can be put right, even after its phones are sold
**Context**: in a live shop a salesman entered purchases as "paid in full in cash" that really came on udhaar. Some of those phones were already sold. The owner needs the dealer's khata to show what is owed and the cash to be right, without disturbing the sales.
**Decision**:
- `GET /purchases/{id}/paid` returns `paid_at_purchase`, `paid_later` (payments allocated to the bill later) and `max_at_purchase`.
- `POST /purchases/{id}/paid {paid_now, payment?, due_date?, reason}`. Owner / manager only (`Cap.VOID`).
- Nothing is erased. One correction group (`purchase_paid_change`) moves the difference:
  - less paid: debit the money account the bill was paid from, credit the seller's khata;
  - more paid: debit the khata, credit the chosen account (cash / online / cheque).
- The group is dated like the purchase; when that day's cash for that account is already closed, it is dated today.
- `purchases.paid` moves by the difference; payments made later stay.
- The bill's payment details follow: removed at 0, amount updated when lowered, added for a non-cash extra.
- An optional new promised date is set.
- Each phone gets a neutral `corrected` event (`field: paid`), and an audit row is written.
- The phones' status, cost and sales are not touched, so it works after a sale.
- Refused for a purchase made by an exchange (its money is the trade-in's) and for a voided one.
- UI: **Change what was paid** on the purchase page (opens with `?paid=1`) and on the phone's page (also a sold phone). The sheet has **Nothing paid (all udhaar)**, **Paid in full** or an amount, how the extra was paid, a promised date, a live effect line and the reason.
- No migration.
**Consequences**: a correction dated today (closed day) shows in today's cash, not the purchase day's. The memo names the purchase.

## ADR-066 · 2026-11-12 · Accepted · A faulty phone says what is wrong, stays in stock and can be sold; a model link filters by id
**Context**: in a live shop:
- "iPhone 17" in the stock summary opened the 8 "iPhone 17 Pro Max" too: the link searched the model's name.
- "Mark faulty" said nothing about the fault.
- A faulty phone left the stock list (only the Faulty card showed it) and could not be sold.
**Decision**:
- **Model link.** The stock summary and the audit's products page open `/stock?model_id=…&model=…`. The stock page filters by `model_id`, shows a "Model: X" chip with **Show all**, and the Download / Share export follows it. No backend change; `list_devices` already took `model_id`.
- **Faults.**
  - Additive migration `c3e5a7b9d1f4` adds `devices.faults` (JSON, nullable).
  - `marked_faulty` with `data.faults` stores the list: trimmed, de-duplicated, 12 at most, 40 chars each. `faulty_cleared` empties it.
  - `types.FAULTS` lists 24 common faults with en / ur names. `/devices/options` returns them plus the shop's own words already used.
  - A faulty phone can be marked again to change its faults (`FAULTY → marked_faulty → FAULTY`).
  - The sheet has the chips, an "Another fault" + box and a note.
- **Faulty is stock and sellable.**
  - New transition `FAULTY → sold`. The sale accepts a faulty unit.
  - `list_devices(status=in_stock, with_faulty=true)` lists in-stock and faulty units. The stock page's default view and the sale's picker use it; plain `status=in_stock` is unchanged for every other caller.
  - Cards, rows, the phone's page and the sale line show a red "Faulty: …" chip.
  - The bill prints "Sold as faulty: …" under the unit.
  - The status cards keep their own counts ("Available to sell" still excludes faulty; "Damaged / faulty" counts them).
**Consequences**:
- A phone marked faulty before this change has no list of faults (shows "Faulty" only) until it is edited.
- The faults stay on a sold phone so its bill keeps saying so.

## ADR-065 · 2026-11-12 · Accepted · A sale asks who is buying; the customer can be changed after the sale
**Context**: a salesman left a sale on "Walk-in customer" by mistake (every sale started as walk-in). The owner wants the customer search in front, walk-in as a deliberate tick, and the customer changeable after the sale, so the phone's history shows who took it.
**Decision**:
- **Sale form.** The customer box ("Who is buying?") shows the search directly, with a "Walk-in customer (no name)" checkbox under it.
  - **Complete sale** stays off until a customer is chosen or walk-in is ticked.
  - Udhaar / installments already required a customer.
  - Frontend only.
- **After the sale.** `POST /sales/{id}/customer {party_id, reason}`, owner / manager only (`Cap.VOID`).
  - Nothing is erased. One correction group (`sale_party_change`), dated like the sale:
    - walk-in → customer: the bill shows in the customer's khata as bought and paid (debit and credit the same party; net nothing). The cash came in at the sale.
    - customer → customer: the bill total and what was paid with it move from the old khata to the new one, as in ADR-056 for purchases.
  - The invoice's `party_id` changes.
  - Each phone gets a `corrected` event (`field: customer`). A still-sold phone's `current_party_id` follows.
  - An audit row is written.
  - Refused (`sale_has_later_money`) once a payment was allocated to the bill later, something was returned, there is an exchange or installment plan on it, or its extra cash went against the old person's udhaar.
- **UI.**
  - The bill page has **Put on a customer** (walk-in) / **Change customer**. It opens itself with `?change=1`.
  - The sold phone's page has **Change customer** (Classic button; beside "Sold to" in Smart / Tabs / Tiles).
- No migration.
**Consequences**:
- Cash sales need one more tap (the walk-in tick); this is intended.
- A bill already sent to FBR keeps its FBR record as sent.
- A walk-in bill put on a customer can then be returned through the normal return flow.

## ADR-064 · 2026-11-10 · Accepted · A person's mobile number is optional; "bought from" reads the bill
**Context**:
- Shopkeepers add many people with no number (walk-in sellers, one-time buyers), but the form required one.
- After "Change dealer / customer" (ADR-056), the stock list's "Bought from" still showed the old person.
**Decision**:
- Migration `b9d1f3a5c7e2` drops NOT NULL on `parties.phone`. Every existing row keeps its number. The unique `(shop_id, phone)` key stays (NULLs never clash), so a number is still unique when given.
- API: `phone` is optional on create and update, and `null` in responses.
- The form shows "Mobile number (optional)".
- Places that send WhatsApp or reminders already skip a person without a number. Printed slips print no number.
- `devices.with_source` and the `supplier_id` stock filter take a purchase bill's person from `purchases.party_id` (current). The `purchased` event still keeps who it was then.
**Consequences**:
- The bulk Excel import still asks for a number, because the number is its match key.
- Search by phone simply does not find people without one.

## ADR-063 · 2026-11-10 · Accepted · A phone's purchase price can be put right while the shop holds it
**Context**: shopkeepers type a wrong purchase price when adding stock. There was no way to correct it after saving.
**Decision**:
- `POST /purchases/cost {device_id, cost, reason}`. Owner / manager only (`Cap.VOID`).
- Allowed only while the phone's latest intake is a purchase bill and the shop still holds it (in stock, faulty, in repair, with a customer on approval, on loan), with no sale since.
- Nothing is erased: one correction group (`purchase_cost_change`), dated like the purchase, moves the difference between Inventory and the seller's party account.
  - Higher price: more to give the seller.
  - Lower price: less, or the seller owes the shop if it was already paid.
  - Cash never moves.
- The purchase line (`unit_cost`, `net_cost`), the bill's `subtotal` / `total` and `devices.cost_price` move by the difference. Lab charges already added to the phone's cost stay.
- A `corrected` device event (`field: cost`, from → to, reason) and an audit row are written.
- Phone page: **Change purchase price** (Classic button; beside the cost in Smart / Tiles). The sheet shows the effect on the seller's khata before saving.
- No migration.
**Consequences**:
- A phone already sold is refused (`cost_after_sale`): its cost is in that sale's profit. The way is a return, then the change.
- Items (accessories) bought on a bill are not covered yet: their cost sits in FIFO batches.

## ADR-062 · 2026-11-10 · Accepted · On udhaar, the part paid now keeps its own way of paying
**Context**: a sale or purchase on udhaar with something paid now always booked that part as cash. Shopkeepers often take or give that part by JazzCash / bank or a cheque and want it recorded.
**Decision**:
- When **Udhaar** is chosen and "Paid now" is more than 0, the form asks how that part was paid. The choices are Cash, Online and Cheque, with the same bank / TID / cheque fields as a normal payment (`PartPay` in `PayPicker.tsx`).
- The bill's `payment` is that part's details (`billPayment`). The API already accepted `payment` with `paid < total`, so the money lands in that account (bank / wallet / cheques) and `payment_details` keeps the reference.
- Frontend only. No API, data or migration change. The default stays Cash, so nothing changes unless it is chosen.
**Consequences**: the receipt and bill detail already show the payment's method, so the part paid now shows its way there too.

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

