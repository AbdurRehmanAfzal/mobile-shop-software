# Mobile Shop SaaS — Claude Code Project Context

Bilingual (English + Urdu RTL) mobile-shop management SaaS for Pakistani mobile shops,
with first-class support for **used-mobile** buying/selling, device verification, chain-of-custody
history, repairs, accessories, credit ledgers, FBR tax, reports, staff and multi-tenancy.
Owner / product decision-maker: **Abdur Rehman Afzal**.

## Start-of-session protocol (ALWAYS do this first)
1. Read `docs/06-PROGRESS.md` (what is done / in progress / next).
2. Read the last entry of `docs/09-SESSION-LOG.md` (where the previous session stopped, open questions).
3. Only then read the code you need. Do not re-audit the whole repo each session.
4. If the task touches business rules, read the relevant section of `docs/02-FUNCTIONAL-REQUIREMENTS.md`.
5. The `/kickoff` project skill does steps 1-2 for you (not `/resume`, which is a built-in Claude Code command).

## Owner's pending list
- `docs/29-OWNER-PENDING.md`: server env variables, server commands, manual testing and decisions still open on the owner's side (none done as of 2026-11-01). Keep it current: add every new env key, server command or manual-test step there.

## End-of-session protocol (ALWAYS do this before finishing)
1. Update `docs/06-PROGRESS.md` (tick items, move items between columns).
2. Append an entry to `docs/09-SESSION-LOG.md`: date, what was done, what was verified (tests run), what is next, open questions.
3. If a design decision was made, append an ADR to `docs/10-DECISIONS.md`.
4. Commit (see rules below). The `/handoff` project skill walks through this.

## Shop Audit programme (owner brief 2026-10-30; phases 1–10 delivered 2026-10-31, ADR-032)
- Requirements: `docs/16-SHOP-AUDIT-SPEC.md` (authoritative, verbatim owner brief).
- Living plan, gap analysis, phase checklist and the **exact next task**: `docs/17-SHOP-AUDIT-PLAN.md` — read it before touching `backend/app/modules/shopaudit` or `frontend/src/features/audit`.
- Status rows live in `docs/06-PROGRESS.md` (section "Phase 5 — Shop Audit"); per-session results in `docs/09-SESSION-LOG.md`.
- Sales & purchases by brand & model (ADR-143, `features/audit/TradeUnits.tsx`, `shopaudit/units.py`): the second view of `/audit/sales` (`?view=models`) shows only the server's model totals, picks and each phone's trail; the purchases side and every cost / profit need VIEW_COST; model totals must keep equalling the products audit's.
- Rules for this work: read-only derivation from the ledger / documents / device events, additive migrations only, every figure traceable and drill-down-able, limitations shown (no due dates, no purchase tax, no remittance fees), owner-only security feed, no chart dependency (in-house SVG).

## Bulk Excel import / export (owner 2026-10-31, ADR-034)
- Plan, module verdicts, column specs and status: `docs/18-BULK-EXCEL-PLAN.md` — read it before touching `backend/app/modules/bulk` or `frontend/src/features/more/BulkPage.tsx`.
- Rules: the import only calls the existing services (never writes rows itself), preview before anything is written, all-or-nothing unless "skip rows with errors", samples recognised and skipped, owner + manager only.

## Subscription reminders (owner addendum 3, 2026-10-31, ADR-035)
- Spec `docs/19-SUBSCRIPTION-REMINDERS-SPEC.md`; gap analysis, schedule, assumptions and the owner's placeholders `docs/20-SUBSCRIPTION-REMINDERS-PLAN.md`; the owner's setup checklist `docs/21-OWNER-SETUP-CHECKLIST.md` — read it before touching `backend/app/modules/plan`, `admin/plans.py`, `admin/fees.py` or `frontend/src/components/PlanReminders.tsx`.
- Rules: the server decides the stage and whether the popup shows (server time + clock guard, snooze stored per user); the client only decides where (never on a form page); the popup is the one screen that shows en + ur + roman together; soft-lock never blocks paying, exporting or the backup; nothing is ever deleted.

## Package chooser on the fees page (owner 2026-11-17, ADR-095)
- Read ADR-095 before touching `backend/app/modules/plan/order.py`, `public/pricing.py`, `fees.approve` or `frontend/src/features/more/PackagePicker.tsx`.
- Rules: the total is always the server's quote (never the app's); a shop's own package costs its own agreed fee, other packages the list price; the order is a snapshot on the payment and reaches the shop only when the provider approves; a smaller package hides modules, it never deletes data.

## Returns report (owner 2026-11-17, ADR-097)
- Read ADR-097 before touching `backend/app/modules/returns/report.py`, `ReturnsReport.tsx` or the return form's reason chips.
- Rules: the report is read-only and derived (return documents, bill lines, phones, events) — only `reason_code` is stored; customers' returns and returns to suppliers stay apart; cost and the effect on profit only with `VIEW_COST`; a return undone later is never counted.

## Special price, sale, payment with package (owner 2026-11-17, ADR-098)
- Read ADR-098 before touching `organisations.fee_deal`, `order.deal_for` / `sale_pct` / `set_deal`, or `AdminDealCard.tsx`.
- Rules: the special price covers only the months it has left and is used up only by an approved payment; the shop always sees the list price beside its own; a sale never touches an agreed fee or a special price and is never stored as a shop's monthly fee; the provider's own payment goes through the same quote and `order.apply`.

## Deleting an entry (owner 2026-11-17, ADR-090 / ADR-099 / ADR-100)
- Read ADR-099 and ADR-100 before touching a `void_*` / `cancel_*` function, `devices.state.moved_since`, `delcheck/` or `DeleteBlockers.tsx`.
- Rules: a delete undoes only that entry's own effect and keeps it as Deleted; later separate entries are never cascaded — the delete is refused and `delete-check` says what to undo first; the check is read-only and must agree with the delete's own rule (change both together).

## Skipping the ID card check (shopkeepers 2026-11-21, ADR-128)
- Read ADR-128 before touching `verification.service.override / skip_check / skip_pending`, the sale's `override_reason`, `PendingChecksPage.tsx` or the check boxes of `ExchangeWizard.tsx`.
- Rules: a screen that sells a device shows a pending check before the tap, with "Check now" and the skip, and sends `override_reason` — never let the server's refusal be the first the user hears of it; a skip is a bypass in the phone's history and the audit, never a completed check; a flagged phone is never skipped in bulk and needs the owner / manager with a reason; inside another transaction use `skip_check` (no commit), never `override`.

## Returns: accounting and correction (owner 2026-11-17, ADR-101)
- Read ADR-101 before touching `returns/service.py`, `ReturnWizard.tsx` or the return accounting.
- Rules: a returned phone re-enters stock at the cost on its bill line, never at what was handed back; a return reverses the sale's margin and the cut is income (the margin comes back only when the phone is sold again); a damaged return goes to Faulty; correcting a return is undo + re-entry in one transaction (`replace_return`), never an in-place edit of money; `tests/test_returns_audit.py` pins the books — keep it passing. The impact preview (ADR-102, `returns/preview.py`) runs the real posting with `commit=False` and rolls it back — never compute a preview figure in the app or in a second code path.

## Accounts & Reports (owner 2026-11-18, ADR-104)
- Audit and phases: `docs/38-ACCOUNTS-REPORTS-AUDIT.md` — read it before adding any accounts or report feature; build only what its matrix marks missing.
- Rules: one accounting engine (the ledger) — never a second set of balances; a report reads the ledger / documents and is checked in a test against them; no free manual journal entry (docs/38 §4); the general ledger's closing balance must equal the trial balance's line.

## The provider's control room and the landing page's addresses (owner 2026-11-20, ADR-115)
- Read ADR-115 before touching `ControlShell.tsx`, the `/control` routes, `landing/topics.ts`, `frontend/seo-pages.ts`, `index.html`'s head or the `try_files` line of `deploy/Caddyfile`.
- Rules: the provider's screens live under `/control` in their own frame, never inside the shop `Shell` (`/admin` only redirects); the server still decides who the provider is on every request. A kind-of-shop landing address is one entry in `topics.ts` with `landing.topic.<key>.*` in three languages, a line in `sitemap.xml` and `robots.txt` (`seo.test.ts`); its HTML head is written by the build from the app's own strings — never hand-copy a head. When a feature ships that a shopkeeper would search for, add it to the landing page (`NEW`, FAQ), `index.html` (`featureList`, `FAQPage`) and `llms.txt` together.

## A phone's page and its printed details (shopkeepers 2026-11-20, ADR-114)
- Read ADR-114 before touching `DeviceEasyView.tsx`, `DeviceLayouts.tsx`, `DeviceSheetPreview.tsx` or `devices/sheet.py`.
- Expenses, the unit's ledger and QC (ADR-140, `DeviceLedger.tsx`, `devices/expenses.py`, `units/ledger.py`): money spent on a unit is posted by the server (Dr stock, Cr cash; raises `cost_price`; `cost_added` event) and deleted only with a reason while the unit is the shop's; the ledger and its A4 sheet are the server's and for owner / manager only; QC marks faults through the live faulty events; a purchase return writes off the unit's added cost.
- Rules: the page has three views (Details, 80 mm slip, A4 page) — do not add layout styles; a new fact about a phone is a line of the details table with its action and a "?" (always shown, "—" when empty); the printed details are the server's page (`sheet_html`), read-only, cost lines only with `VIEW_COST`, and the app only previews that page.

## The stock summary by kind (owner 2026-11-22, ADR-131)
- Read ADR-131 before touching `StockSummaryPage.tsx` or `reports.stock_summary`.
- Rules: Stock opens a card per kind the shop trades, a card opens that kind's brands → models → the stock list (`?kind=`); every figure is `reports.stock_summary`'s (`kinds`, `items`, `category`) — the app adds up only the cards for the heading; the keys without `category` must keep saying what they said (the download and the assistant read them); a new kind of stock gets a card here.

## Cash & bank (owner 2026-11-26, ADR-142)
- Read ADR-142 before touching `features/more/CashAccountsPage.tsx` or the `cashx.*` texts.
- Rules: balances and book rows are the server's (`/ledger/accounts`, `/ledger/accounts/{id}/book`, `/reports/cash-flow`); there is no free cash entry — money out by hand is an expense paid from the account, money in is recorded where its bill or person is (docs/38 §4); the book, cash flow and CSV only for owner / manager; a move between accounts stays `/ledger/transfers` with undo by reversal.

## Stock: tabs, stock by dealer, the stock ledger (owner 2026-11-26, ADR-141)
- Read ADR-141 before touching `features/stock/StockHub.tsx` or `backend/app/modules/stockhub`.
- Rules: `StockTabs` sits on every stock screen — a new stock screen gets a tab; `/stock/people` and `/stock/ledger` show only the server's figures (`/stock-hub/parties`, `/ledger`, `/overview`) and a filter asks the server; cost, profit, billed and balances only for owner / manager; the summary's own figures stay `reports.stock_summary`'s (ADR-131), the stock hub's two are shown apart; `stockhub/` is shared with the new product on `staging`.

## The new UI product — PAUSED (owner 2026-11-26)
- The new product (`/new`, built from the owner's mock-ups, ADR-132 / ADR-134) exists only on the `staging` branch and waits; the live software here on `develop` gains its functionality on the old screens first (the old look stays).
- Where it stands, the server pieces that exist only on `staging`, how to take one into `develop` and how to restart: `docs/43-UI-REDESIGN-PLAN.md` §0 **on the `staging` branch** (`git show origin/staging:docs/43-UI-REDESIGN-PLAN.md`).
- Rules: never merge `staging` into `develop` / `main` (it would ship `/new` to the shops); take only the server piece a feature needs (`git checkout origin/staging -- <files>` with its test); release `develop` → `main`, then merge `main` into `staging`.

## A person's page: the full khata (owner 2026-11-26, ADR-136)
- Read ADR-136 before touching `PartyDetailPage.tsx`, `PartyKhataFull.tsx`, `units/khata.py` or the `pkh.*` texts.
- Layout (ADR-138, a shopkeeper's complaint): balance → one profile card (bio + dates) → one actions block → five tabs (Summary, Ledger, Phones, Len-den & old balance, Payments; `?tab=`). A new card goes into the tab it belongs to and a new action into the actions block — never one more block down the page.
- Rules: one page for every kind of person (dealer, customer, other shop, repair lab); every figure is the server's (`GET /parties/{id}/khata`, the statement, `khata-report`) — the app only searches and filters; Fix / Edit on a line opens the live correction for that kind and never edits a line in place; cost, paid-out and profit only for owner / manager; `units/khata.py` is shared with the new product on `staging` — change it in one place and carry it over.

## The invoices page: the bills centre (owner 2026-11-26, ADR-137)
- Read ADR-137 before touching `InvoicesPage.tsx`, `InvoiceHub.tsx` or `backend/app/modules/billshub`.
- Rules: every figure is the server's (`GET /bills-hub/bills`) and a filter asks the server — the page adds up nothing; a tap on a bill opens its own page, View is the quick look; correct / delete only hand over to the live screens (never an edit in place, never a delete from a list); settle is the live `PaymentForm` against that bill; cost, purchases, to-pay and profit only for owner / manager; `billshub/` is shared with the new product on `staging` — change it in one place and carry it over.

## Sale & purchase page (owner 2026-11-26, ADR-139)
- Read ADR-139 before touching `features/trade/SalePurchasePage.tsx` or the `stp.*` texts.
- Rules: every figure is the server's (`GET /bills-hub/sales`, `/bills-hub/purchases`) and a filter asks the server; the purchases side and every cost / profit figure only for owner / manager; settle / correct / delete / report are the invoices page's sheets (`InvoiceHub.tsx`) — never a second copy, never an edit in place.

## Report pages: one look, the reader's choices, whole rows (shopkeepers 2026-11-26, ADR-144)
- Read ADR-144 before touching `exports/frame.py`, `exports/options.py`, `exports.router._printable`, `exports/a4.py`, `DownloadButton.tsx` or `lib/share.printPagePdf`.
- Totals and the clock (ADR-145): a report's totals are the server's sum of its own columns (`a4.totals`) on the printed page only — Excel / CSV stay plain data; never total a rate, an age or a running balance. The side panel's quick rows keep the owner's order (`FIRST` in `SidePanel.tsx`) and must fit 1280×720 in all four designs (`appearance.spec.ts`). `LiveClock` is the device's clock, never a bill's time.
- Rules: a new report is made with `_file` or `a4.page` (it then has the look, `rcols` / `rhide` / `rnocost`, PDF / Excel / CSV) and offered with `DownloadButton`; a page with its own style ends its `<style>` with `frame.PRINT_SAFE`; the choices only remove columns the login was given — the report's own VIEW_COST rule stays; the server leaves columns out, the app never edits a report.

## Reports list (owner 2026-11-19, ADR-111)
- Read ADR-111 before touching `frontend/src/features/reports/catalog.ts`, `ReportsHub.tsx` or `ReportsHome.tsx`.
- Rules: `/reports` lists every report (it is not behind the `reports` module; the profit tabs live at `/reports?tab=…` and gate themselves); the list never computes or copies a report — an entry points at the screen where the report lives; **a new report or sheet gets an entry in `catalog.ts`** with its `hub.r.<id>.t / .d` strings in three languages and its module / role rule (`catalog.test.ts`).

## Old dealings and several pieces at once (dealers 2026-11-19, ADR-110)
- Plan: `docs/41-OLD-DEALINGS-AND-BULK-ENTRY-PLAN.md` — read it (and ADR-116 for the step-by-step form) before touching `ledger.post_party_opening_balance` / `old_dealing`, `OldBalance.tsx`, `OldDealingWizard.tsx`, `expandDraft` in `DeviceLineSheet.tsx` or the sale's "pick several" / "one price for all".
- Rules: a dealing from before the software is only a balance on the khata (`opening_balance` against the owner's capital) — never a device, stock, sale or profit, so no IMEI is asked; its total is the server's sum; it is undone by a reversing entry with a reason. The form asks one question at a time and picks brand / model like a purchase, but sends only a name, pieces and a rate — it never makes a device or a catalogue entry. "Several pieces" is an entry aid in the app only: every piece is still its own `devices` row and its own bill line.

## Built-in accessories list and variants (accessories shops 2026-11-20, ADR-118)
- Read ADR-118 before touching `accessories.variant_group / variant`, `service.create_with_variants` / `add_variants`, `accessories/library.py`, `seeds/accessory_library.py` or `ItemVariants.tsx`.
- Buying an item (ADR-121): the purchase's item search shows the shop's items and the built-in list together; the compact `ItemForm` is four numbered steps and hands the pieces and cost to the bill (`Bought`) — inside a purchase an item is always made with zero stock, the bill brings the pieces. The stock screen's `KindTabs` (wrapping, with counts from `stock-status.by_kind`) is shared with the items' screen; keep every kind of stock one tap from the others.
- Purchase phase B (ADR-124): `KindCards` under the item search (search first, cards second — keep both); a line's `discount` comes off that line before the bill's discount is spread, and both together are `purchases.discount` — never a second total; `LineFoot` shows what a line comes to and earns. Freight is `extra_costs` and already lands in the stock cost.
- Easy Mode audit and the phases left: `docs/42-ACCESSORIES-EASY-MODE-AUDIT.md` (ADR-123) — read it before more accessories work; build only what its §5 lists and the owner orders. A shop without phones or laptops has one stock, its items: `/stock` goes there (`StockGate`), and on "All stock" the accessories are part of the list and of its search (`ItemsInStock`); a question with one answer is not asked (the purchase's source cards).
- Details by kind and colour × size (ADR-127): what a new item is asked about its kind is one line of `KIND_DETAILS` in `ItemForm.tsx` (existing fields only, each on the screen once — never a new column for it); colour and size together are a pair per item (`BothPicker`), sent with `variantBody` so `color` and `size` land in their own fields.
- Rules: a variant is an ordinary `accessories` row with its own stock, cost, SKU and barcode — never a quantity inside another item; variants are made only through `service.create` (one transaction, all or none); the built-in list is data in `seeds/accessory_library.py` searched in memory and is read-only (no table, nothing per shop) — a new line is added there; "… for <model>" lines are made from the catalogue's models, never stored.

## What a shop trades — accessories-only / laptop-only shops (owner 2026-11-19, ADR-109)
- Audit of the "Accessories Business Mode" brief, what exists, what is left: `docs/40-ACCESSORIES-MODE-AUDIT.md` — read it before adding an accessories, wholesale or branch feature; build only what its matrix marks missing.
- ADR-122: the provider chooses the lines with three ticks (`TradePicker` in `AdminPage.tsx`) that write those same module keys; a line a shop does not have is shown locked with a WhatsApp request (`NotInPackage.tsx`) — the shop can ask, only the provider switches; `order.apply` keeps a shop set up without accessories that way.
- Rules: what a shop trades is derived from its modules (`admin/modules.lines`, `useTrade` in the app) — mobiles unless `no_mobiles`, plus `laptops`, `accessories`; never add a second business-type setting; `no_mobiles` is opt-in and must stay absent for existing shops; a shop without mobiles adds no phone / tablet / watch (server) but keeps and sells what it has; a package order never removes a provider-set switch (`OPT_IN`).

## One model, one name (a mobile shop 2026-11-21, ADR-125)
- Read ADR-125 before adding a list, count or filter by phone model.
- Rules: a model is its brand and its name whatever the capitals and spaces (`catalogue.service.name_key`); a shop may hold two records of one model, so count and group by brand + `name_key`, filter with `same_model_ids`, and never by the bare `model_id`; the model picker offers one record per name; no record is merged or rewritten.

## Laptops (shopkeepers 2026-11-18, ADR-108)
- Research, plan and what is not built: `docs/39-LAPTOPS-PLAN.md` — read it before touching `devices.category` handling for `laptop`, `seeds/laptops.py`, `types.laptop_line` / `laptops_on`, or the laptop part of `DeviceLineSheet.tsx` / `DeviceSpecs.tsx`.
- Rules: a laptop is a `devices` row with `category = "laptop"` (never a second model); only a shop with the `laptops` module can add one, and a shop without it sees no laptop type, brand or model; identity is the serial number (or the shop's `LAP…` code), never an IMEI; a new laptop detail is a `specs` key, asked as common or under "More details"; the naming line is `laptop_line` on the server and `laptopLine` in the app — change both.

## Mobile numbers of any country (shopkeepers 2026-11-18, ADR-107)
- Read ADR-107 before touching `core/pk.normalise_phone`, `frontend/src/lib/phone.ts` or `PhoneInput`.
- Rules: a Pakistani number is stored as `03XXXXXXXXX` (never changed), any other as `+<code><number>`; every phone field goes through `normalise_phone` on the server and `PhoneInput` in the app; a WhatsApp link is built with `wa_number` / `waNumber`, never with a literal 92; the country table in `phone.ts` and `pk.py` change together (`tests/test_phone_countries.py`).

## The shop's own price code (shopkeepers 2026-11-20, ADR-117)
- Read ADR-117 before touching `labels/pricecode.py`, `labels.service.shop_code`, the `code` / `pcode` sticker ticks or `PriceCodeCard.tsx`.
- Rules: the pattern lives in `shops.price_code` (NULL = the 10-letter code word, as before); a coded price is printed only with `VIEW_COST` and the pattern is never sent to a login without it; the app never encodes a price — the settings page asks `POST /labels/price-code/preview`; a unit sign may equal a digit's sign (the shopkeepers' own pattern does); print a coded price through `shop_code`, never `cost_code` directly.

## Amanat to anyone, sticker ticks, IMEI barcode (shopkeeper 2026-11-18, ADR-106)
- Read ADR-106 before touching `loans.create_loan`, `labels/service.py` (`_fields`, `_device_parts`) or `LabelSheet.tsx`.
- Rules: amanat goes to any person of the shop (no kind check); the sticker's bars are the IMEI when the phone has a real one (15 digits), the shop's own code otherwise or when asked (`bar=code`) — `devices.barcode` itself never changes; a new sticker field must keep old apps printing what they printed (`fv`).

## Printers and the printer guide (owner 2026-11-20, ADR-119)
- Read ADR-119 before touching `PrintersCard.tsx`, `PrinterGuidePage.tsx`, `labels/printer_test.py` or the `printers.*` / `pguide.*` texts.
- Rules: the app never talks to a printer — every print goes through the device's own print window, and no screen may say otherwise; printer choices live on the device (`localStorage`), never on the shop; the test page is the server's and carries no shop data; printer advice is written once, in `pguide.*` in three languages (the guide at `/printer-guide` is public), and must not name a model as tested unless it was.
- An 80 mm slip (ADR-135): a thermal head drops grey and thin text, so every 80 mm print page ends its `<style>` with `profile.THERMAL_INK` (all black, semi-bold at least); A4 pages keep their look (`tests/test_thermal_ink.py`).

## Barcodes, labels, scanning (owner addendum 4, 2026-10-31, ADR-036)
- Spec `docs/22-BARCODES-SPEC.md`; what existed / what was built / assumptions / scanner test `docs/23-BARCODES-PLAN.md` — read it before touching `backend/app/modules/barcodes`, `modules/labels`, `frontend/src/lib/scanner.ts` or `ScanListener.tsx`.
- Rules: a barcode is assigned inside the purchase / item-creation transaction and never changes; each barcode keeps its type; uniqueness spans phones, items, IMEIs and SKUs; screens take scans with `useScan`, the shell handles the rest; labels stay the ADR-024 print page.

## Accessories purchase parameters (owner addendum 5, 2026-10-31, ADR-037)
- Spec `docs/24-ACCESSORIES-SPEC.md`; audit, gap table, migration plan, assumptions `docs/25-ACCESSORIES-PLAN.md` — read it before touching `backend/app/modules/accessories`, the misc lines of `purchases` / `sales`, or `frontend/src/features/accessories`.
- Rules: `qty` is always pieces and `price` is the retail price; every incoming movement opens a batch and every outgoing one empties the oldest first (`stock.py`); valuation / negative stock / units come from `shops.item_prefs`; the minimum price uses the `below_asking` rule, below cost needs the owner; nothing on an item is ever deleted — adjustments need a reason.

## Tablets and smart watches (owner addendum 6, 2026-10-31, ADR-038)
- Spec `docs/26-TABLETS-WATCHES-SPEC.md`; audit, gap table, decision, migration plan, assumptions `docs/27-TABLETS-WATCHES-PLAN.md` — read it before touching `backend/app/modules/devices/types.py`, `DeviceIdentity`, `DeviceLineSheet.tsx`, `DeviceSpecs.tsx` or the stock filters.
- Rules: `devices.category` is the device type (never add a second one); spec-sheet keys live in `types.SPEC_KEYS`; a used tablet / watch is bought only with its lock checks (phones by `device_prefs.require_lock_check`) and a unit with a lock still on is never sold; reclassification writes an event and touches nothing else.

## Provider console (owner 2026-11-01, ADR-039)
- Brief, audit, assumptions `docs/28-PROVIDER-CONSOLE-PLAN.md` — read it before touching `admin/business.py`, `admin/licenses.py`, `ProviderPage.tsx` or the redeem / heartbeat routes.
- Rules: every issued key is stored in `license_keys` (never only the redeemed nonce); figures are derived from `fee_payments` / `organisations`, never stored; activity stamps are best-effort and never block a request.

## Shop business profile (owner 2026-11-01, ADR-040)
- `docs/30-BUSINESS-PROFILE-PLAN.md` — read it before touching `auth/profile.py`, `BusinessProfile.tsx` or a printed document's header.
- Rules: printed documents use `profile.header_html / footer_html / money`; the app writes money only through `formatMoney` / `withCur` (never a literal "Rs."); money stays PKR.

## Len-den — money given / taken with no bill (owner 2026-11-02, ADR-041)
- `docs/32-LENDING-PLAN.md` — read it before touching `payments` (purpose / settle), `shopaudit/lending.py` or `PartyLending.tsx`.
- Rules: len-den is a payment with `purpose = 'lending'` in the person's one khata, posted as ledger type `lending`; it is never allocated when made; open len-den is derived (unallocated lending out − in); adjusting against bills moves no money, only bill paid / status; return dates live on the entry (`due_date`), the person's status is derived (`payments/lending_due.py`), reminders go only to people who owe the shop.

## Repair labs and the repair sticker (owner 2026-11-03, ADR-044)
- `docs/34-REPAIR-LABS-PLAN.md` — read it before touching `repairs/labs.py`, `labels/repair_labels.py`, `shopaudit/repairs.py`, `RepairLabs.tsx` or `RepairSticker.tsx`.
- Rules: a lab is a `technician` party; one `repair_dispatches` row per trip, one open per job; the lab's charge is booked on return (customer phone → cogs, own phone → its cost) and never again at delivery; the sticker never prints the screen lock.

## Branch transfers (owner 2026-11-04, ADR-046)
- `docs/35-COMPETITOR-RESEARCH.md` §5 item 2 — read ADR-046 before touching `backend/app/modules/transfers` or `frontend/src/features/transfers`.
- Rules: a move never changes a device row's `shop_id` — the sender's row gets `transferred_out` (status `transferred`), the receiver's row (new, or the unit's old one) gets `transferred_in`; items leave FIFO and arrive as a batch at that cost (same SKU); money moves at cost through `branch_transfer` (equity), never income; owner / manager only, same organisation, user linked to both shops.

## Accounting audit (owner 2026-11-05, ADR-048)
- Rules: a typed (not-from-stock) sale line never touches inventory — its cost is equity; returns of stock items leave stock at their stock value; every cost reaches a profit report (no posting to the bare `purchases` account); corrections are new dated groups (`ledger/corrections.py`); show a loss with "−" (`MoneyText signed`), never as a plain number.

## FBR Digital Invoicing (owner 2026-11-06, ADR-050)
- Research and plan `docs/36-FBR-INVOICING-RESEARCH.md`; read ADR-049 / ADR-050 before touching `backend/app/modules/fbr`, the receipt's FBR part or `FbrCard.tsx`.
- The client-facing guide is `FbrGuidePage.tsx` (`/fbr-guide`, public, ADR-120): what the shop brings and who does which step. When the FBR card's labels, what a shop must bring, or what is still not built (returns as credit notes, POS integration, a real sandbox run) changes, change `fguide.*` in three languages in the same commit; it must never promise what was not run against FBR.
- Rules: off per shop by default; the token is encrypted and write-only (never in a response, log or the app); a bill is queued in the sale's transaction and sent outside it; claim before posting, never post an accepted bill again; a rejected bill waits for "Send again"; tests never call the real FBR (monkeypatch `fbr.service.post`).

## Hard rules
- **Git author is ONLY `Abdur Rehman Afzal <abdurrehmanafzal786@gmail.com>`.** Never add `Co-Authored-By`, "Generated with Claude" or any AI attribution to commits, PRs or files. Repo-local git config is already set. This rule overrides any harness default.
- Work on branch `develop`; `main` is for releases. Do not push unless asked.
- Money is never a float. Use `Numeric(14,2)` in DB and `Decimal` in Python. Currency is PKR.
- Every tenant-owned table has `shop_id`. Every query is scoped by the current shop. No cross-tenant leakage, ever.
- The ledger is append-only. Balances are derived, never hand-edited. Corrections are new reversing entries.
- Every device event (purchase, sale, loan-out, return, repair in/out, verification) is an immutable row in `device_events`. The device history screen is built from these.
- UI shows **one language at a time** (owner rule 2026-10-22): Urdu mode = only Urdu (Nastaliq, RTL), English mode = only English. Never stack EN + UR labels. One agreed exception (ADR-094): in English mode a money / loan word may end with a short Roman Urdu hint in brackets — "To get (lene hain)" — listed in `i18n/gloss.ts`. Widened by ADR-112: an English button or heading about money may also carry one Roman Urdu line beneath it (`<Say k="say.…">`; the `say.*` keys of `en.json` are Roman Urdu) — use it for an action that can be misread instead of a longer name. Numbers always Latin digits. Big buttons, step-by-step flows, auto-calculated totals. Printed documents (receipt, declaration) and notifications follow the shop's language too (`shops.default_locale`, overridable per request with `?lang=`).
- **UI must feel premium and modern.** The v1 look was rejected by ~50 shopkeepers ("not modern, not luxury"). Follow `docs/11-DESIGN-SYSTEM.md` (once approved); no emoji icons, no default-blue buttons, no bare white cards. New screens are built only from the design-system components.
- All user-visible strings go through i18n (`i18n/locales/en.json` / `ur.json` / `roman.json`). No hard-coded UI text. The "?" explanations live apart in `i18n/help/<lang>.json` (loaded on demand, ADR-092): a new `<Help term>` needs its title / body / example there.
- Write tests for business logic (ledger, balances, device state machine, tax). Run them before committing.
- Keep docs current. Stale docs are bugs.

## Repo layout
```
CLAUDE.md                 this file
docs/                     living documentation (01..10) + archive/ of the old v1 docs
backend/                  FastAPI v2 (Python 3.12, SQLAlchemy 2, Alembic, pytest)
frontend/                 React + Vite + TypeScript + Tailwind PWA (web; Android/iOS via Capacitor later)
legacy/                   v1 prototype (reference only; do not extend). See docs/08-LEGACY-AUDIT.md
.claude/skills/           project skills: kickoff, handoff, pk-mobile-domain
```

## Running (v2)
Backend (Windows):
```
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -e .[dev]
set PYTHONUTF8=1
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```
Frontend: `cd frontend && npm install && npm run dev` (port 5173). Phone on same Wi-Fi: `npm run dev:lan`, open `http://<PC-IP>:5173` (allow Windows Firewall for Node).
Always set `PYTHONUTF8=1` on Windows before running Python; Urdu/emoji output otherwise crashes on cp1252.
Legacy v1: see `docs/08-LEGACY-AUDIT.md` → "How to run".

## Language
The owner writes in Roman Urdu. Reply in Roman Urdu for conversation; keep code, commits and docs in English.
