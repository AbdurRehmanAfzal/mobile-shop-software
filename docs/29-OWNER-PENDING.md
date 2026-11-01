# 29 · Owner's pending list — server setup, commands, manual testing, decisions

For Abdur Rehman Afzal. Written 2026-11-01 because, as you said, nothing on your side has been done
yet: no manual testing, no environment variables on the server, no server commands. Everything
below is still **open**. Tick it here as you go (`[x]`), or tell Claude and it will update this file.

Older, more detailed notes stay valid: subscription reminders `docs/21-OWNER-SETUP-CHECKLIST.md`,
barcode scanner test `docs/23-BARCODES-PLAN.md`, accessories `docs/25`, tablets / watches `docs/27`,
provider console `docs/28`.

---

## A. On the server (VPS) — environment variables

File: `/opt/mobileshop/.env` (never commit it). After editing, restart the backend:

```
cd /opt/mobileshop
docker compose --env-file .env up -d backend
```

> Fixed 2026-11-01: `deploy/docker-compose.yml` did not pass most of these to the backend container,
> so setting them in `.env` had no effect (renewal keys could not be made on production at all).
> The fixed compose file reaches the server with the next deploy (`deploy.sh` downloads it).
> Do section A **after** that deploy.

| Done | Key | What it does | What to put |
|---|---|---|---|
| [ ] | `SUPERUSER_PHONES` | your super-admin login number(s) | e.g. `03001234567` (check it is already there) |
| [ ] | `ADMIN_WHATSAPP` | you get "fee proof submitted" and "new shop request" messages | your WhatsApp number; empty = first `SUPERUSER_PHONES` |
| [ ] | `RENEWAL_PRIVATE_KEY` | signs license / renewal keys (Business → Keys) | from the keygen command in section B; **only on this server** |
| [ ] | `RENEWAL_PUBLIC_KEY` | checks keys (cloud and every one-PC install) | same keygen output |
| [ ] | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATES` | automatic WhatsApp (reminders, night report, OTP) | from Meta Business (docs/12); empty = messages are sent by hand |
| [ ] | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | emails | Gmail: `smtp.gmail.com`, `587`, an app password |
| [ ] | `ANTHROPIC_API_KEY` | the assistant and photo reading (CNIC / box label) | your Claude API key; empty = "not switched on" |
| [ ] | `AI_DAILY_LIMIT` | calls per shop per day | `200` (default) |
| [ ] | `RCLONE_REMOTE` | off-server copy of the nightly backup | e.g. an encrypted Google Drive remote |
| [ ] | `SIGNUP_OTP` / `OTP_DEV_ECHO` | phone code at signup / test echo | `false` / **always `false` on production** |

## B. On the server — commands still to run

```
cd /opt/mobileshop

# 1. a production key pair for license / renewal keys (once). Paste both printed lines into .env,
#    then restart the backend (section A).
docker compose --env-file .env exec backend python -m app.modules.plan.renewal keygen

# 2. barcodes for stock entered before barcodes existed (once; safe to run again)
docker compose --env-file .env exec backend python -m app.modules.barcodes.backfill

# 3. check the database is on the latest version (migrations run by themselves when the backend
#    starts; this only confirms it). Expected: c1e3a5b7d9f1 (head)
docker compose --env-file .env exec backend alembic current
```

| Done | Command | Why |
|---|---|---|
| [ ] | keygen (1) | without it Business → Keys and "Renewal code" fail with "RENEWAL_PRIVATE_KEY is not set" |
| [ ] | barcode backfill (2) | old phones and items get a barcode; the button Settings → Barcode settings → "Barcodes for old stock" does the same per shop |
| [ ] | `alembic current` (3) | confirms migrations through `c1e3a5b7d9f1` (barcodes, accessories, tablets / watches, provider console) |

Not needed any more: running `alembic upgrade head` by hand (the backend image does it on start);
the accessories "Opening stock" batches (made by the migration).

## C. In the app — settings only you can fill

| Done | Where | What |
|---|---|---|
| [ ] | Super admin → Fees card → **Billing settings** | bank name, account title, account number, IBAN, branch, support phone / WhatsApp; until then shopkeepers do not see payment details |
| [ ] | Super admin → Fees card → **Payment accounts** | Easypaisa / JazzCash / SadaPay numbers |
| [ ] | Billing settings → schedule | grace days after expiry: 7 now (decide, section E) |
| [ ] | Super admin → each shop | package, monthly fee, paid-until date |
| [ ] | Business → Shops → a shop → "Where it runs" | mark one-PC customers as Offline |
| [ ] | your own shop → Settings → Logo & business details / Tax registration / Currency | logo, NTN, how money is written |
| [ ] | your own shop → Settings → Barcode settings | prefix and barcode type, test print |
| [ ] | Settings → Item settings / Device settings | valuation (average / FIFO), negative stock, units; lock check for used mobiles |
| [ ] | every shop that printed stickers since 2026-10-31 | **reprint them** — those stickers were cut and do not scan (fixed 2026-11-01) |

## D. Manual testing (nothing tested by you yet)

Close the app fully and open it again first (or install the newest APK from the latest Deploy run →
`android / apk`), so the newest version loads.

| Done | Feature | Try this | Expect |
|---|---|---|---|
| [ ] | Subscription reminders | Super admin → a test shop → paid-until today + 3 → log in as that shop | orange bar + popup in three languages; details in docs/21 §3 |
| [ ] | Pay fee | as the shop: More → Software fees → Pay fee now → screenshot | you get WhatsApp; Super admin → approve → shop sees "thank you" with SUB receipt |
| [ ] | Barcodes | Add stock (phone) → Stickers → print on your label printer → scan with a USB scanner on Home | phone page opens; scanned in Sale it is added |
| [ ] | Stock count | Stock → Stock count → scan the shelf → Check | found / missing / should not be here |
| [ ] | Accessories by dozen | Add stock → dealer → Add accessory / watch → New item (brand, quality) → Dozen chip, 2 dozen at 1,200 | 24 pieces, Rs. 100 each; item page shows the batch and history |
| [ ] | Dealer price | mark a customer "Dealer / wholesale" → sell that item to them | wholesale price filled; under minimum price needs the manager |
| [ ] | Tablet / watch | Add device → Tablet (Wi-Fi + SIM) → More details (RAM, OS) → save; next tablet same model | specs fill from the library |
| [ ] | Lock check | Add device → Smart watch → Used | "Add" stays off until "Lock checked and removed" |
| [ ] | Change type | a phone that is really a watch → device page → Change type | history, IMEI, barcode stay |
| [ ] | Business console | Super admin → Business → Overview / Shops / Payments / Keys | your real fees, channels, time left |
| [ ] | License key | Business → Keys → Make a key → Send on WhatsApp → open the link on your phone | key page opens without login; Renew makes the old link expire |
| [ ] | Bulk Excel | More → Bulk Excel → download sheet → fill → upload | preview first, then import |
| [ ] | Business profile | Settings → upload your logo, fill Logo & business details, Owner, Tax registration (NTN), Currency, Printed bill → print a sale bill | logo, NTN, terms on the bill; money written your way everywhere |
| [ ] | Landing page | open the website logged out | new cards, screenshots, scanner FAQ |

## E. Decisions waiting for you

| Done | Question | Now |
|---|---|---|
| [ ] | Grace days after plan end: 7 or 15? | 7 |
| [ ] | Freight on a purchase: owed to the supplier (on his bill) or a separate expense? | on the supplier's bill |
| [ ] | Per-item GST on the invoice? | item rate is stored, the bill uses the shop's tax rate |
| [ ] | Lock check also for used **mobiles**? | off (tablets / watches always) |
| [ ] | Tablet / watch page money card still says "Money on this phone" — change to "this device"? | not changed |
| [ ] | One-PC installs: give each the `SAAS_URL=https://<your domain>` line so they report to Business | not set |
