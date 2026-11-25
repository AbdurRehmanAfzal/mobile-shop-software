

## 2026-11-24 — Add stock in the new product (file 01)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Purchase.tsx` at `/new/purchase/new`, a full-screen route beside the new shell, drawn from `01-add-stock-and-purchase.html` (sidebar, bar, the source and person bar with khata state and the anti-theft bar, the four builder tabs, the bill, payment, review, the saved modal with stickers). It fills the live `DeviceLineDraft` (`emptyDraft`, `draftToApi`, `expandDraft`) and posts what the live purchase posts, keeping the live checks (IMEI, in stock, asking ≥ cost, patched details, lock checks, review tick). Designed here and listed in docs/43: accessory name searches the shop's items first, new items made with no stock, several pieces' IMEIs, ID-checked skip after saving, CNIC onto the seller. Tailwind's `obsidian` shades now come from CSS variables so each file keeps its own (`data-file` 11 / 14 / 01). Strings in three languages (`nbuy`).

**Verified**: tsc; vitest 72; Playwright `newui-purchase` (new — a phone already in stock refused, asking under cost refused, a phone with the charger given, the shop's charger found and its pieces added (2 → 7, still one item), a new cover made with 10 pieces, a typed line, total 7,500, part on udhaar with the dealer owed 2,500 on the server, the review tick, the bill number; a customer's phone with "ID checked" not left pending; no sideways scroll on a phone) and the other four new-product tests after the colour change. Screenshot compared with file 01. Live files: only `router.tsx`. **Not done**: the locked-phone tab and the online / cheque payment in a browser; Urdu and dark screenshots; the full Playwright suite.

**Next**: the purchases list and bill inspector (file 10).

**Open questions**: none.

## 2026-11-24 — The purchases list and bill inspector in the new product (file 10)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Purchases.tsx` at `/new/purchases`, full screen with its own rail and bar, drawn from `10-purchases-and-bill-inspector.html`: three filtering cards, search, source pills, bill cards with phones and IMEIs (copy), the bill inspector with the dark money box, the payment drawer and the four actions, and the change-party and delete windows in the file's style. Live APIs only: `GET /purchases` (owner / manager), `POST /payments` allocated to the bill for "pay the rest", `POST /purchases/{id}/paid` with a reason (ADR-067) on a settled bill, `POST /purchases/{id}/party` (ADR-056), `GET /delete-check/purchase/{id}` + `POST /purchases/{id}/void` (ADR-090 / ADR-100). Edit and return open the live forms; printer = the bill's phone stickers, PDF = that day's purchases sheet (the server has no purchase slip). `data-file="10"` shades. Strings in three languages (`nlist`). `newui-frame` now expects the drawn purchases screen.

**Verified**: tsc; vitest 72; Playwright `newui-purchases` (new — the cards' totals 64,000 / 24,000 / 40,000 from three bills, the To-pay / customer's-phone filters and an IMEI search, part payment 5,000 then the full balance with the server's `balance_due` 0, a settled bill's paid-at-purchase changed 15,000 → 10,000 with a reason and the server owing 5,000, change party on the server, delete kept as Deleted with the totals down to 55,000, Urdu RTL) and the other five new-product tests. Screenshots compared with file 10 (English and Urdu). Live files: only `router.tsx`. **Not done**: the online payment in a browser; dark screenshot; the full Playwright suite.

**Next**: the person's khata (file 06).

**Open questions**: none.

## 2026-11-24 — A person's khata in the new product (file 06)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Khata.tsx` at `/new/khata`, `/new/parties` and `/new/parties/:id` (F4), full screen with its own sidebar, drawn from `06-person-khata.html`: the bar with the breadcrumb, the profit eye, the switch-account pills, the person's card with call / WhatsApp hisaab / edit / "•••", the Paisa aya / Paisa diya / Purana hisaab buttons and their drawer, the four journey cards and the three-tab statement, with the WhatsApp, edit, delete and undo windows in the file's style. Live APIs only: statement, journey (owner / manager), len-den, old balances (ADR-110), `POST /payments` (against bills or `purpose = lending`, with an Idempotency-Key), `POST /ledger/parties/{id}/opening-balance`, the old-balance undo and the payment void with a reason, `PATCH` / `DELETE /parties/{id}`. `data-file="06"` shades. Strings in three languages (`nkh`). `newui-frame` now expects the drawn khata (F4) and uses `/new/hisaab` for a screen not drawn yet.

**Verified**: tsc; vitest 72; Playwright `newui-khata` (new — `/new/khata` opens the dealer with the biggest balance (20,000 to give, 1 phone, its IMEI in the phones tab); on a customer an old balance of 12,000 (server 12,000), 2,000 received in cash (10,000), 3,000 len-den given (13,000), 1,000 on JazzCash (12,000 on the server), the old balance undone with a reason (0 on the server), the WhatsApp text, an edit of the name, the switcher, Urdu RTL) and the other six new-product tests. Screenshots compared with file 06 (English and Urdu). Live files: only `router.tsx`. **Not done**: the delete of a person in a browser; dark screenshot; the full Playwright suite.

**Next**: cash & bank (file 03).

**Open questions**: none.

## 2026-11-24 — Cash & bank in the new product (file 03)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Cash.tsx` at `/new/more/cash`, full screen with its own rail and bar, drawn from `03-cash-and-bank.html`: four cards, the accounts list, the below-zero card with the opening balance, Move money / Edit / Add account as inline cards, the chosen account's book with filters, search and footer totals, and an undo window for a move. Live APIs only: `/ledger/accounts` (+ POST / PATCH / DELETE, owner), the account's book, `/ledger/transfers`, `/ledger/groups/{id}/reverse` with a reason, `/reports/cash-flow` (this month, moves left out), `/expenses` (+ categories). No free cash entry (docs/38 §4): "Manual cash in / out" saves money out as an expense from the chosen account and sends money in to the khata / counter. `data-file="03"` shades. Strings in three languages (`ncash`).

**Verified**: tsc; vitest 72; Playwright `newui-cash` (new — a galla 9,000 below zero after a cash purchase, "Fill" 9,000 and save → 0 on the server, a new Easypaisa with 5,000, a move of 2,000 (galla 2,000 on the server), the Transfers filter, undo with a reason (Easypaisa 5,000 on the server), money in pointing to the khata / counter, an expense of 500 from Easypaisa (4,500 on the server), Urdu RTL) and the other seven new-product tests. Screenshots compared with file 03 (English and Urdu). Live files: only `router.tsx`. **Not done**: Print book and Export CSV in a browser download; dark screenshot; the full Playwright suite.

**Next**: the day's hisaab (file 04).

**Open questions**: none (the manual entry follows docs/38 §4; if the owner wants a free "cash in" the owner-only adjustment document in §4 is the decision).

## 2026-11-24 — The day's hisaab in the new product (file 04)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Hisaab.tsx` at `/new/hisaab`, full screen, drawn from `04-day-hisaab.html`: period pills with a from – to bar, the profit eye, WhatsApp day summary, the A4 hisaab (server PDF), the lime banner, the dark "left in hand" card with formula / came in / went out / note, six figures (two filter the list), what was sold with tabs, search, split badges, time, a bill's drawer and footer sums. The rail of files 03 and 04 is now one component (`newui/FileRail.tsx`, lime passed in); `Cash.tsx` uses it. **Server (additive)**: `reports.day_report` items gain `paid_now`, `owed`, `at`, `imei1`, `cost` / `profit` (VIEW_COST only) and the report gains `margin`; types gain them as optional. `newui-frame` now uses `/new/reports` for a screen not drawn yet. Strings in three languages (`nday`). `data-file="04"` shades.

**Verified**: pytest `test_reports_simple`, `test_reports_owner`, `test_salesman_cash` (salesman: no profit, margin or line cost), `test_lending`, `test_returns`; tsc; vitest 72; Playwright `newui-hisaab` (new — three sales (part, cash, full udhaar) and 1,000 udhaar back: total 35,000, profit and margin as the server's, stock bought 21,000, the split badges, the tabs and the two filtering figures, an IMEI search, a bill's drawer with IMEI / cost / 5,000 to receive, the eye, yesterday empty, Urdu RTL) and the other eight new-product tests. Screenshots compared with file 04 (English and Urdu). Live screens unchanged (only `router.tsx`; `types.ts` gains optional fields). **Not done**: the A4 print and WhatsApp in a browser; dark screenshot; the full pytest / Playwright suites.

**Next**: expenses & day closing (file 05).

**Open questions**: none.

## 2026-11-24 — Expenses & day closing in the new product (file 05)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Expenses.tsx` at `/new/expenses` (F8), full screen, drawn from `05-expenses-and-day-closing.html`: four cards, the Quick expense tab (category pills with the file's icons, galla / bank, presets, note; the same form edits), the Close the day tab (waterfall, counted cash, match expected, short / extra, slip, lock; a closed day shows counted and difference), the list with dates, search, spend bar, category chips, edit / delete and the shown total; a delete window with a reason. `FileRail` now lights a counter tile (Expense) as well as a shop tile. Fixed the lime tints of files 04 / 05 (a Tailwind opacity on a CSS variable gave no colour; now the file's own hex). Live APIs only (owner / manager). Strings in three languages (`nexp`). `data-file="05"` shades.

**Verified**: tsc; vitest 72; Playwright `newui-expenses` (new — 12,000 cash in from a sale, tea 600 by presets with a note (server: one expense of 600, expected 11,400), edit to 700 (server: one live expense of 700), delete with a reason (server: none live, expected 12,000), close the day with 11,500 → "short 500", Match expected → "Matches", lock → Day closed and the server's close counted 12,000, Urdu RTL) and the other nine new-product tests. Screenshots compared with file 05 (English and Urdu). Live files: only `router.tsx`. **Not done**: a bank-paid expense in a browser; dark screenshot; the full Playwright suite.

**Next**: the business overview (file 02).

**Open questions**: a printable closing slip (Z-report) from the server — the live software has none; say if it is wanted.

## 2026-11-24 — The business overview in the new product (file 02)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Overview.tsx` at `/new/overview`, full screen with its own 220px sidebar, drawn from `02-business-overview.html`: period pills with a from – to bar, 7 / 30 days, the profit eye, four cards, two in-house SVG graphs with hover boxes, four tabs (pulse, udhaar & reminders, top models & alerts, activity & totals) and the full-hisaab window. Server only: `/reports/overview` (owner / manager) and `/reports/trends`. Strings in three languages (`nov`). `data-file="02"` shades. **Tooling**: `vite.config.ts`'s proxy reads `API_TARGET` (default `localhost:8000`, unchanged) — another project's backend now listens on 127.0.0.1:8000 on this machine, so the tests ran with `API_TARGET=http://192.168.100.9:8000`; noted in CLAUDE.md "Running".

**Verified**: tsc; vitest 72; Playwright `newui-overview` (new — sales 14,000 with 4,000 profit, to get 10,000, to give 15,000, stock 1, the graphs, money in / out names, the eye, both udhaar lists and the filter, top sold, alerts, totals, the full-hisaab window, yesterday empty, Settle → the person's khata, Urdu RTL) and the other ten new-product tests. Screenshots compared with file 02 (English and Urdu). Live files: only `router.tsx` (+ the dev proxy line). **Not done**: the PDF and WhatsApp in a browser; dark screenshot; the full Playwright suite.

**Next**: the repairs hub (file 09).

**Open questions**: none.

## 2026-11-24 — Repairs & lab hub in the new product (file 09)

**Asked (owner)**: "push / continue" — PR #128 opened; the next screen.

**Done**: `src/newui/pages/Repairs.tsx` at `/new/repairs` (F7), full screen with its own bar, drawn from `09-repairs-and-lab-hub.html`: the intake (customer from the khata or a quick walk-in, model / IMEI with the scanner, the server's fault codes, received items, shop technician or outside lab with price / instruction / back-by and a new-lab form, likely cost, advance, ready-by) with the live 80 mm slip and Save & print; the jobs board (four cards, filters, search, a card per open job with WhatsApp / Back from lab / Mark ready / Deliver & settle) and the labs' khata; WhatsApp, back-from-lab and deliver windows. Live APIs only (`/repairs`, `/repairs/{id}/lab`, `/lab/{trip}/back`, `/status`, `/deliver`, `/repairs/technicians`, `/repairs/labs`, `/repairs/fault-codes`, the job sheet). Strings in three languages (`nrep`). `data-file="09"` shades.

**Verified**: tsc; vitest 72; Playwright `newui-repairs` (new — a khata customer's phone for the shop with estimate 8,500 and advance 2,000 (server: estimate, advance, SIM received), a walk-in's phone to Hassan LCD Lab at 3,000 (server: the lab trip's quote), the Outside-lab filter, back from the lab fixed (server: no open trip), mark ready, deliver with 8,500 charges and 6,500 paid (server: delivered, balance 0), Urdu RTL) and the other eleven new-product tests (run with `API_TARGET` — another project holds localhost:8000). Screenshots compared with file 09 (English and Urdu). Live files: only `router.tsx`. **Not done**: a not-fixed lab return and a salesman's view in a browser; dark screenshot; the full Playwright suite.

**Next**: a repair job's detail (file 08).

**Open questions**: none.

## 2026-11-25 — A repair job's page in the new product (file 08)

**Asked (owner)**: "ok" — the next screen.

**Done**: `src/newui/pages/RepairJob.tsx` at `/new/repairs/:id`, full screen with the file's own bar, drawn from `08-repair-job-detail.html`: switch job, the job's card (Call, WhatsApp status link, lab strip with Back from lab, Delete), the four tappable steps, the bill with an editable work charge and Deliver / Collect, the history, the 80 mm slip in English or Urdu (`i18n.getFixedT`) with sticker / slip / download / share. It reuses the WhatsApp, back-from-lab and deliver windows of `Repairs.tsx` (now exported); the board's job numbers open this page. Live APIs only. Strings in three languages (`njob`). `data-file="08"` shades.

**Verified**: tsc; vitest 72; Playwright `newui-repair-job` (new — two jobs; step 2 → in_progress on the server, work charge 5,000 (server labour), step 3 → ready, given back with 3,000 left prefilled (server: delivered, balance 0), the history, the Urdu slip, switch to the other job and delete it with a reason (server: cancelled), Urdu RTL) and the other twelve new-product tests. The first run of the new test failed mid-way because this machine's network changed during it ("No internet connection" in the deliver window); the retry and the full run passed. The tests now run with `API_TARGET=http://127.0.0.1:8000` (the other project no longer holds that address). Screenshots compared with file 08. Live files: only `router.tsx`. **Not done**: the sticker and the PDF in a browser; dark screenshot; the full Playwright suite.

**Next**: loans / amanat (file 12).

**Open questions**: none.

## 2026-11-25 — Loans / amanat in the new product (file 12)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Loans.tsx` at `/new/loans` (behind the `loans` module), full screen with the file's own sidebar and bar, drawn from `12-loans-amanat.html`: four cards (out now with the cost total for the owner / manager, returned, sold to them, the earliest due / longest out), Out / Returned / Sold tabs with a search, a card per phone with its holder and days out, and the chosen phone (cost / asking / target profit, the holder with khata, Call, WhatsApp reminder, came back, kept as a sale with Cash / Online / Khata, cancel with a reason, Open bill, the phone's events, the on-screen slip proof); the "+ Give phone on amanat" drawer. Live APIs only (`/loans`, `/loans/{id}/return|sell|cancel`, `/devices`, `/parties`). Strings in three languages (`nloan`). `data-file="12"` shades.

**Verified**: tsc; Playwright `newui-loans` (new — two loans made on the server, the cards say 2 phones / 18,000; give the third in the drawer with 7 days (server: out with a back date); it came back (server: in stock); kept the second at 15,000 on khata (server: sold with a bill, the person's balance 15,000); cancel the third with a reason (server: in stock); Urdu RTL). Screenshots compared with file 12 (English and Urdu). Live files: only `router.tsx`. **Not done**: the WhatsApp reminder and Online payment in a browser; a salesman's view; dark screenshot; the full Playwright suite.

**Next**: settings (file 07).

**Open questions**: none.

## 2026-11-25 — Shop settings in the new product (file 07)

**Asked (owner)**: "push" (PR #131 opened), then "ok start" — the next screen.

**Done**: `src/newui/pages/Settings.tsx` at `/new/more/settings`, full screen with the shared rail, drawn from `07-shop-settings.html`: the bar (Back, search over every setting, dark, language, Save all changes with a count), five tabs carrying every field of the live settings page (shop & branding with the logo, receipts & currency, printers & barcode with the code word / own pattern, tax & FBR, security & audit rules), and on the right the 80 mm bill in the shop's print language and the price sticker as the form stands. One save sends only the changed fields to `PATCH /shops/current`, `PATCH /barcodes/settings` and `PUT /fbr/settings`; the price pattern's examples are the server's preview; printers stay on the device in the live card's storage. Owner only. Strings in three languages (`nset`). `data-file="07"` shades.

**Verified**: tsc; Playwright `newui-settings` (new — the bill follows address, tagline, PKR, bank, invoice prefix and NTN; the sticker follows the code word (QWERTYUIOP: 45000 → TYQQQ), the CP ID mark and the sticker size; an out-of-order age band blocks the save; one save → the server has address, tagline, owner, PKR, bank tick and name, CMB, the code word, tax 18 %, the PIN rule, ★, barcode prefix AB and the phone HS code, and the unchanged audit bands were not sent; the own pattern with the server's example saved; search across tabs; Urdu RTL). Screenshots compared with file 07 (tabs 1, 3, 5 and Urdu). Live files: only `router.tsx`. **Not done**: the logo upload and an FBR test in a browser; a manager's view (it says the page is the owner's); dark screenshot; the full Playwright suite.

**Next**: the dashboard / home (file 11, screen 3).

**Open questions**: none.

## 2026-11-25 — Home in the new product (file 11, third screen)

**Asked (owner)**: "push" (PR #132 opened), then "ok start" — the next screen.

**Done**: `src/newui/pages/Home.tsx` is now the index of `/new` inside the new frame (it said "not drawn yet"), drawn from the third screen of `11-frame-stock-summary-and-dashboard.html`: greeting, the four periods, Business overview and Shop audit tiles, the eight coloured cards, needs attention, Hazri check in / out, the last 7 days' bars with the best day and where the money sits. Every figure is the live home's (`/reports/day`, `/reports/dashboard`, `/shop-audit/overview`, `/attendance/today`); a salesman sees today only, no profit, today's cash. The 7-day total and the money split as percentages are not shown (the app never works out a total or a share). Strings in three languages (`nhome`). `newui-frame.spec.ts` now expects home on `/new` (the "not drawn yet" check stays on `/new/reports`).

**Verified**: tsc; Playwright `newui-home` (new — a purchase with 5,000 paid, a part-udhaar sale of 15,000, an open repair: sales, phones sold 1, profit, to get, to give, stock, cash & bank match `/reports/day` and `/reports/dashboard`; "1 repairs open" opens `/new/repairs`; 7 bars; yesterday shows nothing; this month the sale again; the stock card opens the summary; Urdu RTL) and `newui-frame`. Screenshots compared with file 11 (English and Urdu). Live files: only `router.tsx`. **Not done**: a salesman's view in a browser; Hazri check in / out in a browser (the shop's attendance module); dark screenshot; the full Playwright suite.

**Next**: the features no file draws, in the files' style (qist, remittance, FBR, exchange, transfers, bulk import, the audit, the control room) — the owner picks the order.

**Open questions**: which undrawn feature first?

## 2026-11-25 — Qist in the new product (designed here, no file draws it)

**Asked (owner)**: "push" (PR #133 opened), then "ok start qist".

**Done**: `src/newui/pages/Qist.tsx` at `/new/installments` and `/new/installments/:id` (behind the `installments` module; home's qist lines already pointed there), drawn like file 12 (amanat) since no mock-up draws qist: the shared rail, the bar with "+ New qist sale" (opens the counter — a plan is made with a sale), four cards = the live views (due today, late, running, finished) with counts of plans, tabs and search, a card per plan with its paid / late / due strip, and the chosen plan: total / paid / left, the plan line, last reminded, Take installment with cash / online (bank) / cheque / from abroad, Remind on WhatsApp, the schedule, customer and guarantor, Open the bill, Cancel this plan with a reason. Live APIs only (`/installments`, `/collect`, `/remind`, `/cancel`). Strings in three languages (`nq`). Found and fixed while testing: the search query shared the list's cache key, so the list stopped refreshing — the search has its own key.

**Verified**: tsc; Playwright `newui-qist` (new — two plans made with sales; the running card says 2 plans; Ahmed's plan line, guarantor and schedule; take 9,000 in cash (server: 1 paid, 36,000 left); Sara 2,000 online needs a bank, then Meezan Bank (server: 38,000 left, the schedule says Rs. 2,000 received); remind (server: last reminded set); cancel with a reason (server: cancelled, running 1 plan); search by guarantor; Urdu RTL). Live files: only `router.tsx`. **Not done**: a late plan in a browser; a salesman's view (no cancel); dark screenshot; the full Playwright suite.

**Next**: the next undrawn feature the owner picks (remittance, FBR, exchange, transfers, bulk, the audit, the control room).

**Open questions**: none.

## 2026-11-25 — Money from abroad in the new product (designed here, no file draws it)

**Asked (owner)**: "push" (PR #134 opened), then "ok start remittance".

**Done**: `src/newui/pages/Remittance.tsx` at `/new/remittance` (owner / manager, as the report), drawn like files 03 / 12: the shared rail, the bar with Today / Week / This month / This year, the Remittance account's balance with Move to bank, received / fees / net / paid abroad, currency chips, all / received / paid with search, a row per remittance that opens its bill or khata, and Money received from abroad on a person's khata (the live payment with the remittance details). Everything is the live software's: the shop audit's international report, `/ledger/accounts`, `/ledger/transfers`, `/payments`. Server (additive, `shopaudit/finance.py`): a stand-alone khata payment made "from abroad" now shows the currency, amount sent, rate, sender, service, fee and status typed with it (before: rupees only); a remittance payment with no details still shows rupees only. Strings in three languages (`nrem`).

**Verified**: pytest `test_shopaudit_finance.py` (with the new `test_standalone_remittance_keeps_its_detail`) and `test_shopaudit_decisions.py` — 7 passed; tsc; Playwright `newui-remittance` (new — a sale paid 500 SAR × 74.2 shows as 37,100 received and waiting; Sara's 200 AED × 76.5 = 15,300 with fee 300, on its way (server: AED, 200, Imran Bhai, pending); received 52,400, fees 300; currency and MTCN filters; move 37,100 to Meezan Bank (server: bank 37,100, waiting 15,300); Urdu RTL). Screenshots in English and Urdu. Live files: only `router.tsx` and the report's additive lines. **Not done**: a purchase paid abroad in a browser; a salesman's view; dark screenshot; the full pytest and Playwright suites.

**Next**: the next undrawn feature the owner picks (FBR, exchange, transfers, bulk, the audit, the control room).

**Open questions**: none.

## 2026-11-25 — Exchange in the new product (designed here, no file draws it)

**Asked (owner)**: "push" (PR #135 opened), then "ok start exchange".

**Done**: `src/newui/pages/Exchange.tsx` at `/new/exchange/new` and `/new/exchange` (behind the `exchange` module), drawn like the counter (file 14) and add stock (file 01): four numbered panels side by side — the customer (search or a new one), the old phone coming in (the live purchase line: IMEI with the in-stock check, brand, model, storage, colour, condition, PTA, battery, trade-in value, resale price, lock checked), the new phone from stock at its price, and the settlement in words with paid now / paid back (cash, online, cheque), the khata after and both ID checks as the live wizard does them (ADR-128) — then the done card with the receipts and the bill; a Recent tab with the live exchanges and delete with a reason. The counter's (file 14) trade-in button now opens this instead of the live wizard. Live APIs only. Strings in three languages (`nex`).

**Verified**: tsc; Playwright `newui-exchange` (new — Ali; the new phone's IMEI typed as the old one is refused; the old Nokia worth 20,000 (resale 26,000); the new phone at 50,000; "Customer pays" 30,000, 20,000 now, 10,000 on the khata; saved (server: one exchange, trade-in 20,000, balance 10,000, old phone in stock, new one sold); Recent lists it; delete with a reason (server: deleted, the new phone back in stock); Urdu RTL). Live files: only `router.tsx`. **Not done**: the shop-pays-back case and a flagged / pending phone in a browser; a salesman's view; dark screenshot; the full Playwright suite.

**Next**: the next undrawn feature the owner picks (FBR, transfers, bulk, the audit, the control room).

**Open questions**: none.

## 2026-11-25 — Branch transfers in the new product (designed here, no file draws them)

**Asked (owner)**: "push" (PR #136 opened), then "ok start transfers".

**Done**: `src/newui/pages/Transfers.tsx` at `/new/transfers`, `/new/transfers/:id` and `/new/transfers/new` (`?device=` puts that phone on the list, as the live screen does), owner / manager as the server; drawn like files 10 / 12: three cards (sent / received / sent back), tabs and search, a card per transfer, the chosen transfer with the cost it moved at, the note and what moved (each line opens the phone or the item), Send this transfer back with a reason; the send drawer with the branch, phones and items with a count, a note and the cost preview. Live APIs only (`/transfers/branches`, `/transfers`, `/transfers/{id}/undo`). Strings in three languages (`ntr`).

**Verified**: tsc; Playwright `newui-transfers` (new — a second branch made through `/shops`; opened with `?device=` the phone is on the list and the only branch chosen; a charger × 2 added; cost 41,800; sent (server: the phone transferred here and in stock at Mall Road, the branch's list says it came in); the transfer's lines; sent back with a reason (server: the phone in stock here again); search; Urdu RTL). The test now waits for the login to finish before setting the shop (the first run raced it). Live files: only `router.tsx`. **Not done**: a shop with three branches (the branch pills); a salesman's view; dark screenshot; the full Playwright suite.

**Next**: the next undrawn feature the owner picks (FBR, bulk, the audit, the control room).

**Open questions**: none.

## 2026-11-25 — Bulk Excel in the new product (designed here, no file draws it)

**Asked (owner)**: "push" (PR #137 opened), then "ok start bulk".

**Done**: `src/newui/pages/Bulk.tsx` at `/new/more/bulk` (owner / manager, as the server), drawn like the stock summary (file 11) and add stock (file 01): five big cards for what to bring in, the three steps with a drop zone (drag a file or tap) and the live options, export in the same layout, the past imports, and the check as a table whose counts filter it, the note column first, a row's every value in a drawer, then Import and what was made. Live APIs only (`/bulk/template`, `/bulk/preview`, `/bulk/import`, `/bulk/export`, `/bulk/imports`). Strings in three languages (`nbulk`).

**Verified**: tsc; Playwright `newui-bulk` (new — the people template downloads; a CSV with 2 good rows, a known sample and a bad one: 2 ok / 1 error / 1 skipped, "Say who owes", Import disabled, nothing saved; the error count filters to one row and the drawer shows it; skip errors → import → 2 people with their old balances on the server; stock with a new brand and a supplier row → 2 phones and 1 purchase bill on the server; export downloads; Urdu RTL). Live files: only `router.tsx`. **Not done**: drag and drop in a real browser (the test sets the file); items / sales / expenses sheets in a browser; dark screenshot; the full Playwright suite.

**Next**: the next undrawn feature the owner picks (FBR, the audit, the control room).

**Open questions**: none.

## 2026-11-25 — FBR digital invoicing in the new product (designed here, no file draws it)

**Asked (owner)**: "push" (PR #138 opened), then "ok start fbr".

**Done**: `src/newui/pages/Fbr.tsx` at `/new/fbr`, drawn like cash & bank (file 03): the bar with where bills go and the FBR guide, the owner's setup checklist (NTN, token saved — never shown —, on, production or sandbox) with Change the setup and Test with FBR, sent / waiting / turned down with Send now, the bills with filters and search, the FBR number to copy or FBR's message, Send again. The FBR settings themselves stay in Shop settings tab 4 — the new Settings page now opens a tab from `?tab=`. Live APIs only (`/fbr/settings`, `/fbr/test`, `/fbr/submissions`, `/fbr/submissions/{id}/send`, `/fbr/send-pending`). Strings in three languages (`nfbr`).

**Verified**: tsc; Playwright `newui-fbr` (new — a new shop: Off, not set up, Test disabled, no bills; NTN and a fake token saved and switched on in sandbox through the API (the token never comes back): Sandbox, "On", the checklist, the NTN, Test enabled; Change the setup opens settings tab 4 with FBR ticked; Urdu RTL; switched off at the end) and `newui-settings`. No test calls the real FBR: no sale is made with FBR on and neither Test nor Send again is pressed — so the bill rows (sent / waiting / turned down) are not exercised by a test. Live files: only `router.tsx`. **Not done**: bill rows in a browser (needs a shop sending to FBR's sandbox); a salesman's view; dark screenshot; the full Playwright suite.

**Next**: the next undrawn feature the owner picks (the shop audit, the control room).

**Open questions**: none.

## 2026-11-25 — Shop audit in the new product: its frame and the overview (designed here)

**Asked (owner)**: "push" (PR #139 opened), then "ok start audit".

**Scope chosen**: the live audit is fourteen screens (~2,100 lines). This step builds the audit's own frame in the new product and its first screen, the overview; the other thirteen sections are listed in the frame and open the live screen for the same period until each is drawn (one at a time, on the owner's word).

**Done**: `src/newui/pages/Audit.tsx` at `/new/audit` (the `reports` module, owner / manager), drawn like the business overview (file 02): `AuditFrame` — the bar with the range and days, the nine presets, from–to and as-of in the address, the side list of sections — and the overview: the full report (PDF / Excel), net sales and real profit with the previous period's figure, needs attention, the period's flows, the balances as start → end → now (or as-of), money by kind as bars, the books' own checks, coverage. Every figure is the live audit's (`/shop-audit/period`, `/overview`, `/reconcile`, `/report`). The previous period is shown as its own figure — the live screen's percentage is not worked out in the app. Strings in three languages (`naudit`; the rest are the live audit's own).

**Verified**: tsc; Playwright `newui-audit` (new — a purchase and a part-udhaar sale; the overview's net sales, bills, profit, purchases, to get, to give and stock match `/shop-audit/overview`; the checks show; Yesterday is in the address and shows 0 bills; From–to shows the dates; Finance opens the live `/audit/finance?preset=this_month`; Urdu RTL). Live files: only `router.tsx`. **Not done**: the as-of view in a browser; the PDF / Excel in a browser; dark screenshot; the full Playwright suite.

**Next**: the audit's sections one by one (finance first?) and the control room — the owner picks.

**Open questions**: which audit section next, or the control room first?

## 2026-11-25 — The provider's control room in the new product: the business view (designed here)

**Asked (owner)**: "push" (PR #140 opened), then "ok start control room".

**Scope chosen**: the live control room is the shop management (`AdminPage` with seven cards, ~1,100 lines) and the business view (`ProviderPage`, ~450 lines). This step builds the new control room's frame and the business view; managing a shop stays the live `/control` for now (linked from the bar). Address: `/control/new` — under `/control` as ADR-115 asks, never inside a shop's frame and not under `/new`.

**Done**: `src/newui/pages/Control.tsx` at `/control/new`: its own dark bar (tabs, the shop app, language, dark, logout; the login sends a provider back here through the live `NEXT_KEY`; a shop's login sees "not for you"), and four tabs in the address (`?tab=`): overview, shops (filters, a card per shop, the panel with deployment switch, reminder, payments and keys), payments (filters, approved total, CSV), keys (make, send, copy, link, renew, new link, cancel with a reason — a reason box instead of the live screen's browser prompt). Live APIs only. Strings in three languages (`nctl`).

**Verified**: tsc; Playwright `newui-control` (new — not logged in → login → back to `/control/new`; no shop counter; monthly income = `/admin/business/overview`; a new shop found by search, its deployment switched to one-PC and back (server); a 3-month key made from its panel and cancelled with a reason (server: revoked, 3 months); the approved total = `/admin/business/payments`; Urdu RTL; a shop's login is denied). Found while testing: the live `e2e/control-landing.spec.ts` fails on clean `staging` code too — logged out, `/control/business` does not go to the login in that test (it did not change here; one more for the stale-tests list). Live files: only `router.tsx`. **Not done**: WhatsApp / SMS sending of a key in a browser; dark screenshot; the full Playwright suite.

**Next**: the owner picks — the control room's shop management, or the audit's next section.

**Open questions**: `control-landing.spec.ts` — look at it with the other stale tests.

## 2026-11-25 — The control room in the new product: managing shops (designed here)

**Asked (owner)**: "push" (PR #141 opened), then "ok start control room shops".

**Done**: `src/newui/pages/ControlShops.tsx`, the "Manage shops" tab of `/control/new` (replacing the bar's link to the current screen, which stays as a small "Current screen" link): the inbox (fees to approve / reject with a reason box / money only, requests for a shop, requests for a password), the provider's settings (billing and payment accounts drawn here; prices and the app link are the live cards), the shops with filters and counts, + Open a new shop, and the shop's panel in sections (plan and fee, modules with the trade ticks, record a payment, owner password with the PIN card, renewal code, branch, and the live special-price / fees-owed / delete cards — used as they are so no action is lost). The business view's Open goes to this tab with the shop. Live APIs only. Strings (`nctl`) in three languages. Small improvement found while testing: a fee saved in the panel now fills an empty payment amount.

**Verified**: tsc; Playwright `newui-control-shops` (new — open a shop with the owner's login (server: that login works), find it, basic at 2,500 and +3 months (server), accessories on (server modules), a payment recorded with a receipt, the owner's new password (server: logs in with it), a renewal code, a branch (server: 2 branches), a payment account added (server) and put back; Urdu RTL) and `newui-control`. Live files: only `router.tsx`. **Not done**: approving / rejecting a real pending fee in a browser (the local database's pending fee was left alone); the bin restore; dark screenshot; the full Playwright suite.

**Next**: the shop audit's sections one by one — the owner picks.

**Open questions**: none.

## 2026-11-25 — Shop audit → Finance in the new product

**Asked (owner)**: "push" (PR #142 opened), then "ok start audit finance".

**Done**: `src/newui/pages/AuditFinance.tsx` at `/new/audit/finance` (the `reports` module), in the audit's frame — Finance is now a drawn section there (the frame links it with the same period). Four tabs in the address: profit & loss (hero, paired bars of net sales and profit, the statement with the period before beside each line), cash & bank (opening → in → out → closing, reasons as bars, each account, channels, money from abroad linking to the new remittance screen), expenses (total, by day, by category with the period before, the largest, by whom / which account) and tax (four figures and each bill). The section's PDF / Excel. Every figure is the live audit's (`/shop-audit/pnl|cash|international|expenses|tax`); the live screen's percentage changes are shown as the period before's figures. Strings in three languages (`nfin`). `newui-audit.spec.ts` now expects twelve sections still opening the live screens and checks one of them (Sales).

**Verified**: tsc; Playwright `newui-audit-finance` (new — a purchase, a cash sale and an expense: from the frame Finance opens with the period; the hero, net sales and buying price match `/shop-audit/pnl`; money in / out / closing match `/shop-audit/cash`; the expense total and the largest expense match `/shop-audit/expenses`; tax 0 of 1 bills; a reload keeps the tab and the period; Urdu RTL) and `newui-audit` — both pass alone and together (1.4 min). A first combined run hung for 22 minutes and closed its browser; run again, alone and together, both passed — the hang was this machine's, not the code's. Live files: only `router.tsx`. **Not done**: as-of in a browser; a shop with tax on; dark screenshot; the full Playwright suite.

**Next**: the audit's next section — the owner picks (sales, returns, people, udhaar, len-den, repairs, stock, products, bills, staff, security, reports).

**Open questions**: none.

## 2026-11-25 — One item's page (file 17) in the new product

**Asked (owner)**: "m nay kuch r be ui html files add ki hn ous ko be analyze karo r rename karo" (files 16–19 named and listed, commit `40369a2`), then "ok start item detail file 17".

**Done**: `src/newui/pages/ItemDetail.tsx` at `/new/item/:id`, drawn from file 17 (the final of the three item drafts) with its own top bar. Every job of the live phone page with the same conditions (`DeviceDetailPage.tsx`): Sell / Return, Reserve, Amanat, Repair and More actions; quick edits, stock & ledger movement and the danger zone; cards for identity, verification, condition, specs & box, cost & margin, market & ageing (the server's price hint), the purchase / sale khata (`/devices/{id}/money`), the timeline, the 50×30 sticker (the server's preview) and warranty; WhatsApp pitch copied. New-style drawers for note, asking (PIN / approval), amanat, purchase price, IMEI, type and lock check; the live sheets for faults, reserve, PTA, the sticker window and removing old stock. The new counter now takes `?device=` (the unit is put on the bill once). `ReserveSheet` is exported from `ReserveCard.tsx` (no change in behaviour). The new loans, purchases and transfers screens open this page instead of the live one. Palette `[data-file='17']`. Strings `nitem` in three languages.

**Verified**: tsc; Playwright `newui-item` (new — a purchase of two, one sold: the page's cost / paid / still to pay match `/money`, the dealer on the khata, the same model's sale in the range; asking changed to 38,000 on the server; a note in the timeline; the purchase price to 31,000 on the khata; pitch copied; the sticker preview; Sell opens the counter with one line; amanat to the dealer puts it on loan; More actions; Urdu RTL), `newui-loans`, `newui-sale` — pass. **Not done**: a laptop / watch / faulty / sold unit in a browser; dark screenshot; the full Playwright suite.

**Next**: the owner picks — the audit's next section, or file 16's six-tab audit design.

**Open questions**: none.

## 2026-11-25 — The item ledger sheet (file 20) and the new mock-ups 20 / 21

**Asked (owner)**: "push kr do . r m nay r be html ui page add kiye hn ous ko analyze karo r rename karo r item k be ak detail page hai with ledger sheet be be add kr do".

**Done**:
- Pushed `ui/28-new-item-detail`, PR #144 (it also shows #143's commits until #143 is merged).
- Mock-ups renamed (outside the repository) and listed in `00-INDEX.txt` and docs/43: `20-item-detail-with-ledger-sheet` (17 plus the item's own ledger), `21-party-khata-full-ledger` (a person's khata, full version: stock with them, channels, profit, ledger with fix / edit, stock tracker, brand breakdown, method log, A4 ledger report) and `21b-…-statement-print` (the same, a minute older, its print a "Khata Statement").
- Backend (additive, read-only): `units/ledger.py` — `item_ledger` derived from `device_money`'s timeline (out: purchase, old stock, branch in, a customer return less what was kept; in: sale, return to the seller, branch out; payments as cash beside, never the net), returned as `ledger` on `/devices/{id}/money` for VIEW_COST only (else `null`); return rows gain `line_amount` and `status` (a voided return is not counted); `GET /devices/{id}/ledger-sheet` A4 HTML (shop header / footer, en / ur) and `?format=csv`, VIEW_COST only.
- The item page: "Item ledger sheet" in the header, the "Complete item ledger" card, and the window with the server's sheet as preview, Print, CSV and a summary to share. Strings `nitem.lg`.

**Verified**: pytest `test_item_ledger` (new: the Vivo scenario's lines and net equal its margin, payments do not move the net, an unsold unit's expected profit, a customer return with a 2,000 cut, the sheet in en / ur, the CSV, a salesman gets no ledger and 403 on the sheet and CSV), `test_units`, `test_returns_audit` — pass; tsc; Playwright `newui-item` with the ledger (out / net / lines match `/money`, the sheet's preview has the bill, CSV downloads, summary copied) — passes. **Not done**: a branch-moved or old-stock unit in a browser; the full suites.

**Next**: the owner picks — file 21 (the person's khata, full version) in the new product, or the audit's next section.

**Open questions**: file 20 puts the extra actions in one row of chips where 17 had three groups — the page keeps 17's groups (tell me if 20's row is wanted).

## 2026-11-25 — A person's khata, full version (file 21) in the new product

**Asked (owner)**: "push" (the ledger sheet on PR #144), then "FILE 21 pr kam start karo party khata ka mukammal naya design".

**Done** (branch `ui/29-new-party-khata`, cut from `ui/28-new-item-detail`):
- Backend, read-only and additive — `units/khata.py`: `GET /parties/{id}/khata` (the phones bought from them and where each is now — in the shop with its days, sold with its price and profit as the shop audit's journey counts it, returned — and those sold to them; the piles and the dearest still in the shop; brand & model by brand + `name_key`; money by channel = posted payments by method + the money paid at the counter on their bills, from the ledger's cash lines by account kind; the old balance; the promised date of open len-den from `lending_due`), cost / profit / money paid out only with VIEW_COST; `GET /parties/{id}/khata-report` — the A4 statement (period, sections channels / models / units / ledger, profit only when asked and allowed, en / ur; a deleted entry and its reversal are not printed).
- `src/newui/pages/Khata.tsx`: the person's page redrawn from file 21 (no sidebar; top bar with the people switcher, eye, full report; the person's dates and promise with Change; four buttons, the entry as a window with a date; four cards; five tabs with search and kind filter; Fix / Edit per ledger line opening the live correction; stock tracker with sell / return to dealer; models; method log with receipts; len-den & old balance; the report window with the server's page as preview, presets, from / to, sections, PDF / CSV / print / WhatsApp). The file 06 layout is replaced; every action it had stays. Strings `nkf` (+ `nkh.openClassic`, more `nkh.doc.*` names).

**Verified**: pytest `test_party_khata` (new: units, piles, profit equal to the journey's sourced profit, models, channels with the counter cash and a bank payment, old balance, promise; the report in en / ur, with a period and one section; a salesman sees no cost, profit, paid-out money, old balance or dearest, and the report prints no cost or profit), `test_item_ledger`, `test_units` — pass; tsc; vitest 72; Playwright `newui-party-khata` (new: the cards match `/khata`, the stock filter, models, the method log, Fix / Edit deletes a bank payment with a reason and the balance moves back, the promised date changes, the report's preview, a section off, a preset, CSV, Urdu RTL), `newui-khata` (updated for the new tabs, no sidebar) and `newui-frame` — pass. **Not done**: dark screenshot; a customer-only person in a browser; the full suites.

**Next**: the owner picks — the audit's next section, or file 20's one-row actions on the item page.

**Open questions**: file 21 has no sidebar — the person's page now follows it (the other new screens keep theirs).

## 2026-11-25 — The item's work completed: expenses on a unit, QC matrix, a stock item's page

**Asked (owner)**: "145 merge kr di hai" (staging deployed, run green), then "abhi item ka sara kam complete kr lo phlay".

**Done** (branch `ui/30-item-complete`, from `staging`):
- Backend, additive: `devices/expenses.py` — `POST /devices/{id}/expenses` (amount, kind, note, cash account; owner / manager) posts stock up on the unit and the cash account down (the posting a repair of an own phone already makes), raises the unit's `cost_price` and writes event `cost_added` (new, a money event — never through the generic events endpoint); `POST /devices/{id}/expenses/{group}/undo` reverses it with a reason while the unit is the shop's; `unit_costs` lists expenses and repair costs from the ledger. `/devices/{id}/money` gains `costs`, `summary.added`, `summary.net_cost`, `summary.true_margin` (`margin` keeps its meaning); the item ledger adds the costs as lines and its totals carry base / added / net cost; the A4 sheet's four boxes are base, added, true net cost, profit (as file 20).
- **Fix found on the way** (`returns/service.py`): a unit returned to its seller credited stock only with its bill line, so what had been added to it (a repair until now, an expense from now on) stayed in stock after the unit had gone. The added part now leaves stock as a cost of goods sold ("added cost written off") — `test_unit_expenses` pins it.
- Item page: the cost card as the file draws it (base / added / true net, the expenses with Delete, paid / still owed, expected or made profit from the server), + Add expense, the QC matrix from the unit's faults.
- `src/newui/pages/StockItem.tsx` at `/new/stock-item/:id` (see docs/43); the new counter also takes `?item=`; purchases and transfers open the new item page. Strings `nitem.ex`, `nitem.qc`, `nsi`, `stock.events.cost_added`.

**Verified**: pytest `test_unit_expenses` (new: cost, stock and cash move together and the books balance; the profit at sale is after the expense; a sold unit takes no expense; undo with a reason, twice refused; a return to the seller leaves no stock of the unit and books the added cost; never through the generic events; a salesman 403 and sees no costs) and the related files (devices, device types, ledger, purchases, repairs, repair labs, returns, returns audit, returns preview, statements, units, item ledger, party khata — 87 pass); tsc; vitest 72; Playwright `newui-item` (expense added and deleted, the QC matrix marks and clears a fault), `newui-stock-item` (new), `newui-sale`, `newui-purchases`, `newui-transfers` — pass. **Not done**: a laptop / watch / tablet's QC in a browser; dark screenshots; the full suites.

**Next**: the owner picks — the audit's next section, or file 20's one-row actions.

**Open questions**: should an expense also be allowed "on the khata" of a technician / supplier (now only from a cash account)?

## 2026-11-25 — The stock screen (file 23) in the new product

**Asked (owner)**: "push" (PR #146), three more mock-ups to add (22 the audit, 23 the stock screen and its final, 24 the bills — named and listed), then "ok start" (23, as advised).

**Done** (branch `ui/31-new-stock`, cut from `ui/30-item-complete`):
- Backend, read-only and additive — `app/modules/stockhub/` (`GET /api/v1/stock-hub/overview`, `/models`, `/parties`, `/ledger`): a card per kind and a row per brand (in shop / sold / avg cost / cost / asking / bought / sold value), what the shop owes everyone (the khata balances), per model (brand + `name_key`) or per item, per dealer / customer the stock was bought from (still here, sold, returned, pieces, cost, billed, balance), and the stock ledger from the device events that move a unit and the items' movements (voucher, party, qty, unit cost, price and profit when sold, stock at cost after, with period / kind / move / brand / party filters and the period's totals). Cost, profit and balances only with VIEW_COST.
- `src/newui/pages/StockHub.tsx` at `/new/stock` (see docs/43). Strings `nst`.

**Verified**: pytest `test_stock_hub` (new: the kinds, brands and payable on a purchase of three with one sold, one returned to the seller and an item with two pieces sold; the cost equals the books' stock; per model and per item; the dealer's still-here / sold / returned / billed / balance; the ledger's moves, the sale's price and profit, the totals, and the stock at cost after the last movement equal to the books' stock; filters by kind and move; a salesman sees no cost, profit or balance), tsc, Playwright `newui-stock-hub` (new: summary figures match the server, a brand's models, units with the tiles, the column chooser removing and restoring cost, a status filter as a chip and cleared, a unit opening its page, a dealer opening their khata, the ledger matching the server and filtered by move, Urdu RTL) — pass. **Not done**: a big shop's speed (the ledger reads all events; limited to 500 rows on screen), dark screenshot, the full suites.

**Next**: file 24 (bills, F10), then file 22 (the audit).

**Open questions**: none.
