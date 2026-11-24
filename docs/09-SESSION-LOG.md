

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
