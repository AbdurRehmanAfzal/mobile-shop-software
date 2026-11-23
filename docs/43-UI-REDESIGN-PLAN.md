# 43 — UI redesign from the owner's new screens (plan)

Owner, 2026-11-22: "the UI is to be as in the new files — it is easy to use. Redesign every page on its
own branch; read each page's structure and build what is new in it; keep everything that exists; do not
disturb the shops that run the software. A `staging` branch from `main`: every branch is merged into
`staging` first, tested there, and only then `staging` goes to `main`." Decision: ADR-132.

Status: **`ui/00-foundation`, `ui/01-stock-summary` and `ui/02-sale` are on `staging` and the staging site. `ui/03-add-stock` is in work on its branch: part A (two panes on a laptop) is committed; how the device's details are asked (pills inside the step-by-step sheet, or one screen) waits for the owner.**

## 1. The source

Fifteen stand-alone HTML mock-ups (thirteen on 2026-11-22, the two sale screens on 2026-11-23) in `C:\Users\HP\Documents\projects\mobile shop\new mobile shop ui\`
(outside the repository — they carry a live shop's people and mobile numbers as sample data, so they are
**not** committed; ask the owner for the folder if it is missing). Each is one file: Tailwind from a CDN,
Lucide icons, its own sample data and its own click handlers. They are pictures of a screen that can be
clicked, not code to copy: no API calls, English only, laptop width first.

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
| 11 | `…upgraded_pos_stock_ui (4)` — Smart POS & Inventory (3 screens) | `Shell`, `SidePanel`; `/stock/summary`; `/` | the new frame; stock summary: dark hero with avg. unit cost / top category / stock health, active kinds as big cards with share bar, empty kinds as small "+ Add" cards, the three sheets as cards; brand drill-down with sort (value / units / avg.) and share of capital; Home with period tabs | avg. unit cost, top category, share of capital per brand, sort of brands; "+ Add" on an empty kind | "Counter #1 Online"; the switch between two shops' sample data; attendance "check in" |
| 13 | `luxury_stock_cards_preview` | the kind cards of `/stock/summary` | the cards' finish in dark ("glass") and light | — (style reference) | "Copy CSS" |
| 14 | `…complete_multi_category_pos_f2` — Complete POS Sell Screen (the later and fuller of the two; dark shown first) | `/sale/new` (`SaleWizard`), with `ExchangeWizard`'s trade-in | one screen instead of steps: the stock as cards on the left (kind tabs All / Mobiles / Tablets / Smartwatches / Laptops / Accessories with counts, quick filters box pack / PTA / ID pending / hide faulty, search with "/" and the scanner), the bill on the right (walk-in or khata customer, lines with the deal price typed in place, pieces for an item, warranty per line, trade-in added in the bill, discount and tax ticks, cash / online / udhaar / split, net payable, hold, complete and receipt) | **held bills** (park a bill and take it up again); warranty chosen per line; split payment on the same screen; the estimated profit of the bill (only with `VIEW_COST`); a card marks "ID pending" and "faulty" before it is tapped (ADR-128: with "Check now" and the skip) | "Simulate scan" and its beep; a walk-in's free-typed name where the app asks for a person |
| 15 | `…upgraded_pos_sell_screen_f2` — New Sale POS (the earlier draft, light) | the same | as 14, with a row of brand pills, "amount paid now" with "full paid", cheque as a way to pay, "+ Add charger / cover" on the bill | brand pills; cheque (with 01) | — |
| 01 | `…add_stock_new_purchase_f3` | `/purchase/new` (`PurchaseWizard`, `DeviceLineSheet`, `ItemForm`), `/stock/opening` | one screen instead of steps: source and dealer with the khata's state, the device builder with pills (kind, brand, model, storage, colour, PTA, condition, what came with it), the bill "cart" and payment on the right, stickers after saving | region / SIM variant (LL/A, ZA/A; physical + eSIM); "locked phone" as its own tab (iCloud / FRP / MDM); shelf / rack; "Later" for an accessory owed with the phone; cheque as a way to pay; live margin | "Auto-gen test IMEI" |
| 10 | `…upgraded_pos_stock_ui (3)` — Purchases & Bill Inspector | `/purchases`, `/purchases/:id` | figure cards (total, paid, still to pay), bills as cards showing their phones and IMEIs, the chosen bill beside the list with pay / edit / change party / delete | search by model or IMEI across bills; quick filters by source | — |
| 06 | `…person_khata_account_ledger` | `/parties/:id` (`PartyDetailPage`, `PartyLending`, `OldBalance`), `/khata` | header with Call / WhatsApp hisaab / Edit; two big buttons "money came" / "money given"; four figure cards; tabs ledger / phones bought & sold / len-den & old balance; the entry as a drawer with preset amounts | switch between people in a strip; profit from this person (cost only) | "Delete person" as shown (the app's delete-check decides) |
| 03 | `…cash_bank_treasury_hub` | `/more/cash` (`CashAccountsPage`) | figure cards (all money, cash, bank, in / out), accounts on the left, the chosen account's book on the right with running balance, filters, search | Easypaisa / JazzCash as kinds of account; export / print of one account's book; search in the book | — |
| 04 | `…day_s_hisaab…` | `/hisaab` (`DayReportPage`) | period tabs, a hero (sold, total, profit), "left in hand" with came in / went out, six figure cards, "what was sold" with tabs (cash / part udhaar / full udhaar) and search, a sale opens beside it | filter of the sold list by how it was paid; receive the udhaar of a sale from here | — |
| 05 | `…expenses_day_closing_hub_f8` | `/expenses` | quick expense: category tiles, paid from, amount with presets, note; the list with a share-by-category bar and filters | **closing the day**: counted cash against the expected drawer, the difference, an 80 mm closing slip — to check against what the day's hisaab already has | "Show sample entries" |
| 02 | `…business_overview_overview` | `/overview` (`OverviewPage`) | four figure cards, two charts (sales / purchases; profit by day with to-get / to-give), four tabs: today's pulse, udhaar and reminders, top models and stock alerts, recent activity and totals | activity feed with filters (owner only — the security feed's rule); "Settle" from the list | "LIVE" badge |
| 09 | `…upgraded_pos_stock_ui (2)` — Repairs & Lab Hub | `/repairs`, `/repairs/new`, `/repairs/labs` | intake on one screen in three numbered blocks (customer and device, problem and what came with it, who repairs and the estimate) with the slip beside it; jobs board with figure cards and filters | "ready by" presets; estimated profit while typing | "Test print" as a printer call (ADR-119: the device's print window only) |
| 08 | `…upgraded_pos_stock_ui (1)` — Repair Job Detail | `/repairs/:id` | job header with Call / WhatsApp status link, the four steps as a stepper that is tapped, bill and settlement with "collect remaining", the history, the slip beside it | restore a cancelled job (to check) | "Double-entry verified" label |
| 12 | `…upgraded_pos_stock_ui` — Loans (Amanat) Hub | `/loans` | figure cards (out now, returned, sold, longest out), tabs out / returned / sold, the chosen phone beside the list with the holder, "came back" / "they kept it — make it a sale", history, the slip | a due date with an overdue mark (to check); WhatsApp reminder to the holder | — |
| 07 | `…shop_settings_control_center…` | `/more/settings` (+ `BusinessProfile`, `PrintersCard`, `PriceCodeCard`, `FbrCard`, security) | five tabs (shop and branding, receipts and currency, printers and barcode, tax and FBR, security and audit rules), a search box over all settings, the 80 mm bill and the sticker previewed live beside the form | search across settings; live preview while typing | "Upload logo" as simulated; the price code shown on a sticker to anyone (ADR-117: only with `VIEW_COST`); a single "Save all changes" if a card saves by itself today |

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
| Open (owner) | the device's details: the mock-up asks them on one screen with pills; the app asks them step by step in a sheet (`DeviceLineSheet`, 611 lines, 17 test files go through it). Recommended: keep the steps and turn the sheet's dropdowns into pills |
| To check when that is decided | shelf / rack (the device has `location`), cheque as a way to pay (the sale's `PayPicker` has it), "Later" for what came with the phone |
| Not built | "Auto-gen test IMEI" |

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
- **Counter becomes the default design when that release goes to `main`**, not before; until then it is
  chosen under Appearance. A shop that already chose a design keeps it.

Decided (owner, 2026-11-23):

- **Colours stay the shop's choice.** Everything under More → Appearance stays as it is (colour sets,
  light / dark, accent, text size, corners, font, layout); a shop keeps the set it chose and may tell us
  which it wants. The redesign changes the layout and the parts; the mock-ups' lime and obsidian are
  offered as a colour set, they do not replace anyone's.
- **The sale screen**: mock-ups 14 and 15 were added to the folder (§4).
