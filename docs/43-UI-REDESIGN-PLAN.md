# 43 — UI redesign from the owner's new screens (plan)

Owner, 2026-11-22: "the UI is to be as in the new files — it is easy to use. Redesign every page on its
own branch; read each page's structure and build what is new in it; keep everything that exists; do not
disturb the shops that run the software. A `staging` branch from `main`: every branch is merged into
`staging` first, tested there, and only then `staging` goes to `main`." Decision: ADR-132.

Status: **ADR-134 under way. The live software is exactly what `main` has (only `router.tsx` gains the `/new` addresses). The new product at `/new` has its frame and four screens: the stock summary, the brand / model drill-down (file 11), the counter (files 14 + 15) **add stock** (`/new/purchase/new`, file 01) the **purchases list with its bill** (`/new/purchases`, file 10) **a person's khata** (`/new/khata`, `/new/parties/:id`, file 06) **cash & bank** (`/new/more/cash`, file 03) **the day's hisaab** (`/new/hisaab`, file 04) **expenses & day closing** (`/new/expenses`, file 05) **the business overview** (`/new/overview`, file 02) **repairs & lab hub** (`/new/repairs`, file 09) **a repair job's page** (`/new/repairs/:id`, file 08) **loans / amanat** (`/new/loans`, file 12) **shop settings** (`/new/more/settings`, file 07) **home** (`/new`, file 11's third screen) and, designed here, **qist** (`/new/installments`) **money from abroad** (`/new/remittance`) and **exchange** (`/new/exchange`). Everything else under `/new` says it is not drawn yet and opens the live address. Next: the other features no file draws (FBR, transfers, bulk, the audit, the control room), in the files' style — the owner picks the order.**

## 1. The source

Fifteen stand-alone HTML mock-ups (thirteen on 2026-11-22, the two sale screens on 2026-11-23) in `C:\Users\HP\Documents\projects\mobile shop\new mobile shop ui\`
(outside the repository — they carry a live shop's people and mobile numbers as sample data, so they are
**not** committed; ask the owner for the folder if it is missing). Each is one file: Tailwind from a CDN,
Lucide icons, its own sample data and its own click handlers. They are pictures of a screen that can be
clicked, not code to copy: no API calls, English only, laptop width first.

Renamed 2026-11-23 on the owner's word: five of them arrived with the same name and different
screens inside. Each file is now `NN-<what it is>.html`, where `NN` is the number this document
already used, so "mock-up 11" is `11-frame-stock-summary-and-dashboard.html`. `00-INDEX.txt` in the
folder lists them.

To look at them again: render with Playwright (1440 × 900 and 412 × 900) and read the text of the page and
of its hidden panels — a mock-up hides its second and third tabs, drawers and pop-ups in the same file.

## 2. The look the mock-ups share

| Part | In the mock-ups | In the app today |
|---|---|---|
| Colours | near-white ground `#F4F6F9`, white cards, ink `#0B0F19` for the chosen thing, lime `#9AE600`–`#B4F000` for the main action, green = came in / to get settled, red = went out / to give, amber = pending. Dark: "obsidian" `#05070C` | tokens in `index.css` (`--ground`, `--surface`, `--ink`, `--emerald` …), eight colour sets (ADR-129) one of which is already "Lime" |
| Type | Inter for text, Plus Jakarta Sans for headings and figures, JetBrains Mono for IMEI / bill no. / small figures | Manrope / Inter by choice, Noto Nastaliq Urdu |
| Frame (laptop) | fixed left panel: shop name, Dashboard, a grid of counter tiles with their F-keys (Sell F2, Add stock F3, Udhaar F4, Stock F6, Repair F7, Expense F8, Return F9, Invoices F10), then Shop / Accounts tiles, the user at the foot; a top bar with Back, the title, and the page's own switches (cost visible, language, dark) | `Shell.tsx` + `SidePanel.tsx`, F-keys already wired in `Shell.tsx` |
| Frame (phone) | the same content in one column, the panel behind a menu button | bottom navigation bar, one column |
| Page pattern | a row of figure cards on top; then **two panes**: a list on the left, the chosen row's details ("inspector") on the right; entry forms open as a drawer, not a new page | one column, a row opens a new page |
| Entry pattern | pills / chips to choose instead of dropdowns, preset amounts (+100, +500 …), a live preview of the 80 mm slip or sticker beside the form | step-by-step wizards, pickers |

## 3. Rules for this work

**Changed 2026-11-23 (ADR-134).** Rules 1-8 below were written for a page-by-page redesign of one
product. They still describe the **live software**, which is now frozen as a design. For the **new
product** these rules replace them:

- **The mock-up file is the specification.** Pixel to pixel: layout, spacing, type, colours, the dark
  theme and the hidden tabs, drawers and pop-ups inside the same file. Render it and compare side by
  side before calling a screen done.
- **Its own look.** The mock-ups' colours and fonts are the product's look; the shop's Appearance
  colour sets do not repaint it (rule 3 below is withdrawn for the new product).
- **Its own files.** Own shell, own pages, own theme scope. An `if (newUi)` branch inside a live page
  is a change to the live product and is not allowed.
- **Urdu, RTL and the phone still hold** (rules 4 and 5), because the mock-ups themselves reflow and
  carry an Urdu switch — pixel-perfect means the English laptop screen it draws, not English-only.
- **No new dependency** (rule 7) and the standing product rules (rule 8) still hold.

### The original rules (they now describe the live software)

1. **Nothing a shop has today is removed.** Every action, field, permission (`VIEW_COST`, roles, modules,
   `useTrade`), "?" help, print and download a page has now is on the new page. A mock-up that leaves
   something out does not delete it — it gets a place in the new layout.
2. **The server is not touched for looks.** A redesign branch changes the app only. Where a mock-up shows
   something the software does not do (§4, "new"), that is built as its own additive piece — new optional
   field or endpoint, additive migration, tests — and listed in the branch's PR. Sample-only things in a
   mock-up are not built (§4, "not built").
3. **Tokens, not hex.** The mock-ups' colours become the design tokens; no page writes a colour of its own.
   The eight colour sets, dark mode, text size, corners and font choice of ADR-129 keep working on every
   redesigned page.
4. **One language at a time.** The mock-ups mix English with Roman Urdu ("Paisa Aya (Received / In)",
   "Remaining (Dene Baqi)"). In the app that is only the bracket hint of ADR-094 (`gloss.ts`) or the one
   line under a button of ADR-112 (`<Say>`). Every string in `en.json`, `ur.json`, `roman.json`; Urdu is
   RTL in Nastaliq and every new layout is checked in it.
5. **Phone first still.** Most shops use a phone. Two panes become list → details on a narrow screen; no
   sideways scroll at 320 px; the bottom bar stays.
6. **`data-testid`s and labels stay** wherever the thing still exists, so the 145 Playwright tests keep
   guarding the behaviour. A test is changed only when the screen's steps really changed, in the same branch.
7. **No new dependency.** Charts stay in-house SVG; icons stay `lucide-react`; a font is added to the one
   Google Fonts link in `index.html`, where Inter, Manrope and Noto Nastaliq Urdu already come from.
8. **The other ADR rules hold**: the app never talks to a printer (previews are the server's page, ADR-119,
   ADR-114); totals are the server's; cost only with `VIEW_COST`; a delete is the server's `delete-check`.

## 4. The screens: what each mock-up is, and what is new in it

"New?" is a first reading against what the software has. **Each branch starts by reading the mock-up file
and the page's code in full and writing the exact table (exists / new / not built) in its PR** — the
column here is what to check, not the verdict.

| # | Mock-up file | The app's page(s) | Layout change | New? (to confirm in the branch) | Not built (sample only) |
|---|---|---|---|---|---|
| 11 | `11-frame-stock-summary-and-dashboard` — Smart POS & Inventory (3 screens) | `Shell`, `SidePanel`; `/stock/summary`; `/` | the new frame; stock summary: dark hero with avg. unit cost / top category / stock health, active kinds as big cards with share bar, empty kinds as small "+ Add" cards, the three sheets as cards; brand drill-down with sort (value / units / avg.) and share of capital; Home with period tabs | avg. unit cost, top category, share of capital per brand, sort of brands; "+ Add" on an empty kind | "Counter #1 Online"; the switch between two shops' sample data; attendance "check in" |
| 13 | `13-stock-cards-preview` | the kind cards of `/stock/summary` | the cards' finish in dark ("glass") and light | — (style reference) | "Copy CSS" |
| 14 | `14-sale-pos-full` — Complete POS Sell Screen (the later and fuller of the two; dark shown first) | `/sale/new` (`SaleWizard`), with `ExchangeWizard`'s trade-in | one screen instead of steps: the stock as cards on the left (kind tabs All / Mobiles / Tablets / Smartwatches / Laptops / Accessories with counts, quick filters box pack / PTA / ID pending / hide faulty, search with "/" and the scanner), the bill on the right (walk-in or khata customer, lines with the deal price typed in place, pieces for an item, warranty per line, trade-in added in the bill, discount and tax ticks, cash / online / udhaar / split, net payable, hold, complete and receipt) | **held bills** (park a bill and take it up again); warranty chosen per line; split payment on the same screen; the estimated profit of the bill (only with `VIEW_COST`); a card marks "ID pending" and "faulty" before it is tapped (ADR-128: with "Check now" and the skip) | "Simulate scan" and its beep; a walk-in's free-typed name where the app asks for a person |
| 15 | `15-sale-pos-first-draft` — New Sale POS (the earlier draft, light) | the same | as 14, with a row of brand pills, "amount paid now" with "full paid", cheque as a way to pay, "+ Add charger / cover" on the bill | brand pills; cheque (with 01) | — |
| 01 | `01-add-stock-and-purchase` | `/purchase/new` (`PurchaseWizard`, `DeviceLineSheet`, `ItemForm`), `/stock/opening` | one screen instead of steps: source and dealer with the khata's state, the device builder with pills (kind, brand, model, storage, colour, PTA, condition, what came with it), the bill "cart" and payment on the right, stickers after saving | region / SIM variant (LL/A, ZA/A; physical + eSIM); "locked phone" as its own tab (iCloud / FRP / MDM); shelf / rack; "Later" for an accessory owed with the phone; cheque as a way to pay; live margin | "Auto-gen test IMEI" |
| 10 | `10-purchases-and-bill-inspector` — Purchases & Bill Inspector | `/purchases`, `/purchases/:id` | figure cards (total, paid, still to pay), bills as cards showing their phones and IMEIs, the chosen bill beside the list with pay / edit / change party / delete | search by model or IMEI across bills; quick filters by source | — |
| 06 | `06-person-khata` | `/parties/:id` (`PartyDetailPage`, `PartyLending`, `OldBalance`), `/khata` | header with Call / WhatsApp hisaab / Edit; two big buttons "money came" / "money given"; four figure cards; tabs ledger / phones bought & sold / len-den & old balance; the entry as a drawer with preset amounts | switch between people in a strip; profit from this person (cost only) | "Delete person" as shown (the app's delete-check decides) |
| 03 | `03-cash-and-bank` | `/more/cash` (`CashAccountsPage`) | figure cards (all money, cash, bank, in / out), accounts on the left, the chosen account's book on the right with running balance, filters, search | Easypaisa / JazzCash as kinds of account; export / print of one account's book; search in the book | — |
| 04 | `04-day-hisaab` | `/hisaab` (`DayReportPage`) | period tabs, a hero (sold, total, profit), "left in hand" with came in / went out, six figure cards, "what was sold" with tabs (cash / part udhaar / full udhaar) and search, a sale opens beside it | filter of the sold list by how it was paid; receive the udhaar of a sale from here | — |
| 05 | `05-expenses-and-day-closing` | `/expenses` | quick expense: category tiles, paid from, amount with presets, note; the list with a share-by-category bar and filters | **closing the day**: counted cash against the expected drawer, the difference, an 80 mm closing slip — to check against what the day's hisaab already has | "Show sample entries" |
| 02 | `02-business-overview` | `/overview` (`OverviewPage`) | four figure cards, two charts (sales / purchases; profit by day with to-get / to-give), four tabs: today's pulse, udhaar and reminders, top models and stock alerts, recent activity and totals | activity feed with filters (owner only — the security feed's rule); "Settle" from the list | "LIVE" badge |
| 09 | `09-repairs-and-lab-hub` — Repairs & Lab Hub | `/repairs`, `/repairs/new`, `/repairs/labs` | intake on one screen in three numbered blocks (customer and device, problem and what came with it, who repairs and the estimate) with the slip beside it; jobs board with figure cards and filters | "ready by" presets; estimated profit while typing | "Test print" as a printer call (ADR-119: the device's print window only) |
| 08 | `08-repair-job-detail` — Repair Job Detail | `/repairs/:id` | job header with Call / WhatsApp status link, the four steps as a stepper that is tapped, bill and settlement with "collect remaining", the history, the slip beside it | restore a cancelled job (to check) | "Double-entry verified" label |
| 12 | `12-loans-amanat` — Loans (Amanat) Hub | `/loans` | figure cards (out now, returned, sold, longest out), tabs out / returned / sold, the chosen phone beside the list with the holder, "came back" / "they kept it — make it a sale", history, the slip | a due date with an overdue mark (to check); WhatsApp reminder to the holder | — |
| 07 | `07-shop-settings` | `/more/settings` (+ `BusinessProfile`, `PrintersCard`, `PriceCodeCard`, `FbrCard`, security) | five tabs (shop and branding, receipts and currency, printers and barcode, tax and FBR, security and audit rules), a search box over all settings, the 80 mm bill and the sticker previewed live beside the form | search across settings; live preview while typing | "Upload logo" as simulated; the price code shown on a sticker to anyone (ADR-117: only with `VIEW_COST`); a single "Save all changes" if a card saves by itself today |

**Screens with no mock-up** (they get the new frame and tokens from the foundation, and are redone in the
same patterns after the fifteen — or from further mock-ups if the owner sends them): the stock list and a phone's page, invoices, returns and the return form, exchange,
accessories, people (list), reports and accounts, the Shop Audit pages, staff, bulk import, appearance,
fees, transfers, installments, the assistant, login / signup, the landing page, the provider's control room.

## 5. Branches

```
main ──► staging ──► ui/00-foundation ──PR──► staging ──(tested)──PR──► main ──► the shops
                 ├─► ui/01-stock-summary ─PR─► staging
                 └─► …
```

- `staging` is cut from `main`. A redesign branch is cut from `staging`, named `ui/NN-<page>`, and comes back
  by pull request into `staging` (CI runs on every pull request and on every push to `staging`).
- **Only `main` deploys.** Nothing merged into `staging` reaches a shop.
- `staging` → `main` is a pull request the owner merges, after the pages on `staging` were tested, with the
  usual routine (after the shops close, `/opt/mobileshop/backup.sh` first).
- Urgent fixes for the live shops still go `develop` → `main` as before; after each such release `main` is
  merged into `staging` so the two do not drift.

| Order | Branch | Mock-up | Contents |
|---|---|---|---|
| 0 | `ui/00-foundation` | all | the mock-ups' colours as the tokens of a colour set, the three fonts bundled, the new laptop frame (panel with F-key tiles, top bar), and the shared parts every page needs: figure card, two-pane list + inspector, pills / segmented choice, drawer, tab strip, slip preview frame. No page's content changes. |
| 1 | `ui/01-stock-summary` | 11, 13 | stock summary and the brand drill-down |
| 2 | `ui/02-sale` | 14, 15 | the sale on one screen: stock cards, the bill, held bills (where 14 and 15 differ, 14 is followed and what only 15 has — brand pills, paid now, cheque — is added) |
| 3 | `ui/03-add-stock` | 01 | new purchase / add stock |
| 4 | `ui/04-purchases` | 10 | purchases list and bill inspector |
| 5 | `ui/05-person-khata` | 06 | a person's khata |
| 6 | `ui/06-cash-bank` | 03 | cash and bank |
| 7 | `ui/07-day-hisaab` | 04 | the day's hisaab |
| 8 | `ui/08-expenses-closing` | 05 | expenses and closing the day |
| 9 | `ui/09-overview` | 02 | business overview |
| 10 | `ui/10-repairs-hub` | 09 | repair intake and the jobs board |
| 11 | `ui/11-repair-detail` | 08 | a repair job |
| 12 | `ui/12-loans` | 12 | amanat |
| 13 | `ui/13-settings` | 07 | shop settings |
| 14 | `ui/14-home` | 11 (third screen) | Home |
| 15+ | `ui/NN-…` | — | the screens with no mock-up, one per branch |

**Each branch, in this order**: (1) read the mock-up file whole, with its hidden panels and its script;
(2) read the page's code and tests; (3) write the table exists / new / not built; (4) build the layout from
the foundation's parts, keeping every existing action and test id; (5) build the "new" items, additive;
(6) strings in three languages, help texts; (7) check English, Urdu (RTL), dark, 320 px and 1440 px with
screenshots beside the mock-up; (8) `tsc`, vitest, the Playwright tests of the page, pytest if the server
changed; (9) pull request into `staging` with the table and the screenshots; (10) docs (progress, session
log, manual when the steps a shopkeeper follows changed).

### What the foundation holds (`ui/00-foundation`)

- **The frame is a design, not a replacement**: `Layout` gained `counter` (More → Appearance → Design →
  **Counter**). On a laptop the panel runs from top to bottom: the shop's mark and name, Dashboard, the
  jobs as tiles with their F-keys (the first in the job's colour, the second dark), the shop's pages, who
  is logged in; the header keeps only its buttons. Classic, Tiles, Simple and Bold are untouched and
  **Classic is still what a shop sees until it chooses** — making Counter the default is the owner's call.
  A phone is the same in every design. In Urdu the shop's pages are two to a row so no name is cut.
- **Colours**: none added — the "Lime" set of ADR-129 already is the mock-ups' lime on near-black; the
  frame draws with the tokens, so it takes whichever set the shop chose.
- **Fonts**: Plus Jakarta Sans as `font-display` (headings, big figures; follows the shop's chosen font
  when it chose one) and JetBrains Mono as `font-mono` (IMEI, bill numbers, keys).
- **`components/kit.tsx`**: `StatCard` / `StatRow` (the figure cards), `SplitView` (list + inspector; on
  a phone the details take the list's place), `Pills` (also `segmented`), `TabStrip`, `Drawer` (from the
  side on a laptop, the usual sheet on a phone), `SlipFrame` (holds the server's printed page at paper
  width). Pages are built from these from `ui/01` on.
- Tests: `kit.test.tsx`, `e2e/counter-frame.spec.ts`.

### `ui/01-stock-summary` — what was found and built (mock-ups 11, 13)

| | |
|---|---|
| Exists, kept | the cards per kind and `?kind=`, brands → models → the stock list, accessories by their kind, the download, "See all phones", both sheets (tally with the staff copy, item-wise), the "?" texts, every `data-testid`, cost only with `VIEW_COST` (a salesman's figures are at asking price) |
| New | in the heading: what one piece comes to, the biggest kind with its part, accessories running low; a kind's card: its biggest brand and its part of all the stock; kinds with nothing shown small under "Nothing in stock yet"; in a kind: "where the money sits" bar (three biggest brands + the rest), search by brand or model, order by value / pieces / dearest, each brand's and model's average and part; an empty kind offers **Add stock** |
| Not built | "Counter #1 Online"; the switch between two shops' sample data; "Stock health: Healthy" as a judgement (the card says what is known: how many items run low); print / share buttons drawn on the item-wise card beyond the download and share it has |

Server: `reports.stock_summary` gained `avg`, `total`, `top_kind`, per kind `avg` / `share` / `top_brand`, per brand and model `avg` / `share`, per accessories kind `share` — percentages as plain numbers, added keys only (ADR-131's rule: the page shows the server's figures; it orders and searches, nothing more).

### `ui/02-sale` — what was found (mock-ups 14, 15) and what is built so far

Reading `SaleWizard.tsx` corrected the first table: most of what the mock-ups show **already exists** —
on a laptop the stock and the bill side by side, held bills (`HeldSales.tsx`), warranty per line, the
scanner, discount, tax, several pieces of one model at once. And the app does much the mock-ups do not
show, all of which stays: installments, money from abroad, cash given and the change, the old udhaar
taken from the change, editing a bill, the ID-check skip and the stolen flag, selling below cost with
the owner's yes, the asking price revised at the counter, price hints, what goes with the phone
(now / later). So the sale is restyled in place, not rebuilt.

| | |
|---|---|
| Exists, kept | everything above; every `data-testid`; the kind buttons; "Pick several"; the search with Scan |
| New, part A (built) | the stock as **cards** (`SaleStockCard`: name and details, marks, IMEI, asking price, cost only when the server sent it), a card on the bill is marked, **quick ticks** that hide cards (only box pack, only PTA approved, ID check pending, without faulty), a line saying how many are shown; in the Counter design a wide page uses the screen's width |
| New, part B (built) | on each phone's line "Cost … · this one earns / loses …" when the server sent the cost; on a laptop the buyer is asked first and the total with Complete sale and Hold stays in view while the bill scrolls |
| Left as it is | the lines keep their full height: warranty and what goes with the phone stay open on every line (owner 2026-10-27: hidden behind "more options" nobody found them) |
| Not built | the whole bill's "estimated profit" (the app does not hold an accessory's cost, so the figure would be part of the truth — the line's own margin is shown instead; a true figure needs a server preview like the return's, ADR-102); "Simulate scan" and its beep; brand pills (mock-up 15 only — a brand's name as a second button on the screen collides with picking a phone by its name; the search does it); counts on the kind buttons (the stock screen's count includes pieces that cannot be sold, so it would not match the list) |

**Found and closed**: a half-filled form is kept in the tab for 30 minutes (`lib/draft`), and logging out did not clear it — an owner's draft sale holds the phones' cost, and a salesman logging in on the same tab got the bill back (the below-cost warning could already show it). `auth.logout` now forgets every draft (`forgetAllDrafts`); `e2e/sale-cards.spec.ts` pins it.

**Five Playwright tests fail on `staging` without any sale change** (found 2026-11-23 by running them with
the change stashed): `forms-keep` (Print sticker on a phone's page), `offline` ("Sold" on the stock
list), `plan-reminders` (the receipt's number), `pricehint` ("Change asking price" on a phone's page),
`urdu` (USB / LAN / CP on the settings page). They are stale against earlier work (the phone's page of
ADR-114, the printers card of ADR-119) — Playwright is not part of CI. To be repaired in a branch of
their own before the release to `main`.

### `ui/03-add-stock` — what was found (mock-up 01) and what is built so far

Already in the app, so not "new": the locked phone (iCloud / FRP) as its own button (`LockedLineSheet`,
ADR-085), Apple's region variant (`AppleVariant`), the dealer's khata state beside the picker, a line's
discount and what it earns (`LineFoot`, ADR-124), the review before saving, the stickers after it.

| | |
|---|---|
| Exists, kept | the three steps on a phone, the source cards, the person picker, every add button, the bill's lines, discount, "when bought", the payment, the review sheet, the done step with stickers and the ID check, every `data-testid` |
| New, part A (built) | on a laptop "from whom" and the bill side by side — the bill opens once the seller is chosen, the total and **Put in stock** stay in view; the page uses the wide layout |
| New, part B (built, new design only) | on a laptop the device's form opens **on the screen** under "from whom", beside the bill — no sheet over the page — for a new line, a locked phone and an edit; **memory and colour are pills** (a second tap takes the choice back). Brand, model, condition, PTA and SIM lock were buttons already. On a phone the form stays a sheet (there is no room beside the bill), with the pills |
| Checked: already there | shelf / place, warranty months, "Later" for what came with the phone, cheque in the payment picker — all in the existing form, so in both versions |
| Not built | "Auto-gen test IMEI" |

### Screens drawn so far

| Screen | From | Notes |
|---|---|---|
| The frame | `11-frame-stock-summary-and-dashboard` panel + header | class for class; the prototype's screen-switcher tabs and "Counter #1 Online" are sample decoration and are not built |
| `/new/stock/summary` | the same file, screen 1, with mock-up 13's kind icons | hero (worth, avg. unit cost, top category with its biggest brand, stock health), active kind cards with their share bar, empty kinds with "+ Add", the three export cards. Dropped as sample: the two-shop dataset toggle. Kept from the live software because they are rules, not drawing: the tally sheet's permission (owner copy / staff copy / ask the owner, with the owner answering requests) and `basis` — a salesman sees selling prices and no cost |

| `/new/stock/summary?kind=` | file 11, screen 2 | breadcrumb heading (kind, worth, counts), search, the three orders, the "capital concentration" bar (the biggest three brands and the rest, as the file colours them) with its caption, brands that open into model cards with each model's part of the brand; a model opens its pieces in the stock list. Server: `stock_summary` gained `top3_share` and `others_share` (added keys) so the caption is the server's figure. Designed here (no drawing): accessories have no brands, so their kinds are shown in the same cards. Not built: the file's "✓ audited" mark per brand |

| `/new/sale/new` (the counter) | file 14, with file 15's brand pills, cheque and "paid now" | full screen with the file's own top bar (shop, POS F2, held bills, search, scan, the cost-and-profit switch, dark) and compact rail (F-keys, Accounts & Audit); stock cards with kind tabs and counts, quick filters, brand pills; the bill with walk-in / khata (search, "+ New", the khata box: before, this bill's udhaar, after), lines with the deal price in place, warranty per phone, quantity for an item, cost and margin for those who may see cost; payment Cash / Online-bank / Udhaar / Cheque / Split; discount and tax; net payable and estimated profit; Hold and Complete; the receipt; held bills. **Kept as rules, drawn here**: a confirm step with the ID-check skip (ADR-128), the owner-only reason for a flagged phone, below-cost consent, the owner's PIN; udhaar needs a khata customer; the price per customer tier for items; what came with the phone is recorded as given. **Differences from the drawing**: "Split" is the part paid now (cash or online) with the rest on the khata — the server keeps one way of payment per bill, so cash *and* online together is not offered; the trade-in row opens the live exchange (the incoming phone needs the purchase's checks); a walk-in's optional name goes into the bill's notes; Expense is F8 as in the rest of the app (file 14 prints F10); tax uses the shop's rate (the file says 1%); emoji on the file's receipt buttons are icons. **Not built (sample)**: "Simulate scan" — a real scanner works through the app's scanner listener. The files' shades: file 14's `limebrand-400/500/600` and `obsidian-700` are added; the obsidian shades it shares with file 11 differ by at most 4 RGB units and file 11's are kept |

| `/new/purchase/new` (add stock) | file 01 | full screen with the file's own sidebar and bar; where the stock comes from (dealer / customer's phone) with the person and their khata state, and for a customer's phone the anti-theft bar (ID checked / pending, the seller's CNIC); four tabs — **device** (kind, several pieces, IMEI 1 / 2 or serial with the scanner, brand and model pills from the catalogue with "add as a new model", storage and colour pills, RAM, Apple's region and SIM, PTA, SIM lock, condition, cost / asking with the margin, shelf, warranty, what came with it, faults with battery health and cycles), **locked phone**, **accessory lot**, **custom line**; the bill with its lines, dealer's bill no., discount, when bought, Cash / Online / Cheque / Udhaar with paid now and remaining; the review; stickers. It fills the live `DeviceLineDraft` and posts what the live purchase posts; the live checks stay (15-digit IMEI, already in stock refused, asking not under cost, patched needs details, locks checked for a used tablet / watch, the bill ticked once more). **Designed here**: the accessory name looks among the shop's items first (so a charger is not made twice) and a new item is made with no stock, the bill bringing its pieces (ADR-121); "several pieces" asks the other pieces' IMEIs (each piece its own row, ADR-110); "ID checked" records the skip with the user's name after saving (the live rule); a typed CNIC is written on the seller if they had none. **Differences**: the bill number is shown once saved (the file shows the next one); a locked phone picks its brand and model from the catalogue and its lock as iCloud / Google / other, and the file's free note for it is not stored; the warranty choices are the live months + who gives it; "Auto-gen test IMEI" is sample. Colours: each file's own obsidian shades now come from CSS variables set by `data-file` (11 default, 14, 01) |

| `/new/purchases` (purchases list + bill) | file 10 | full screen with the file's own rail (Purchases lit) and bar; three cards that filter — every bill with its phones, paid & settled, still to give (the one seller's name when one bill is open); the search (bill no., seller, source, model, IMEI) and the pills All / To pay / From dealer / Customer's phone / Trade-in; the bills as cards with the seller, source badge, "N phones", bill no., date and time, who entered it, total and "To pay" / "Paid", edit / delete, and every phone with its IMEI to copy; the chosen bill on the right with from whom, source, date and time, who added the stock, its phones ("View in stock"), the dark money box (total, paid at the purchase, paid later, returned, still to give), the payment drawer, and Edit bill / Change party / Return to seller / Delete. Every figure is the server's bill (`total`, `paid`, `returned_total`, `balance_due`); the list is the live `GET /purchases` and so only for the owner / manager. **Designed here**: "Pay the rest" is a payment out allocated to this bill (`POST /payments`); on a settled bill the drawer is the live "change what was paid at the purchase" with a reason (ADR-067); change party is ADR-056 with a reason; delete shows "first do this" (ADR-100), what will happen, and a reason, and the bill stays as Deleted, out of the cards' totals. **Differences**: the server has no purchase slip, so the printer prints the bill's phone stickers and the PDF is that day's purchases sheet; "Edit bill" opens the live edit form (the bill is replaced, ADR-090) and "Return to seller" the live return sheet; a bill made by an exchange is changed and deleted with its sale; the file's "Paid now · Cash" chip is not shown (a bill keeps no single way it was paid); the file's stock code under a phone's price is not shown. Colours: `data-file="10"` |

| `/new/khata`, `/new/parties/:id` (a person's khata) | file 06 | full screen with the file's own sidebar (People & khata lit); the bar with the breadcrumb, the profit eye (owner / manager), language and dark; "switch account" pills of the people with an open balance (lena / dena / clear); the person's card (initials, kinds, the balance pill, mobile to copy, note / address, Call, WhatsApp hisaab, Edit, "•••" with old balance, print the statement and delete); **Paisa aya / Paisa diya / Purana hisaab** and their drawer (against bills / without a bill / old balance, cash / online / mobile wallet, +5k / +10k / +50k / full balance, note, a return date for len-den); four cards (balance now, phones sold with profit, phones bought with returns, received / paid); the statement in three tabs — the account ledger with diya / aya / running balance, phones bought & sold with IMEI and bill, len-den & old balance with undo — with a filter, this month / last month / all, PDF and share. Every figure is the server's: the statement (`/ledger/parties/{id}/statement`), the journey (`/shop-audit/parties/{id}/journey`), len-den (`/payments/lending/{id}`), old balances (ADR-110). **Designed here**: `/new/khata` opens the person with the biggest open balance; money against bills is a payment the server puts on the oldest open bills, without a bill it is len-den (`purpose = lending`, docs/32), an old balance is the opening balance against capital (never stock or profit); undoing an old balance is the reversing entry and cancelling len-den the live void, both with a reason; the mobile wallet (JazzCash / Easypaisa / …) is sent as an online payment with that wallet; the mobile number is edited through `PhoneInput` (ADR-107) and WhatsApp opens with `waNumber`. **Differences**: a ledger row shows the entry's own note (the server's) and a link to its bill instead of a reference number; the date filter is this / last month / all; profit, the journey cards, the phones tab, old balance and delete are for the owner / manager only, as in the live software; "People & khata" in the breadcrumb opens the live directory (not drawn). Colours: `data-file="06"` |

| `/new/more/cash` (cash & bank) | file 03 | full screen with the file's own rail (Cash & bank lit) and bar (Export CSV, Print book, language, dark); four cards — all the money, cash in hand with "below zero" / OK, bank / online with the number of accounts, this month's cash flow without moves between accounts; the accounts and wallets as cards (kind, galla, opening, balance); "less than zero" with what it means and the opening balance ("Fill" = the amount that makes it zero); Move money / Edit account / Add account as inline cards; the chosen account's book with In / Out / Transfers, a search, the running balance, an "Open" link to the bill and the footer's in / out of the shown rows. Every balance is the server's (`/ledger/accounts`, its book, `/reports/cash-flow`); owner / manager only (the book shows cost), add / edit / delete an account and the opening balance owner only, as in the live software. **Designed here**: undo a move made by mistake from its row in the book (`/ledger/groups/{id}/reverse`, with a reason, kept crossed out). **Differences**: this software has no free cash entry (docs/38 §4), so "Manual cash in / out" records money out as an expense from the chosen account (its category — the owner taking money is "Owner drawing") and, for money in, opens the khata or the counter where the bill is; Export CSV writes the server's book rows; Print book is the device's print window; with one account Move money is shown disabled. Colours: `data-file="03"` |

| `/new/hisaab` (the day's hisaab) | file 04 | full screen with the file's rail (shared with file 03 as `newui/FileRail.tsx`, each file's lime passed in) and bar: today / yesterday / week / this month / from – to (owner / manager; a salesman sees today, ADR-072), the profit eye, WhatsApp day summary, print the A4 hisaab (the server's `/exports/day` PDF), language, dark; the lime banner (phones sold, net profit, total sales); the dark "left in hand" card with its formula, came in / went out by reason and a plain note (stock bought is now phones in the shop); six figures — cash received and given on udhaar filter the list; what was sold with All / Cash / Part udhaar / Full udhaar, a search (model, person, salesman, bill no., IMEI), each row's split badge and time, a bill's drawer (IMEI, cost, sale, profit, paid now, udhaar left, open the bill, the 80 mm receipt) and the footer's sums of the shown rows. **Server, additive**: `/reports/day` items gain `paid_now`, `owed`, `at`, `imei1`, `cost` / `profit` (VIEW_COST) and the report gains `margin` (net profit ÷ sales, one decimal; None without VIEW_COST) — the live hisaab reads none of them (`tests/test_reports_simple.py`, `tests/test_salesman_cash.py`). **Differences**: "Receive udhaar" in the drawer opens the khata, where money in is recorded (the drawer never writes a payment); a sale with no person is "Walk-in" (the live word); paid now / udhaar left are the whole bill's. Colours: `data-file="04"`, lime `#8CE01D` |

| `/new/expenses` (expenses & day closing) | file 05 | full screen with the shared file rail (the Expense F8 tile lit — `FileRail` now lights a counter tile too) and bar (Download CSV, Share WhatsApp, language, dark); four cards — cash in / out today and expected in the drawer (the galla's day preview), the shown expenses; the left panel's two tabs: **+ Quick expense** (the shop's categories as pills with the file's icons, paid from the galla or a bank / wallet account, the amount with +100 / +500 / +1,000 / +5,000, a note, Save; the same form edits an expense) and **Close the day** (the galla's waterfall, counted cash, Match expected, the difference short / extra, the closing slip, Lock & close day; a closed day shows what was counted and the difference); on the right the list with All / Today / Yesterday / This week / This month, a search, where the money went (bar + amounts), category chips, edit / delete per row and the shown total. Everything is the live expense API (owner / manager, the server's EXPENSES capability): `/expenses` (+ categories), edit = `PUT /expenses/{id}` (the old one cancelled, the corrected one posted), delete = the void with a reason, `/expenses/day-close/preview`, `POST /expenses/day-close`, the closes list. **Differences**: "Show sample shop entries" is sample and not built; the server has no printable Z-report yet, so "Print the slip" (after closing) is the device's print window; the spend legend shows amounts (the bar's widths are the shares). Colours: `data-file="05"` |

| `/new/overview` (business overview) | file 02 | full screen with the file's own 220px sidebar (Overview lit) and bar (today / yesterday / week / this month / from – to, 7 / 30 days for the graphs, the profit eye, dark, language, Open full hisaab); four cards (the period's sales with profit, to get, to give, stock on hand with for sale / ID / faulty); two in-house SVG graphs with a hover box (sales area + purchases dashed by day; profit bars — rose below zero — with the "to get" curve and the peak day); four tabs: the period's pulse (sales / purchases breakdowns, money in & out with the top three people each side, this month with repairs, returns and customers / dealers), udhaar & reminders (both lists with a filter, WhatsApp to the person's number, Settle), top sold / bought with the stock-alert strip, recent activity filtered by kind with the all-time totals; a full-hisaab window (four figures, open the day's hisaab, the server's overview PDF, WhatsApp). Every figure is the server's `/reports/overview` (owner / manager, REPORTS_ALL) and `/reports/trends` (ADR-096). **Differences**: "Settle" opens the person's khata (`/new/parties/:id`), where money is recorded — it never writes a payment; the drawing's "Net cash flow" is the period's expenses (the server gives no such figure, and the app does not subtract); the activity filters are the kinds of entries the server listed. Colours: `data-file="02"`, lime `#84CC16` |

| `/new/repairs` (repairs & lab hub) | file 09 | full screen with the file's own bar (the shop, "Repairs & lab hub (F7)", two tabs, cost visible, language, dark). **Take phone for repair**: three numbered cards — the customer from the khata (search with balances) or a quick walk-in (name + mobile through `PhoneInput`, made as a customer), the phone model and IMEI (the barcode scanner fills it); the server's fault codes and what came with it; who repairs it (the shop's technician from `/repairs/technicians`, or an outside lab from `/repairs/labs` — or a new one — with its agreed price, what it should do and back-by), the likely cost, the advance and ready-by — beside the 80 mm slip drawn live, and Save & print. **Active jobs & labs**: four cards, All / In shop / Outside lab / Ready filters and a search, a card per open job (faults, who has it, the lab's quoted charge for the owner / manager, WhatsApp to the customer's number, Back from lab, Mark ready, Deliver & settle) and the outside labs' khata (phones at each lab and the agreed price). Everything posts what the live repairs post: `POST /repairs` (+ `POST /repairs/{id}/lab`), the lab return (ADR-044, the charge booked then), the status, the delivery; the printed slip is the server's job sheet. **Differences**: the job number is the server's (the preview says "New job"); a walk-in is made as a customer (the server needs a person on a repair); the estimated profit and the slip's balance are the form's own preview; lab prices and profit only for the owner / manager; "Test print" opens the printer test page; Deliver opens the live delivery with the charges prefilled from the estimate when nothing was billed yet. Colours: `data-file="09"` |

| `/new/repairs/:id` (a repair job) | file 08 | full screen with the file's own bar (the shop, the F2 – F10 pills with Repair lit, the job / new intake tabs, language, dark); the open jobs to switch between; the job's card (number, device, faults, status, customer, staff, IMEI, what came with it, Call, WhatsApp status link, the lab strip with Back from lab, Delete for the owner / manager); the four-step progress (taken in / being fixed / ready / given back) — a tap moves it; the bill (work charge — editable, total, advance, paid now, what is left with Deliver & settle or, once given back, Collect → the khata); the history from the status log; on the right the 80 mm slip in English or Urdu with Print sticker, Print 80 mm slip, Download and Share status link. Everything is the live job and its live actions (`/repairs/{id}`, `/status`, `PATCH` labour, the lab return, the delivery, the cancel with a reason); the slip and sticker that print are the server's (`/repairs/{id}/job-sheet?lang=`, `/labels/repairs`); the link is the live public page `/r/{token}`. The board's job numbers (file 09) now open this page. **Differences**: a deleted repair stays Deleted (no "Restore job" in this software); once given back, what is left is collected on the khata; parts are edited on the full repair page. Colours: `data-file="08"` |

| `/new/loans` (loans / amanat) | file 12 | full screen with the file's own sidebar (daily counter, stock & amanat with Loans lit and the count out, shop & audit, who is logged in) and bar (Approval & market consignment, cost visible for the owner / manager, language, dark, **+ Give phone on amanat**). Four cards: out now (count, cost total with `VIEW_COST`), returned, sold to them ("bills in Sales" — the drawing's sold total is on the bills), the earliest due date or the longest out. Out / Returned / Sold tabs with counts and a search; a card per phone (model, IMEI copy, storage / colour, days out — amber from 5 days or overdue, the holder, given / due, cost). The chosen phone: state, View in stock, cost / asking / target profit (owner / manager), the holder with their khata, note, Call and WhatsApp reminder; **Device came back** (`POST /loans/{id}/return`), **They kept it — make it a sale** (final price, Cash / Online / Khata → `POST /loans/{id}/sell`, online into the first bank / wallet account), Cancel this loan with a reason (`/cancel`, owner / manager); a sold loan opens its bill; the phone's own events as the timeline; the amanat slip as an on-screen proof (the server prints none). The give drawer: an in-stock phone (search), the person (anyone of the shop, ADR-106), back in 3 / 7 / 15 / 30 days or no date, a note → `POST /loans`. Strings `nloan`; `data-file="12"` shades; behind the `loans` module. | exists: give, return, sell, cancel, the list; new: the four cards, the WhatsApp reminder, the slip proof; not built: a printed amanat slip, the drawing's sold total |

| `/new/more/settings` (shop settings) | file 07 | full screen with the shared rail (Shop settings lit) and the file's bar (Back, a search over every setting, dark, language, **Save all changes** with the count of what changed). Five tabs: **shop & branding** (name, city, phone and WhatsApp through `PhoneInput`, print language, hours; legal name, address, taglines, business type, province, registration, since, e-mail, website, Facebook / Instagram / TikTok, logo upload / remove; owner name and CNIC), **receipts & currency** (the five signs, before / after, paisa; the eight printed-bill ticks; invoice prefix, footers, terms, bank / title / account / IBAN / wallet), **printers & barcode** (the three printers on this device with connection, sticker size, test print and "did it print?" — the live card's own storage; barcode type, value, prefix, start, test scan, test label; the code word with its tester, or the shop's own pattern whose examples are the server's), **tax & FBR** (charge tax, rate, inclusive, phones taxed at import, NTN / STRN / POS ID; FBR on, sandbox / production, the write-only token, test, sale type and HS code per kind, sent / waiting / turned down with send now, the FBR guide), **security & audit rules** (fingerprint login, the two price rules, the eight audit thresholds with the order check, valuation, units, past zero, lock check, grades, CP ID mark). On the right the 80 mm bill (in the shop's print language) and the price sticker as the form now stands, with a sample phone. One save sends only the changed fields: `PATCH /shops/current`, `PATCH /barcodes/settings`, `PUT /fbr/settings`. Owner only (MANAGE_SETTINGS). Strings `nset`; `data-file="07"` shades. | exists: every field and save of the live settings page; new: one save for all, the search, the bill and sticker previews; not built: the drawing's sample decoration |

| `/new` (home) | file 11, third screen | inside the new frame: the greeting with the user's first name, Today / Yesterday / Week / This month (owner / manager; a salesman sees today), Business overview and Shop audit tiles, "at a glance" as the file's eight cards (sales with phones sold, profit with the previous period, in hand with money in / out, cash & bank with "below zero" — today's cash for a salesman, to get with received in period, to give, phones in stock with worth, returns this month and expenses), needs attention from the dashboard's counts (ID checks, open repairs, qist late / today, len-den late / we owe, low items, new staff phones, tally asks), Hazri check in / out, the last 7 days as bars (tap a day → its hisaab) with the best day and where the money sits as amounts. Every figure is the live home's (`/reports/day`, `/reports/dashboard`, `/shop-audit/overview`, `/attendance/today`). Strings `nhome`. | exists: every figure and link of the live home; new: the file's card layout; not built: the 7-day total and the money split as percentages (the app never works out a total or a share), "Live counter sync" |

### A feature the files do not draw (owner, 2026-11-23)

Asked what the new product does with everything the software has that no mock-up draws — instalments
(qist), remittance, FBR, exchange, branch transfers, old dealings, bulk import, the shop audit, the
control room. The owner: **"build those files for this software yourself; take some ideas from the old
software too, but the design structure stays the mock-up's."**

So: the screen is designed here, from what the live software already does, and drawn in the files' own
visual language — the same frame, the same cards, type, spacing, lime and obsidian, the same dark
theme. It is not a copy of the live screen with new colours, and it is not invented from nothing: the
live screen says what the shop needs, the files say how it looks. Each such screen is listed in its
pull request as designed-here, so the owner can send a drawing for it later if he wants one.

Designed here so far:

| Address | Drawn like | What it carries |
|---|---|---|
| `/new/installments`, `/new/installments/:id` (qist) | file 12 (amanat): the shared rail, the bar, four cards, tabs + search + a card per item on the left, the chosen one on the right | the four live views (due today, late, running, finished) as cards and tabs with counts of plans, search (name, phone, bill, guarantor), a card per plan with the paid / late / due strip, the next amount or days late, what is left; the plan: total / paid / left, the plan line and its strip, last reminded, **Take installment** (amount = the next one; cash, online with the bank, cheque, from abroad — the live payment details), **Remind on WhatsApp** (sent, or the link to send by hand), the schedule, the customer and the guarantor with Call / WhatsApp, Open the bill, **Cancel this plan** with a reason (owner / manager). A plan is made with a sale, so "+ New qist sale" opens the counter. Every figure is the server's; the cards count plans, never add money. Strings `nq`. |
| `/new/remittance` (money from abroad) | files 03 / 12: the shared rail, the bar with the periods, a row of figure cards, chips, a list with filters | the Remittance money account (money on its way — not in the drawer or the bank) with **Move to bank** (the live transfer to a bank / wallet / the drawer), received / fees / net / paid abroad (the international report's totals), the currencies as chips (by currency, the server's), all / received / paid, search (name, sender, bill, MTCN, country), a row per remittance (sender → person, country · service, amount × rate, the bill / payment number, status, rupees, fee and net) that opens its bill or khata, **Money received from abroad** on a person's khata (the live payment with currency, amount sent, rate — the rupees are amount × rate unless typed —, sender, service, MTCN, fee, received / on its way). Owner / manager, as the report. Server (additive): a stand-alone khata payment's remittance details now show in the international report (it showed rupees only), `test_standalone_remittance_keeps_its_detail`. Strings `nrem`. |
| `/new/exchange`, `/new/exchange/new` (exchange, phone for phone) | files 14 / 01: the shared rail, the bar with New / Recent, numbered panels side by side | **1** the customer (search with the khata balance, or a new one through `PhoneInput`), **2** the old phone coming in as the live purchase line (IMEI — refused when already in stock —, brand pills or any brand, model search, storage, colour, condition, PTA, battery, its trade-in value = its cost, the price to sell it again, lock checked), **3** the new phone from stock (search; ID pending / flagged shown) at its price, **4** the settlement in words (customer pays / shop pays / even), paid now or paid back with cash / online / cheque, the khata after, the old phone's ID check (later or skip) and the new one's (check now / skip; flagged → owner and a reason) → **Complete exchange** (`POST /exchanges`, one save) → done with the numbers, thermal / A4 receipt and the bill. **Recent**: the live exchanges with the khata after each, the bill, and delete with a reason (owner / manager; both halves together). The counter's trade-in now opens this. Strings `nex`. |

### The new product as built (ADR-134)

| | |
|---|---|
| Address | `/new` — its own route tree inside the login. The live software keeps every address it has. |
| Frame | `src/newui/Shell.tsx`, class for class from `11-frame-stock-summary-and-dashboard.html`: the 252px panel (mark, shop name, status dot, Dashboard pill, **Daily Counter** 2-up tiles with F2…F10 — Sell lime `#B4F000`, Add stock obsidian — **Accounts & Audit** 3-up tiles, "Quick IMEI Focus" with the `/` key) and the sticky bar (IMEI search with Scan, language, light / dark, messages, the user's initials). |
| Icons | `src/newui/icons.tsx` — the mock-ups' own SVG paths, copied, not the nearest library icon. |
| Look | `tailwind.config.js` gained the files' own `limebrand` and `obsidian` scales, and `darkMode` now follows the app's `data-theme` (the live software uses no `dark:` class at all, so nothing of it changes). |
| Kept correct, not drawn | `left`/`right` are written `start`/`end` so Urdu puts the panel on the right; in English the pixels are the mock-up's. The panel slides in behind a menu button on a phone, as the file does. |
| Not drawn yet | every screen. `/new/<anything>` shows "Not in the new design yet" with a button to the same address in the live software, so nothing is a dead end. |
| Undone | the redesign changes that had been made inside the live pages (`SaleWizard`, `PurchaseWizard`, `DeviceLineSheet`, `StockSummaryPage`, `Shell`, `SidePanel`, `AppearancePage`, `theme.ts`) — all back to `main`. The "New design" fifth look is gone; the new product is an address, not a look. |
| Carried over | the parts worth keeping are now the new product's own: `newui/kit.tsx`, `newui/SaleStockCard.tsx`, `newui/pages/StockSummary.tsx` (the first pass, to be rebuilt pixel for pixel). The server's added figures, the shared font links and `forgetAllDrafts` on logout stay — they are not a design. |

## 6. Decided by the owner

Nothing is open. Decided 2026-11-23 (second answer):

- **`staging` is tested on a second address of the server with its own empty database** — never the
  shops' database: `https://staging-mobileshop.oopsolutions.com` (DNS set 2026-11-23). Built:
  `deploy/staging/` (compose project `mobileshop-staging` in `/opt/mobileshop-staging`, its own database
  and upload volumes, its own Traefik routers, `noindex`; WhatsApp, e-mail, the assistant and the
  scheduler off) and `.github/workflows/staging.yml` (every push to `staging`: CI, images tagged with
  the commit and `staging` — never `latest` — then that stack's `deploy.sh`). The shops' stack, its
  database and `deploy.yml` are not touched. Owner's one-time server command: `docs/29-OWNER-PENDING.md`.
- **The pages reach the shops together**: the foundation and the fifteen screens collect on `staging`
  and go to `main` in one release (or two or three groups the owner names), not page by page.
- ~~Counter becomes the default design with the release~~ — replaced 2026-11-23 (ADR-133): **both versions are given to the shopkeepers**; the old screens stay the default and exactly as they are, the mock-ups' version is the "New design" under Appearance; their feedback decides what happens next. The new version is built according to the mock-ups (so add stock becomes one screen with pills there).

Decided (owner, 2026-11-23):

- **Colours stay the shop's choice.** Everything under More → Appearance stays as it is (colour sets,
  light / dark, accent, text size, corners, font, layout); a shop keeps the set it chose and may tell us
  which it wants. The redesign changes the layout and the parts; the mock-ups' lime and obsidian are
  offered as a colour set, they do not replace anyone's.
- **The sale screen**: mock-ups 14 and 15 were added to the folder (§4).
