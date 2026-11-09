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
IMAGE_TAG=$(cat .current-tag) docker compose --env-file .env up -d backend
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
#    starts; this only confirms it). Expected: e1a3c5e7f9b2 (head)
docker compose --env-file .env exec backend alembic current
```

| Done | Command | Why |
|---|---|---|
| [ ] | keygen (1) | without it Business → Keys and "Renewal code" fail with "RENEWAL_PRIVATE_KEY is not set" |
| [ ] | barcode backfill (2) | old phones and items get a barcode; the button Settings → Barcode settings → "Barcodes for old stock" does the same per shop |
| [ ] | `alembic current` (3) | confirms migrations through `b3d5f7a9c1e4` (barcodes, accessories, tablets / watches, provider console, business profile, len-den, len-den return dates, repair labs, … , fees given on credit, deleted customers, iPhone region / SIM) |

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

**Demo shop with sample data in every module** (2026-11-02): `cd frontend && node scripts/demo-shop.mjs`
with the backend running. Locally it made "Demo Mobile Centre": owner `03001112233`, manager
`03221112233`, salesman `03331112233`, password `demo12345` — about two months of purchases
(cash / credit), sales (cash, udhaar, part paid, discount, tax, installments, wholesale, Easypaisa,
bank), returns both ways, a void, a price change, ID checks (pending / flagged / skipped with a
reason), tablet, watch, accessories by the dozen, a loan to another shop, repairs, bank deposit,
supplier payments, expenses. For the live server: `API=https://<domain>/api/v1 PHONE=03xxxxxxxxx
node scripts/demo-shop.mjs` — only if you want a demo shop on production.

**User manual for buyers** (2026-11-03): read `docs/manual/Mobile-Shop-User-Manual-en.pdf`, `-ur.pdf`
and `-roman.pdf` (26 chapters, 49 screenshots each) before giving them to shops. Check the Urdu
wording in particular. The home screenshot shows the demo shop's day with a loss (demo expenses);
say if you want a retake with a profitable day. How to edit and rebuild: `docs/manual/README.md`.

**Branch transfers** (2026-11-04): in a shop with two branches, open a phone → **Send to another branch** → pick the branch → add a charger × 2 → **Send now**. Check:
1. The phone shows "Sent to a branch" here, and in the branch (switch shop in More) it is in stock with the same IMEI and price.
2. More → Branch transfers lists it in both shops.
3. Reports → Balance is still balanced in both shops.

**Tax invoice details** (2026-11-06):
1. More → Settings → turn on **Phones: sales tax paid at import** (if you sell phones with tax bills).
2. Sell a phone and a charger with **Add tax to this bill** ticked: tax only on the charger.
3. Type **Cash given by the customer**: the change shows. Print the bill: it shows total excl. tax, tax by rate, the phones' note, cash given / change, the cashier, the time and the amount in words.

**FBR live reporting (decision / credentials):** see `docs/36-FBR-INVOICING-RESEARCH.md` §5. That needs a test business's NTN + STRN with IRIS access (DI sandbox token or a test POS ID), plus a tax adviser's confirmation.

**Accounts after the audit** (2026-11-05):
1. More → Cash & bank. If the galla shows a red note, tap **Set the opening balance** and type the cash that was in it on the first day.
2. Reports → Balance: both sheets say "Balanced", and "Stock at cost" is not below zero.
3. Sell a typed item (+ Charger, cover or other item) with a buying price. The stock value does not change, and the profit is price − buying price.

**Repair status link** (2026-11-05): open a repair job for a customer with a phone number → **Send status link to customer** → **Send on WhatsApp**. Open the link on another phone (not logged in): the steps, ready-by day and what is left to pay show; the customer's number and full IMEI do not. Move the job to "In progress" and refresh the link.

**Bill QR + Appearance** (2026-11-07): make a sale → **Print** → scan the QR under the bill with another phone (not logged in): the bill opens with total, paid and what is left, without the customer's name or number. Settings → Business profile → Printed bill → switch "QR code to see the bill online" off and print again: no QR. Dashboard → **Appearance**: try Tiles, Simple and Bold on the laptop and phone, a main colour, Large text and Dark; reload; then **Back to default**.

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
| [ ] | Len-den (money with no bill) | open a person → Len-den card → "Took money (len-den)" 5,000; later sell them a phone on udhaar → "Adjust now" | card shows what is len-den vs bills; the bill becomes paid; Shop audit → Len-den shows given / taken / open; Hisaab and cash say "Len-den", not "Udhaar received" |
| [ ] | Repair labs | Repairs → Repair labs → Add a lab (name, mobile, market); a repair job → Send to a lab → Back from lab (charge, paid now) | the lab's record shows the phone, fixed %, what you owe; Audit → Repairs shows income, lab charges, profit |
| [ ] | Repair sticker | a repair job → Print sticker → tick the fields → Print on your label printer → scan it on Home | sticker with the details you picked; the scan opens the job |
| [ ] | Seller signs on the screen | buy a used phone → ID check → the seller signs in the box → Use this signature → Save → Print declaration | the printed declaration shows the signature |
| [ ] | Help "?" everywhere | open any screen in Urdu and in English → tap the small ? next to a card, tab or field | a sheet with what it is and an example; tell me any text that is unclear or wrong |
| [ ] | Len-den reminder | demo shop → Tariq Bhai → Send reminder; Settings → Notifications → udhaar reminders on | WhatsApp opens with "Rs. 15,000 … was to come back on …"; home shows "people late returning len-den" and "len-den the shop must give back soon" (Star Mobiles) |

**Package on credit (2026-11-09, ADR-053)** — in Super admin open a test shop, "Give the package now, fee later": 2 months, check the amount, a note, "Extend on credit". Log in as that shop's owner: More → Software fees shows "Fee still to pay … Not paid", the fee invoice, and no note. Report Rs. 1,000, approve it: "Part paid", the package date does not move.

**Delete a customer (2026-11-09, ADR-054)** — in Super admin open a test shop, scroll to "Delete this customer", Delete shop, type its name, a reason, Delete. Try to log in as that shop's owner: "This shop has been closed". The shop is gone from the list and shows under the "Deleted" filter; open it, "Bring it back", and log in again: everything is there.

**iPhone region code and SIM (2026-11-09, ADR-055)**: in Buy → Add device, choose Apple → an iPhone. Under Colour, the form asks for the **Region code** (tap LL/A) and the **SIM** type (tap Dual eSIM). Tap **New** to add a code that is not in the list. Save the device. Choose **Used** and fill **Battery health %** 91 and **Battery cycle count** 312. The stock line and the price sticker should show "LL/A · Dual eSIM · Battery 91% · 312 cycles".

## E. Decisions waiting for you

| Done | Question | Now |
|---|---|---|
| [ ] | Grace days after plan end: 7 or 15? | 7 |
| [ ] | Freight on a purchase: owed to the supplier (on his bill) or a separate expense? | on the supplier's bill |
| [ ] | Per-item GST on the invoice? | item rate is stored, the bill uses the shop's tax rate |
| [ ] | Lock check also for used **mobiles**? | off (tablets / watches always) |
| [ ] | Tablet / watch page money card still says "Money on this phone" — change to "this device"? | not changed |
| [ ] | One-PC installs: give each the `SAAS_URL=https://<your domain>` line so they report to Business | not set |
| [x] | Item GST %: should a sale bill use the item's own rate? | **yes (owner 2026-11-03)**: when the bill is taxed, an item with its own GST % is taxed at it; others take the bill's rate; untaxed bills stay untaxed; the bill prints "Tax (by item)" |
| [x] | Purchase form: rename "Supplier invoice no." to "Reference / slip no."? | **yes (owner 2026-11-03)**: renamed in en / ur / roman |
| [x] | Super admin → password request from a staff member: change the requester's password? | **yes (owner 2026-11-03)**: opened from a request, "Set password" shows and changes that person's password; "Set the owner's instead" switches back |

## F. Found while writing the operations runbook (2026-11-03)
Details in `docs/manual/operations-en.md`. None of these is broken today, but each is worth a look:
- [ ] **Renewal key on the server:** run the renewal keygen on the server. Until then production checks codes with the default public key, so codes signed with the development PC's key would be accepted.
- [ ] **Off-server backup:** `RCLONE_REMOTE` is not set, so every backup sits on the same VPS. Set it up and practise one restore.
- [ ] **Android signing:** check that the three `ANDROID_KEYSTORE_*` GitHub secrets exist (`gh secret list`). Without them `/app.apk` is test-signed, and a properly signed APK cannot update it later.
- [ ] **Old Docker images:** `deploy.sh` removes only untagged images. Once a month run `docker image prune -a --filter until=168h` on the server.
- [ ] **Server IP in git history:** it was in two comments (removed 2026-11-03), but older commits still have it. If the repo ever goes public, assume the IP is known and keep SSH key-only.
- [ ] **Settings the compose file does not pass:** `SCHEDULER_ENABLED`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `DEFAULT_LOCALE`, `TIMEZONE`, `SAAS_URL`, `WHATSAPP_API_VERSION` in the server `.env` have no effect today (the defaults are used). Say if one of them should be settable on production.
- [ ] **Demo shop on production:** `demo-shop.mjs` uses signup, which production keeps off (403). Open the shop from Super admin first if you ever want one there.
- [ ] **Trial end date:** a new shop starts with no end date, even on trial. Set **Paid until** yourself, or decide that a trial should end by itself after 14 days.

## G. Google Play Store (owner question 2026-11-03)
Today the app is shared as an APK from `/app.apk`. Putting it on Play needs a developer account (yours) and some app changes (ours).

**Your side: the account**
- [ ] Decide the account type. **Organization (OOP Solutions) is recommended.** It shows the company name on the listing and skips the rule for new personal accounts (12 testers must keep the app installed for 14 days before it can go public). It needs a **D-U-N-S number** for OOP Solutions. That number is free from Dun & Bradstreet, takes from a few days up to about 30, and the company name must match exactly everywhere.
- [ ] A Google account just for publishing (e.g. a company Gmail), a phone number, the company website (`oopsolutions.com`) and a support email.
- [ ] Open `play.google.com/console`, choose the account type, fill in the details, and pay the one-time **US $25** with a card that works for international payments. Then finish the identity check (CNIC / company documents).
- [ ] **Decide the package name before the first upload; it can never change.** Today it is `pk.mobileshop.app`; `com.oopsolutions.mobileshop` is an alternative.
- [ ] Give us: a privacy-policy contact email, and a demo login (phone + password) for Google's reviewers.

**Our side: changes before the first upload** (not done yet)
- [ ] Target Android 16 (API 36): Play has required it since 31 Aug 2026; the app targets API 34 on Capacitor 6, so Capacitor must be upgraded.
- [ ] Build an **AAB** (`bundleRelease`) in `android.yml` next to the APK; Play takes only AAB.
- [ ] Signing: keep the same key for Play App Signing (the `ANDROID_KEYSTORE_*` secrets, see F). Then phones that installed `/app.apk` keep getting updates through Play.
- [ ] A public **privacy policy** page (e.g. `/privacy`) in en / ur, and an **account / data deletion** page or request route. Play asks for both URLs.
- [ ] Store listing material: app icon 512×512, feature graphic 1024×500, phone screenshots (we have them from the manual), short and full description in English and Urdu.

**In Play Console after that (together)**
- [ ] App content forms: privacy policy URL, Data safety (we collect phone numbers, CNIC and its photos, photos for the ID check, and sales data; data is encrypted in transit; deletion on request), content rating questionnaire, target audience 18+, no ads, app access (the demo login).
- [ ] Upload the AAB to **Internal testing** first, then **Production**. Google's review usually takes a few days.

## H. FBR live invoicing (owner 2026-11-06: "abhi mere paas nahi, main search karta hun")
**Our side is ready (2026-11-06, ADR-050).** When you have the items below: More → Shop settings → **FBR Digital Invoicing** → paste the token → choose **Sandbox** → **Save** → **Test with FBR**. When the test passes, switch on **Send bills to FBR**, check a few bills, then move to **Production** with the production token. Details in `docs/36-FBR-INVOICING-RESEARCH.md` §5. What is needed:
- [ ] **NTN** and **STRN** of the business (or a test business) that will report to FBR.
- [ ] **IRIS access** for it, to get a **Digital Invoicing sandbox token** (IRIS → Digital Invoicing → integration / sandbox) and later the production token. For Tier-1 POS instead: a **test POS ID** (IRIS → POS client registration).
- [ ] **Tax adviser's confirmation**:
  - the current standard GST rate (17% or 18%);
  - phones under the Ninth Schedule at retail (no tax on the bill);
  - PCT / HS codes (phones `8517.1300`?, chargers, covers);
  - whether repair bills need the provincial (PRA / SRB) system.
- [ ] Decide who to target first: registered dealers (Digital Invoicing) or Tier-1 plaza shops (POS).
