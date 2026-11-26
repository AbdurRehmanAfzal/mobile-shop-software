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
| [x] | `RCLONE_REMOTE` | off-server copy of the nightly backup | set to `gdrive-safe:` (2026-11-17) |
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
#    starts; this only confirms it). Expected: a7c9e1b3d5f8 (head)
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
| [ ] | Super admin → a shop → modules | switch on **Login activity** for each shop whose owner should see logins (ADR-074); the owner logs in again to see the tile |
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

**Corrections and check before saving (2026-11-09, ADR-056)**:
1. Add stock on udhaar. A **Check before saving** screen appears. Save stays grey until you tick it.
2. On the phone's page, **Correct IMEI**: change one digit and give a reason. The history shows the old and the new IMEI.
3. On the purchase (**More → Purchases**), **Change dealer / customer** to another person. The old person's khata is clear and the new one owes the amount.
4. Pay something against a second purchase, then try to change its person: it is refused.

**Exchange and return settlement (2026-11-10, ADR-057)**:
1. Sell a phone to a test customer for 80,000 cash.
2. Exchange: take it back at 70,000, give a 55,000 phone, and pay 5,000 now. The screen and the bill say "To give to customer 10,000". The khata shows -10,000. Pay 4,000, then 6,000: settled.
3. Return another 80,000 sale: give 30,000 now and pick Customer's khata. You should see "To give to customer 50,000".

**Open balances (2026-11-10, ADR-058)**:
1. Udhaar → **Get / give**.
2. Buy a phone from a dealer on udhaar and sell it to a customer on udhaar. The phone's row shows both Get and Give.
3. Open the row, **Receive payment** 5,000, then **Make payment** to the dealer. The totals go down and the customer's and dealer's khata match.

**Reserve and shelf (2026-11-10, ADR-060)**:
1. Reserve a phone for a test customer. Selling it to another customer is refused; selling it to the same customer works.
2. Reserve 2 of 6 chargers. Selling 5 to someone else is refused; 4 sells.
3. Give a phone a shelf (Rack A2) and search for it.
4. Add a Non-PTA phone without SIM time.

**Business overview and the staff tally copy (2026-11-14, ADR-076 / 077)**:
1. Home → **Business overview**. Pick Today: the sales, purchases, money in / out and the people lists match the day's bills; tap **View details** on a few cards.
2. Stock → What is my stock worth? → **Staff copy (no prices)** → Print: no price or amount on the paper.
3. Log in as a salesman → the same page → **Ask the owner for the sheet**. As the owner, the home screen shows the request → **Allow**. The salesman now prints the staff copy only. **Take back** stops it.

**Stock lists on A4 and price lists (2026-11-15, ADR-078)**:
1. Stock → **Fields**: pick many fields → **Download** → PDF: it fits A4, one row a phone.
2. Stock → **Price lists** → For the staff → Print (A4): every detail with the sale price, no cost.
3. For customers → Share on WhatsApp: no IMEI and no cost; only phones for sale.
4. Download any report (sales, purchases) as PDF and print it on A4.

**WhatsApp entries (2026-11-15, ADR-079)**:
1. More → **WhatsApp entries** → Write a message → Sale: fill it and **Send on WhatsApp** to a test group. **Copy blank form** and pin it in the group.
2. Copy that message from WhatsApp → Enter from a message → Paste: the phone shows "In stock" and the customer is found → **Open the sale, filled** → check and save.
3. Send a hand-written purchase ("khareeda … IMEI … qeemat 30k … jama 10000 cash") and enter it the same way; try **IMEI from photo** with a photo of the box.
4. A payment and a len-den message → the payment form opens with the amount.

**Login security (2026-11-15, ADR-080)** — try it on a test shop first:
1. More → **Login security** → switch on **Only phones I allow** → **Log out all staff now**.
2. Log in as a salesman on a phone: "This phone is new…". As the owner, the home screen shows the phone → **Allow**. The salesman taps Login again and gets in.
3. Try the same salesman's password in another browser: it waits. **Say no** → it is refused.
4. **Staff login hours** 10:00–22:00: a salesman cannot log in after 22:00. The owner always can.
5. If a salesman's phone is lost: **Take back** that phone.

**Return to the seller (2026-11-15, ADR-081)**:
1. Buy a test phone for 50,000 and pay 25,000. Open the phone → **Return to the seller**: it shows 25,000 cancelled and 25,000 to get back → Return it. The seller's khata reads zero; the phone shows "returned to the seller".
2. Try it with a cut of 5,000 and receive less than shown: the rest stays in the seller's khata.

**PTA check (2026-11-15, ADR-082)**: open a phone → **PTA check** → PTA website: on the PTA page long-press → Paste, tick, CHECK → back in the app tap what PTA said. On a phone, try **SMS to 8484** too.

**CP ID name (2026-11-15, ADR-083)**: Shop settings → Device settings → Name for CP ID phones → tap ★ → Save. Open a CP ID phone (it shows ★) and print the stock tally sheet (★ instead of CP ID).

**A4 reports (2026-11-15, ADR-084)**: Business overview → This month → Download → PDF, and print it. Shop audit → Full shop audit report (A4) → Download → PDF / Excel.

**Locked phones (2026-11-15, ADR-085)**: Purchase → + Locked phone → Apple, a model, cost → save. Stock → Locked card shows it; print its sticker (says iCloud locked). Open it → Use for parts → Camera + Battery → it leaves the stock; the profit report shows its cost.

**Delete a bill (2026-11-15, ADR-086)**: Sales list → 🗑 on a test sale → reason → Delete the bill: it shows Deleted and the phone is back in stock. Purchases list → 🗑 on a purchase whose phone was sold: the app refuses and says use a return.

**Repairs (2026-11-15, ADR-087)**: Repairs → Take a phone for repair → choose Shop's technician / Outside lab (pick a lab, price, back by). From a stock phone: Send to repair. Delete a test repair from its row (advance reversed). Repairs page → Repair reports → This month → Download both (PDF / Excel). Business overview shows the Repairs card.

**Password / PIN (2026-11-15, ADR-088)**: More → Change password (current, new twice) → log out → log in with the new one. More → Password / PIN history shows it (no password visible). Login screen → PIN tab on a phone that never logged in → number + PIN. Super admin → a shop → New quick PIN → Save → that owner logs in with it; Password / PIN history in the same sheet.

**Duplicate brands (2026-11-15, ADR-089)**: nothing to run by hand — the deploy runs `alembic upgrade head`. Before deploying, take the usual database backup. After it: Purchase → brand list shows each brand once (one Apple); Stock → summary shows one Apple whose phone count is the two old rows added (e.g. 98 + 15 = 113) and the same total value; Expenses → categories once each.

**Edit / Delete everywhere (2026-11-15, ADR-090)**: Expenses → each row has ✎ / 🗑; tap 🗑 → the red "What will happen" box with an example → reason → Delete; the row is crossed out and the galla is back. People / Accessories → ✎ opens the form, 🗑 shows the warning. Make an exchange → open its sale bill → "Delete this exchange" → both phones and the galla are as before. A sale with a later payment → Delete → the app says to delete the payment first.

**Edit / undo, part 2 (2026-11-16, ADR-090)**:
- **Payments**: tap ✎ on a payment, change 3,000 to 30,000, give a reason and save. The khata and the bill follow, and the old payment shows Deleted.
- **Returns**: tap 🗑 on a wrong return, read the warning and confirm. The phone is back with the customer (or in stock) and the galla is back.
- **Accessories**: open an item and find the adjustment in its history. Tap 🗑 to undo it; the count is back.
- **Cash & bank**: in the moves list, tap 🗑 on a wrong move. The money is back in the first account.

**Edit / undo, part 3 (2026-11-16)**:
- **Loans**: on a loan that is still out, 🗑 → the warning → Cancel. The phone is back in stock and the loan shows Deleted under Returned.
- **Transfers**: on a transfer you sent, 🗑 → the warning → everything comes back from the branch.
- **Installments**: open a plan → "Cancel this plan" → the balance stays as udhaar. After that the sale can be deleted.

Server: the deploy runs migration `e4a6c8d0f2b5` (additive: returns, branch transfers, installment plans).

**Edit a bill, stock icons (2026-11-16)**:
- **Edit a sale**: open the sale → Edit this bill. The form opens filled; change the price, give a reason, then Complete sale. The old bill shows Deleted and the new one has the right price.
- **Edit a purchase**: the same, from a purchase bill.
- **Stock**: every phone has ✎ / 🗑. 🗑 on an old-stock phone opens Remove old stock with the warning.

**Stock page and phone page (2026-11-16, ADR-091)**:
- **Stock**: type in the search, then tap × to clear it.
- **Filters**: tick Apple and Samsung, and Used, then Show. Chips appear under the bar; × takes one off, and Clear all takes all off.
- **Reports**: Download / Share / Price lists give the same list as on screen.
- **A phone**: everything is in the top card with icons, and a job sits beside each line (Correct IMEI, Mark faulty, PTA Check …). Sell, Loan and Repair are big buttons; the rest is under More actions.
- **Sticker**: untick Price and the preview drops the price at once. Then Print.

**Website speed, prices, landing (2026-11-16, ADR-092)**:
- Open the website on a phone: it should load clearly faster, and the screens show the new stock page.
- Super admin → Website prices: change a price or add a setup fee / add-on → the landing page shows it at once.
- If you change the prices, tell me: `llms.txt` and the page's search data state them as text.
- Decisions (see `docs/37-CLOUDPOS-COMPARISON.md` §5): the price numbers and setup fee, which add-ons to sell, which gaps to build first (suggested: easy load, warranty, quotations, commission).

**New website prices (2026-11-16)**:
- After the deploy the landing page shows 2,000 / 5,000 / 7,500 a month, setup 5,000 / 8,000 / 15,000 and four add-ons.
- If you saved anything in Super admin → Website prices before this deploy, that saved value wins: open the screen and set the numbers there.
- Existing shops keep their own fee. To raise a shop's fee, change it on that shop in Super admin.

**Seller on the tally sheet and price lists (2026-11-17, ADR-093)**:
- Stock → Tally sheet (owner): under each phone's status, the seller's name and number.
- Tally sheet (staff copy) and Price lists → Staff: the seller's name only.
- Price lists → Customers: no seller.
- Your own stock list: tick **Bought from** in Fields → Download → name and number.

**English words with a Roman hint (2026-11-17, ADR-094)**: switch the app to English and open a person's khata, Len-den, Payments, Loans (amanat) and the books. The money words now read like "To get (lene hain)", "I gave money (de diye)". The trial balance (Reports → Balance) has a line saying what Debit and Credit hold. Tell me any other word that still confuses a shopkeeper.

**Package chooser on the fees page (2026-11-17, ADR-095)**: nothing to run by hand (the deploy runs the migration). To test:
1. Super admin → Website prices: check the package prices, the new **module prices**, **Discount for each year paid ahead (%)** (5) and **Longest package (years)** (5).
2. As a shop owner: More → Software fees. Choose Pro and 5 years: the total must be 5,000 × 60 less 25% = Rs. 225,000. Choose your own package, tick a module, pick 1 year, send "I have paid".
3. Super admin: the pending payment shows what was chosen and the order total. Approve it; the shop now has that package, the module and the new paid-until date. "Months only, package unchanged" gives the months without changing the package.

**Graphs (2026-11-17, ADR-096)**: nothing to run. Open Home and Business overview: under "Graphs" switch 7 days / 30 days; check that today's sales, purchases and profit match the day's hisaab, and that "To get" / "To give" match the khata totals. Log in as a salesman: only sales and to get / to give show.

**Returns report (2026-11-17, ADR-097)**: nothing to run by hand (the deploy runs the migration). To test: sell a phone, then Return it — tap a reason, hand back less than the price. On the done screen try "Sell another phone to this customer". Then open More → Returns list: check the totals, "Effect on profit", and tap the return for its details. Check the "Phones returned" card on Home, the Returns card in Business overview and Returns in Shop audit. As a salesman, cost and profit must not show.

**Special price, sale, payment with package (2026-11-17, ADR-098)**: nothing to run by hand (the deploy runs the migration). For the customer who sent Rs. 3,000 for Pro, after the deploy do one of these in Super admin → his shop:
- **Special price for this shop**: Pro, 3000, the number of months you promised (empty = no end), a note → "Give this price". His fees page then shows 5,000 crossed out and 3,000, and he can send "I have paid" for 3,000 himself.
- or **Payment received: package, modules and months**: Pro, months 1, amount 3000 → "Payment received — activate". He gets Pro at once with a receipt. (Give the special price first, or the amount it suggests will be 5,000.)
To test the sale: Website prices → "Sale for everyone" 20 → a shop's fees page shows the list prices crossed out; set it back to 0.

**Deleting a wrongly entered phone (2026-11-17, ADR-099)**: after the deploy, delete purchase PUR-000182 (the iPhone 15 Pro Max entered in the wrong category) again: it now goes through, the Rs. 70,000 comes back into the galla, and the phone can be entered again in the right category.

**"First do this" before a delete (2026-11-17, ADR-100)**: nothing to run. To test: give a phone to another shop on amanat, then try to delete its purchase — the sheet must say the phone is with that shop, with an Open button. Take it back; note that the purchase then says the phone "went out and came back" and must be returned to the seller instead (a loan is a move). A purchase with nothing after it deletes as before.

**Returns audit (2026-11-17, ADR-101)** — deploy and rollback:
1. Take the usual database backup first.
2. Merge and deploy as always; the backend runs `alembic upgrade head` on start. The migration only adds three empty columns to `returns` (no row is changed).
3. Check on one shop: an old return still opens in Returns list; make a test sale and return it (the summary must appear before saving); undo that return.
4. Rollback, if ever needed: redeploy the previous version; the three extra columns can stay (the old code ignores them). To remove them: `alembic downgrade c6e8a0b2d4f7`.

**Impact preview on returns (2026-11-18, ADR-102)**: nothing to run (no migration). To test: return a sold phone — the summary must show what will happen in plain words, and for the owner the stock value and the effect on profit; "Go back / change" must keep the form. Return a phone to its seller from the purchase page: the same summary appears before saving. Delete a return: the sheet shows what goes back.

**Account ledger and item-wise stock sheet (2026-11-18, ADR-103)**: nothing to run. To test: open a supplier's page → "Account ledger" → Download (PDF): each bill must list its phones, with debit, credit and balance, and the totals at the foot; compare the closing balance with his khata. Then the stock-worth page → "Item-wise stock sheet": the grand total must equal the stock worth on that page. Show both to the shopkeeper who asked.

**Accounts page and general ledger (2026-11-18, ADR-104)**: nothing to run. To test: More → Accounts — the four figures must match Home; open "Chart of accounts & general ledger", tap Sales: this month's sales bills must be there and "Balance at the end" must equal the Sales line of the trial balance. In Reports → Balance → Trial balance, tap any line: it opens its entries.

**Thank-you popup after paying the fee (2026-11-18, ADR-105)**: nothing to run. To test: approve a fee payment for a test shop; the shop's owner logs in — the thank-you shows once; close the app without tapping OK and log in again — it must not come back. Ask the shopkeeper who reported it to confirm after the update.

**Amanat to anyone, sticker ticks, IMEI barcode (2026-11-18, ADR-106)**: nothing to run. To test: (1) More → Loans → "Give a phone on amanat" → pick a phone → choose a customer (not a shop) → it must save, and "Device came back" must return it to stock. (2) Open a used iPhone that has battery health and cycles written → the sticker card: tick "Battery health", "Battery cycles", "Serial no." — the preview must show them. (3) Print one sticker with "Barcode made from: IMEI" and scan it into the IMEI box of a new purchase: the IMEI must be typed in. Scan the same sticker on Home: the phone must open. Old stickers (MS…) must still open their phone.

**Mobile numbers of other countries (2026-11-18, ADR-107)**: nothing to run. To test: People → New person → tap **+92** → pick United Arab Emirates → the box shows the country's name and "+971 50 123 4567" → write a real UAE number → Save. Open that person and tap WhatsApp: the chat must open on the +971 number. Add a Pakistani person the usual way: nothing may have changed. Log in with your own number as always.

**Laptops (2026-11-18, ADR-108, `docs/39-LAPTOPS-PLAN.md`)**: nothing to run (no migration; the laptop brands and models are added by themselves when the server starts). To switch it on for a shop that asked: Super admin → the shop → Modules → tick "Laptops (new and used)" → Save. To test on that shop: Add stock → From a dealer → Add device → **Laptop** → serial number → Dell → search "5490" → Core i5, 8th Gen, SSD, 14 → RAM 8, storage 256GB → Used → cost and asking price → save. Stock → "Laptops": the line must read "Core i5 8th Gen · 8GB · 256GB SSD · 14\"". Sell it: the bill must carry the same line and the serial number. On a shop without the module nothing may have changed (no Laptop type, no Dell in the brands).

**Accessories-only and laptop-only shops (2026-11-19, ADR-109, `docs/40-ACCESSORIES-MODE-AUDIT.md`)**: nothing to run (no migration). To set a shop up: Super admin → the shop → Modules → untick "Follow the plan" → tick what it trades — accessories only: "Accessories" + "Without mobiles (accessories / laptops only)"; laptops only: "Laptops" + "Without mobiles"; both: all three → Save. Add the other modules that shop should have (expenses, reports …) in the same list. To test on a new test shop set up as accessories only: Home must say "Items in stock" and search items; the Stock tab must open the items; Add stock must offer only "From a dealer" and "Add accessory"; Sell must start on the items. Then check one of your mobile shops: nothing may have changed.

**Old dealings and several pieces at once (2026-11-19, ADR-110, `docs/41`)**: nothing to run (no migration). To test: (1) open a shop's page in People → "Old balance" → "Add old dealing" → "They owe me" → lines: Apple iPhone 17 × 5 at 300000, Samsung A56 × 10 at 95000 → "Already paid" 2000000 → Still left must show 450,000 → Save: his khata must show 450,000 to get and Stock must not have changed. Delete the entry with a reason: the khata must go back. (2) Add stock → From a dealer → Add device → fill one phone → switch on "Several pieces of the same" → add two more IMEIs → Add: three lines on the bill; after saving, three phones in stock. (3) Sell → "Pick several" → tick the three → "Add 3 to the bill" → "Price each" → "Set for all 3". Show (1) to the dealers who asked.

**Reports list (2026-11-19, ADR-111)**: nothing to run. To test: More → Reports — "Every day" must show Day's hisaab, Stock tally, Udhaar khata, Sales bills, Purchases, Len-den, Cash and bank, Expenses, Returns; tap Stock tally: the stock worth page opens. Type "udhaar" in "Find a report": only udhaar reports stay. Pick "This month" and download Sales bills: this month's bills. Log in as a salesman: he must see the daily lists and no profit report. Tell me if a report should move into or out of "Every day".

**Lines under the money buttons (2026-11-19, ADR-112)**: nothing to run. To test: open a person's page in English — under "Money received" must read "Bill ka udhaar wapas mila: jo paise is ne aap ko dene the, woh yahan likhein"; under "Money paid", "Gave money, no bill" and "Took money, no bill" their own lines. Tap one: the form repeats the line. Switch to Urdu: the lines must be in Urdu. Show it to the shopkeepers who asked and tell me any wording they want changed — each line is one text.

**Money buttons redesigned (2026-11-19, ADR-113)**: nothing to run. To test: open a person's page on a phone — Money received (blue), Money paid (dark), Gave money, no bill (red), Took money, no bill (amber) must each be a filled button with an icon on one side and a round arrow on the other, one under the other; tapping anywhere on one opens its form. Show the shopkeepers who said they could not tell these were buttons.

**A phone's page redesigned (2026-11-20, ADR-114)**: nothing to run (no migration). To test: open any phone — three views at the top: Details, 80 mm slip, A4 page. In Details every line must have a button beside it (IMEI 2 and Colour say "—" with Add / Edit when empty); tap "Edit all details": the whole form opens; change the colour and save. The money (asking, cost, still to pay …) and the accessories must be in the same table; the "Bought from" card must be white. Tap "80 mm slip": the preview shows the phone's details; untick Price, tick Cost — the preview changes; Print on the thermal printer, then Download PDF and Share. Do the same on "A4 page". Show the shopkeepers who asked.

**Control room and the landing page (2026-11-20, ADR-115)**: nothing to run (no migration, no env key; the web server's new line ships inside the image). To test after the deploy: (1) open `https://mobileshop.oopsolutions.com/control` in a private window — it must ask for the login and, after your login, open the control room (Shops and plans / Business), with no shop menu around it; the old `/admin` must land on `/control`; a shop owner's login must see "Only for the software provider". Save `/control` as your bookmark. (2) Open `/welcome`: the new cards (accessories-only shops, laptops, every report in one list …), six "who it is for" cards and the new questions. Open `/accessories-shop-software`, `/laptop-shop-software`, `/used-mobile-shop-software`: each has its own heading. (3) View the page source of `/laptop-shop-software` (Ctrl+U): the `<title>` must say "Laptop Shop Software Pakistan" and `canonical` must end in `/laptop-shop-software`. **For Google (only you can do these)**: add the site to Google Search Console and submit `https://mobileshop.oopsolutions.com/sitemap.xml`, then "Request indexing" for the four addresses; make a Google Business Profile for OOP Solutions with the site link; put a link to each of the three new addresses on oopsolutions.com and ifixapplephone.com; share the links on the Facebook / WhatsApp groups of mobile markets. Ranking takes weeks and depends on these links.

**Old dealing, step by step (2026-11-20, ADR-116)**: nothing to run. To test: open a shop's or customer's page → Old balance → **Add old dealing**. It must ask first "Who still has to pay?"; tap "They owe me". Then "What did you give them?" → "Write what went". Tap **Mobile** → a brand → a model, write 5 pieces at 300,000, **Add to the list**. Add a second item with "Not in the list? Write the name". **Next** → write what was already received → check **Still left** → **Save**. The khata must show the amount left with the list of what went; Stock must not change. Try once with "Only the amount" and once with "I owe them". Show the shopkeepers who found the old form hard.

**Your own price code (2026-11-20, ADR-117)**: one small migration (`a3c5e7f9b1d2`, a new empty column on `shops`) runs by itself with the deploy; nothing to type. To test: More → Shop settings → **Your own price code** → switch on **Use my own pattern**. Write your own letters for 1–9 and 0, the signs for Lakh / Thousand / Hundred, `##` before and `@@` after. Under **How your prices will look** Rs. 285,000 must read `##BHEL@@` (with A–I, Z and L). Try a price of your own; try the three ways of writing. **Save**. Open any phone → the sticker → tick **Cost in code** and **Asking price in code**: the preview must show both in your code; print one. Log in as a salesman: the two ticks must not be there. Switch the pattern off again and the sticker must go back to the 10-letter word. Shops that never switch it on see no change.

**Built-in accessories list and variants (2026-11-20, ADR-118)**: one small migration (`b4d6f8a0c2e4`, two empty columns on `accessories`) runs by itself with the deploy. To test: Chargers, covers etc. → **New item** → type "anker 65w": lines appear under **From the built-in list**; tap **Anker 65W GaN Charger** — name, category, brand and watts fill themselves. Under **Colours or sizes you keep** tick Black and White, add one of your own, write how many of each are on the shelf, the sale price and cost, **Save**: the list must show one item per colour, each with its own count. Open one: **Kinds of this item** lists them; tap **Add another colour or size**. Type "a56 glass" and "hp 840 charger" in a new item: glass for that phone and a charger for that laptop must be offered. Sell one colour: only its count may drop. **For the accessories shop (xcessorieshub)**: open its shop with Accessories (+ Laptops, and "Without mobiles" only if it really keeps no phones — its website sells phones too); show the owner the built-in list and ask which products or brands he misses — send me that list and I add the lines.

**Printers and the printer guide (2026-11-20, ADR-119)**: nothing to run (no migration, no env key). To test — this one needs **real printers**, which I do not have: (1) on the counter computer open More → Shop settings → **Printers**. For the sticker printer tap how it is connected, follow the four steps, choose your sticker size and tap **Test print**; in the print window pick the printer, the paper size, Margins: None. The whole frame must be on the sticker and your scanner must read the barcode; then tap **Yes, it printed right**. Do the same for the 80 mm receipt printer and the A4 printer. (2) Do it once on an Android phone with a Bluetooth printer (RawBT) and tell me which step did not match what you saw — the steps are general, no model was tested. (3) Tap **Open the printer guide**; read it in Urdu and Roman Urdu and tell me any line a shopkeeper would not understand. The guide's link `https://mobileshop.oopsolutions.com/printer-guide` opens without a login: send it to a shopkeeper who is about to buy a printer.

**FBR guide (2026-11-20, ADR-120)**: nothing to run. To check: open `https://mobileshop.oopsolutions.com/fbr-guide` (no login) and read it in English, Urdu and Roman Urdu; also More → Shop settings → FBR Digital Invoicing → **Open the FBR guide**. Please read section 3 ("What we need from you") and section 5 ("What we do") as if you were a shopkeeper, and tell me any line that is not clear. **Show it to a tax adviser once**: the guide says phones carry no added tax at a shop (Ninth Schedule), a token is valid five years and the STRN has 13 digits — these come from FBR's documents I read, not from an adviser. Send the link to a registered shop only after that.

**Easier accessory purchase and every kind of stock in sight (2026-11-21, ADR-121)**: nothing to run (no migration). To test: (1) Add stock → From a dealer → pick the dealer → **Add accessory / watch**. Type "anker 20w" and tap the line under "From the built-in list". The form shows four numbered steps, already filled: tick White and Black, write how many of each under Bought, the cost of one piece and the selling price, **Save and add**. Both colours must be on the bill with their pieces and cost; finish the purchase. (2) Open **Stock**: the chips Mobiles, Tablets, Smartwatches, (Laptops), Accessories must all be visible on your phone without scrolling sideways, each with its count; under the phones a card "Accessories and other items — N pieces in stock" opens the items. On the items' screen the same chips take you back to Tablets or Mobiles. **Show it to the accessories shop that complained** and ask whether buying an item is now as easy as a phone — if not, which step is still unclear.

**What a shop trades — three ticks and "not in your package" (2026-11-21, ADR-122)**: nothing to run (no migration). To test as the provider: `/control` → open a shop (or **Open a new shop**) → **What does this shop trade?** — tick only **Accessories** for an accessories shop, **Laptops** + **Accessories** for a laptop shop with accessories, and so on; Save. Then log in as that shop: on **Stock** the lines it does not have are dashed, locked chips; tap one — "Not in your package … contact the software company" with **Ask on WhatsApp**; the message must already carry the shop's name, its number and the line it wants, and open a chat with your number. In **Add stock** the same note is under the buttons and only its own kinds can be added. **Your existing mobile shops** will now see one locked "Laptops" chip and that note — nothing else changes for them; tell me if you would rather not show it to shops that never asked. **Check `ADMIN_WHATSAPP` on the server**: the request goes to that number; if it is empty it goes to the number printed on the login page.

**Accessories shop: stock and purchase (2026-11-21, ADR-123)**: nothing to run (no migration). **First, in `/control`**: open the accessories shop that complained → **What does this shop trade?** → leave only **Accessories** ticked (untick Mobiles; Laptops only if it sells them) → Save. As long as Mobiles is ticked that shop will keep seeing "Buy a customer's phone" and "Add device" — this is a setting, not a bug. Then, logged in as that shop: (1) tap **Stock** from the tab, from Home and by typing `/stock` — each must open its items, titled "Stock", with no empty phone screen; (2) **Add stock** must ask "Which dealer did you buy from?" at once, with no "From a dealer" card and no "Add device"; (3) **Sell** must start with "What are you selling?". In a shop that has mobiles and accessories: **Stock → All stock** must show the accessories block above the phones, and typing an accessory's name in the search box must find it. The full audit of the brief you sent, with what is left to build, is `docs/42-ACCESSORIES-EASY-MODE-AUDIT.md` — please read §5 and tell me which phase to do next.

**Purchase: kind cards, line discount, profit per line (2026-11-21, ADR-124)**: nothing to run (no migration). To test: Add stock → the dealer → **Add accessory / watch**. Under the search there are now cards under **Or choose a kind**; tap **Charger** — only chargers show, yours first and the built-in ones under them; **All kinds** takes the filter off; **More kinds** shows the rest. Put an item on the bill with a quantity and a cost: under the line you must see **This line comes to** and "Sells at … · earns … a piece". Tap **+ Discount on this line**, write an amount: the line's total and the earning per piece change, and so does the bill's total. Save, open the item: its cost must be the discounted one. Freight is where it always was: **Discount, bill no.** → Freight / loading.

**One model on one line (2026-11-21, ADR-125)**: nothing to run (no migration; no record is changed). To test in the shop that complained: open **Stock summary** — "iPhone 18 pro max" must be one line with 6 phones and their value together; tap it — all six phones must open. In **Add stock → Add device → Apple**, the model must be offered once. If you still see a model on two lines anywhere, send me a screenshot of that screen: every list I found now counts by name, but I could only test with made-up data, not that shop's.

**New item in four steps everywhere; shorter item page (2026-11-21, ADR-126)**: nothing to run (no migration). To test: Chargers, covers etc. (or Stock, in an accessories shop) → **New item**: the form must show the four numbered steps — 1 What is it?, 2 What kind of thing?, 3 Which colours or sizes do you keep?, 4 How many you have, and the prices — with Reorder, Brand, Fits and Quality under **More details**. Add an item with two colours and a count for each; open one: its colour is in the coloured header; an item with many purchases shows five lots and eight history lines with **Show all**.

**Details by kind; colour and size together (2026-11-21, ADR-127)**: nothing to run (no migration). To test: **New item** → choose **Charger**: Watts and Connector are asked right there; choose **Cover**: "Fits (phone / model)" is asked instead; **Other**: nothing extra. Then a cable in two colours and two lengths: under the colours / sizes box tap **Colour and size**, tick Black and White, tick 1m and 2m — "4 items will be made", each with its own count; Save: four items, each with its colour and its length.

**Skipping the ID card check (2026-11-21, ADR-128)**: nothing to run (no migration). To test: (1) **Exchange** with a used phone from stock whose check is pending: on the last step the box "The new phone's ID card check is pending" must show **Check now** and **Skip and exchange**; **Complete exchange** is grey until you choose; above it choose **Skip, I know this person** for the old phone. (2) Home → **N phones: ID card check pending** → the list: **Skip** on one phone, then **Skip all**, confirm; the line on Home goes away (a phone marked as suspected stolen stays). (3) A pending phone's page: **Skip** beside **ID card check**. (4) Shop Audit → the ID checks: every skip is listed with who did it.

**Four more colour sets (2026-11-21, ADR-129)**: nothing to run. To test: More → Appearance → **Colours**: **Material**, **Mac**, **Lime**, **Fintech** — tap each, look at Home and a sale, then **Dark**. They are named for the look, not for the companies (trade marks); say so if you want other names.

**Accessories with details on the stock screen (2026-11-22, ADR-130)**: nothing to run. To test: tap **Stock** (All stock): above the phones the box "Accessories and other items" lists each item with its code, kind, brand, pieces and price; a finished item says **Out of stock**, a low one **Low stock**; with more than ten items tap **Show all N items**; type an item's name in the search; tap a row to open the item.

**Stock by kind (2026-11-22, ADR-131)**: nothing to run. To test: tap **Stock**: the first screen shows a card for Mobiles, Tablets, Smartwatches (Laptops / Accessories if the shop has them) with pieces, worth, brands and models; the top figure is all the cards together. Tap **Mobiles** → only the phones' brands; tap a brand → its models; tap a model → the stock list with that model. **Back** → the cards. Tap **Accessories** → chargers, covers … with pieces and worth; tap one → its items. Check the worth of each card against what you expect, as the owner (buying price) and as a salesman (selling price).
**80 mm receipts print in full black (2026-11-26, ADR-135)** — after the release. On the shop's thermal printer print one sale receipt (Bills → a bill → Print 80 mm): the address, the phone's details line, the cashier and the amount in words must now be as dark as the bold lines. Ask Phonecity to print one and send a photo.
**A person's page with the full khata (2026-11-26, ADR-136)** — after the release. Open People & Khata → a dealer: the dates under the two money buttons; WhatsApp khata; Full ledger report (try This month, untick a section, Print A4); the three cards (in shop / sold / returned, money by channel, profit — Hide profit); in the statement try the four tabs, the search and the kind filter, Fix / Edit on a bill and on a payment (delete with a reason), Sell now and Return to dealer on a phone still in the shop; record a payment with yesterday's date. Do the same on a customer, another shop and a repair lab. As a salesman: no cost or profit anywhere.
**The invoices page as the bills centre (2026-11-26, ADR-137)** — after the release. Open Invoices (F10): the five cards for this month; tap Still to get, then Reset; try Mobile / Accessories and a payment mode; Dealer-wise, Customer-wise, Edited bills, Full ledger; on a bill press View — print 80 mm in Urdu, Settle a part, Correct (the choices), Delete (it goes to the bill's page); New bill; Report → A4 and Excel. As a salesman: no purchases, no to-pay, no profit.
**A person's page reorganised (2026-11-26, ADR-138)** — after the release. Open any person: the balance, then one Profile card (phone, CNIC, city, address, dates), then "What do you want to do?" with six buttons, then five tabs — Summary, Ledger, Phones, Len-den & old balance, Payments. Show it to the shopkeeper who complained and ask whether everything is now easy to find.
**Sale & purchase in the side panel (2026-11-26, ADR-139)** — after the release. In the panel press Sale & purchase: the Sales side's six cards for this month; Loss deals; a brand → its models; Customers & dealers; Sale invoices — tick two and settle; then Purchases screen: the five cards, Full purchase ledger (each phone says In shop or Sold and to whom), pay a bill, Report → A4 / Excel. As a salesman: only the Sales side, no cost or profit.
**A phone's page: expenses, ledger sheet, quick check (2026-11-26, ADR-140)** — after the release. Open a phone in stock: in the table, "Spent on this phone" → Add (e.g. glass protector 1,500): the cost must go up by it and Cash must go down; add a wrong one and delete it with a reason; the Item ledger card — Bought, Spent, then after a sale Sold; A4 sheet / Print in Urdu; Quick check — tap Camera (the phone becomes Faulty), tap again; More → WhatsApp offer. Sell it: Margin must be the sale minus the cost with the expense. Return a phone that has an expense to its dealer and check the stock worth. As a salesman: none of the cost.
**Stock: tabs, stock by dealer, stock ledger (2026-11-26, ADR-141)** — after the release. Open Stock: the four tabs on top; on Summary the two new cards (worth at asking, still to pay suppliers — check it against the dealers' khata); By dealer & customer: a dealer's brands, still here / sold, billed and balance, then Full party stock; Stock ledger: this month, then only Sale out, then one dealer — the last line's "stock at cost after" must equal the stock worth. As a salesman: no cost, profit or balances.
**Cash & bank upgraded (2026-11-26, ADR-142)** — after the release. Open Cash & bank: the four cards (total, cash in hand, bank / online, this month's flow); tap the bank card — its book opens on the page; search an amount; Money in / Money out / Transfers; Manual cash in / out → Out: pick a category and pay Rs. 500 from the bank — the balance must fall and the expense must be in Expenses; Export CSV; for an account below zero: Set the opening balance → Fill (makes it zero) → Save. As a salesman: accounts only, no book.
**Shop Audit: sales & purchases by brand & model (2026-11-26, ADR-143)** — after the release. Open Shop audit → Sales & purchases → "Brand & model-wise sales": each model's profit and the highest-profit phone; every phone with who it came from, who bought it, paid and profit; tap an IMEI, a name and a bill number; search a buyer. Then Purchases → "Brand & model-wise purchases": cheapest and dearest buy, where each phone is now. On any audit screen: Master ledger and Accounts & trial balance.
**Reports: columns, hidden cost, PDF rows (2026-11-26, ADR-144)** — after the release. On Sales (or any screen with Download / Share): Download → tick "Hide cost and profit" → "Choose the columns" and untick one → PDF, Excel and CSV must all come without them. Download a long report (50+ rows) as PDF and check no row is cut at the page end. Print one report: the header of the shop, the title bar and the signature line. As a salesman: no cost tick, no cost in the file.

## E. Decisions waiting for you

| Done | Question | Now |
|---|---|---|
| [ ] | Grace days after plan end: 7 or 15? | 7 |
| [ ] | Accessories Easy Mode — which phase next (docs/42 §5): B rest of the purchase (line discount, freight, profit per line), C items outside a purchase, D fields by kind and colour × length grid, E selling by box / exchange, F a permission per action? And: a category-cards step before the product, or keep the search first? | Search first; no phase started |
| [ ] | Show the "not in your package" note to every shop that lacks a line (built), or only to shops you mark? | Every shop that lacks a line |
| [ ] | Printing straight to a Bluetooth / USB thermal printer from the app (no print window, ESC/POS)? A large piece of work: every sticker and receipt would need a second way of being drawn | Not built — the device's print window is used |
| [ ] | Accessories shop (xcessorieshub): which of the "later" items first — WooCommerce stock / order sync, courier and COD, or a variants grid with totals? | None until they ask |
| [ ] | Price code: the same pattern for cost and asking (built), or a separate pattern for each? Also print the code on the phone's slip / A4 page? | One pattern; stickers only |
| [ ] | Old balance: a promised return date (like len-den) and reminders for it? Needs a new column | Not built |
| [ ] | Control room on its own sub-domain (e.g. `control.oopsolutions.com`)? Needs a DNS record and a Traefik rule on the server; `/control` works today | `/control` on the present domain |
| [ ] | More kind-of-shop pages for search (repair shop software, mobile wholesale software, a page per city)? | The three built |
| [ ] | Reports list: which reports belong in "Every day"? (now: hisaab, stock tally, udhaar khata, sales, purchases, len-den, cash and bank, expenses, returns) | as built |
| [ ] | Accessories mode: which of docs/40 §4 next — "made for" mobile / laptop / tablet / watch with laptop kinds, variants, quantity-tier prices and selling by box, customer prices, transfers with in-transit, consolidated reports? | not built |
| [ ] | Price of the software for an accessories-only shop (a package of its own on the fees page, or a special price per shop as today)? | special price per shop |
| [ ] | Laptops: a stored wholesale price per laptop that fills itself for a wholesale customer? (today: a normal bill at the typed price) | not built |
| [ ] | Laptops: ID check (CNIC, photo) when a laptop is bought from a walk-in person? | not required |
| [ ] | Laptops module: only switched on by you, or a monthly price so shops add it themselves? | by you only (price 0) |
| [ ] | Accounts & Reports phase 2 (docs/38 §3): which first — other income with categories, recurring expenses, consolidated view over branches, retail vs wholesale report, customer credit limit? | none started |
| [ ] | Manual journal entries: leave out (my advice), or build a small owner-only "adjustment" document limited to named accounts, with a reason? | left out |
| [ ] | Yearly price: the website says "a year costs 10 months" (about 17% off) but the app now gives 5% for 1 year. Make the website follow the 5%-per-year rule, or raise the 1-year discount? | website unchanged; app 5% per year |
| [ ] | Module prices when added to a package (Repairs 500, Reports 500, WhatsApp 500, Loans 500, Installments 500, AI 1,000, others 300 a month): keep or change? | my defaults; edit in Website prices |
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
- [x] **Off-server backup: set up by the owner on the VPS (server date 2026-11-17 18:03 UTC).** rclone remotes `gdrive` (Google Drive) and `gdrive-safe` (crypt over `gdrive:mobileshop-backups`); `RCLONE_REMOTE=gdrive-safe:` in `/opt/mobileshop/.env`; a manual `backup.sh` ended with `offsite copy ok` and `rclone ls gdrive-safe:` listed both dumps and both upload archives. The two crypt passwords are with the owner only. Still to do: [ ] practise one restore from a Drive copy; [x] the Google consent screen said the app was "being tested" — the owner checked his Google account's linked apps: the only app with account access is "rclone" (do not remove it, or the off-server copy stops).
  - **Found on the VPS (server date 2026-11-17 17:05 UTC): the nightly backup had never run.** root's crontab was empty and `/var/log/mobileshop-backup.log` did not exist; `/opt/mobileshop-backups` held nothing before the owner's manual run that day (`db-20261117-1705.dump`, 661K). The cron line from `deploy/setup-vps.sh` was installed by hand the same day (`30 2 * * *`, the server is on UTC, so 07:30 in Pakistan). Still to do: [ ] check the next morning that a new `db-*.dump` appeared; [ ] the server says "System restart required" — restart it at night, not during shop hours.
  - **Owner 2026-11-17: confirmed it is still not set, and wants it done** — shops are live, and every shop's database must have a copy off the server. Until then: after a manual `sudo /opt/mobileshop/backup.sh`, download the newest `db-*.dump` to a PC. Steps: `docs/12-DEPLOYMENT.md` → Backups (rclone, an encrypted Google Drive remote, `RCLONE_REMOTE=gdrive-safe:` in `/opt/mobileshop/.env`). Needs the owner's Google login on the VPS, about 15 minutes.
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
