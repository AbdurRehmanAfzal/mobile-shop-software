

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
