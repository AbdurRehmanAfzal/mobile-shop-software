# 21 · Owner setup checklist — subscription reminders (before manual testing)

For Abdur Rehman Afzal, 2026-10-31. Everything here is yours to fill in or decide; the software
ships with placeholders that stay hidden from shopkeepers until you replace them.
**The full, current list of what is still open on your side is `docs/29-OWNER-PENDING.md`.**
Spec: `docs/19-SUBSCRIPTION-REMINDERS-SPEC.md` · design and assumptions: `docs/20-SUBSCRIPTION-REMINDERS-PLAN.md`.

## 1. Settings you fill in the app (Super admin)

Log in with the super-admin number → More → Super admin → **Fees** card.

| Button | What to enter | Shown to shopkeepers as |
|---|---|---|
| **Billing settings** → Bank | Bank name · Account title · Account number · IBAN · Branch | the first block of the popup and of More → Software fees, each line with a Copy button. While any of these still says `PLACEHOLDER`, the whole bank block is hidden. |
| **Billing settings** → Support | Support phone · Support WhatsApp (e.g. `+92 316 4001668`) | the "WhatsApp us" button (prefilled with the shop's name and plan). Until changed from `+92 300 0000000` the app falls back to the number in `AuthLayout.MAKER`. |
| **Billing settings** → Reminder schedule | Yellow bar from **7** days · Orange bar + popup from **3** · Red bar + popup from **1** · Grace days after expiry **7** · Snooze hours **4** | the stages in §3. These are the spec's defaults; change them here, no deploy needed. |
| **Billing settings** → Note (en / ur / roman) | optional one-liner, e.g. "Send the screenshot on WhatsApp after paying" | under the warning text in the popup |
| **Accounts** | Easypaisa / JazzCash / SadaPay / bank wallets: label, account name, number, note | the wallet rows under the bank block (this existed before; it is reused) |
| per shop → **This shop's grace days** | empty = the schedule's default; a number overrides it for that shop only | — |

Optional QR: upload an image through the files API with purpose `billing` and put its path into
`platform_settings.billing.qr_path` (the sheet does not upload it yet). It then appears under the
payment details in the popup.

## 2. Settings on the server (`backend/.env`)

| Key | Why | How |
|---|---|---|
| `RENEWAL_PRIVATE_KEY` | signs renewal codes (Super admin → shop → Renewal code) | run `python -m app.modules.plan.renewal keygen` once on the VPS; paste both lines; **keep the private key only on the SaaS server** |
| `RENEWAL_PUBLIC_KEY` | every install verifies codes with it, also the Windows one-PC build | same keygen output; for the Windows build put it in that install's settings too |
| `ADMIN_WHATSAPP` (or the first number in `SUPERUSER_PHONES`) | receives "fee proof submitted" and "new shop request" | already in use |
| after deploy | new tables / columns | nothing to run: the backend runs `alembic upgrade head` when it starts (see docs/29 §B) |

The pair in the development PC's `.env` is a dev pair; generate a fresh one for production.

## 3. What a shopkeeper sees, stage by stage (for your manual test)

Simulate with Super admin → shop → **Paid until** date (or the +1 / +3 / +12 month buttons).

| Set "paid until" to | Bar | Popup | Snooze choices | Notes |
|---|---|---|---|---|
| today + 10 | none | none | — | plan "ok" |
| today + 7 … + 4 | yellow | none | — | info only |
| today + 3 … + 2 | orange | once a day (login, Home, or idle on a list) | 4 h · tomorrow · 3 days — never past the expiry | Close (X) = until tomorrow |
| today + 1 and today | red | on login, again after 4 h | 4 h only | "ends tomorrow / ends today" |
| yesterday … −7 | red, "grace days left" | on every login, again after 4 h | 4 h · tomorrow | still fully working |
| −8 and older | dark red + full-screen notice | notice instead of popup | — | soft-lock: view / export / backup / pay work, sale and purchase refused |
| proof submitted, not yet verified | calm blue "Payment received, verification pending" | none | — | any stage |
| verified | bar gone | "Thank you, renewed until …" once, with the receipt number | — | receipt prints from the card and from More → Software fees |

Moving to a more urgent stage shows the popup again even if it was snoozed in a calmer one.
A salesman sees only the bar's short line ("please inform the owner"), never the popup or the
payment details. The popup never opens on the sale, purchase, return or payment screens.

## 4. Your side of a renewal (three ways)

1. **Proof from the shop**: the owner presses Pay fee now → amount, paid-on date, transaction ID,
   screenshot → you get a WhatsApp line → Super admin → Fees → Approve (+N months). Receipt
   `SUB-0001…` is made, the shop sees the thank-you.
2. **Money received by hand**: Super admin → shop → **Record a payment** (amount, months, method,
   paid on) → verified at once, receipt made, plan extended.
3. **Renewal code** (offline shops): Super admin → shop → **Renewal code** (months) → Send on
   WhatsApp → the owner pastes it in More → Software fees → Renewal code. Signed, tied to that
   shop, works once.

## 5. Things to decide

- Grace default is **7 days** now (the spec's number); it was 15 before. Change it in Billing
  settings if you prefer 15.
- The popup shows English + Urdu + Roman together on purpose (spec §C). Everything else stays
  one language at a time.
- The backup button gives a zip of CSV files; the Windows install's tray also copies the database.

## 6. Where to look if something is off

- `GET /api/v1/plan/reminder?event=login` (as the shop owner) returns the stage, `show_popup`,
  the snooze choices and the billing block the popup uses.
- Audit log (More → Settings → Audit): `plan_reminder/snooze`, `fee_payment/report|verify|reject`,
  `organisation/lock|unlock|renewal_code|renewal_code_issued`, `shop/backup`, `billing/update`.
- Tests: `backend/tests/test_plan_reminders.py`, `frontend/e2e/plan-reminders.spec.ts`.
