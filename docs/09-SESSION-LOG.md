

## 2026-11-23 (16) — The new product's counter (files 14 + 15)

**Asked (owner)**: "ok start" — the sale screen.

**Done**: `src/newui/pages/Sale.tsx` at `/new/sale/new`, a full-screen route beside the new shell, drawn from `14-sale-pos-full.html` with file 15's brand pills, cheque and "paid now". It posts what the live sale posts (`POST /api/v1/sales`, the same body: devices with warranty and what came with them, items with their customer price, discount, tax at the shop's rate via the live `billTax`, paid, payment info, override reason, below-cost consent, PIN) and keeps the live rules in a confirm step drawn in the file's modal: the ID-check skip (ADR-128), the owner-only reason for a flagged phone, below-cost consent for owner / manager, the owner's PIN; udhaar switches to a khata customer and is refused without one. Held bills use the live endpoint with a `v: 'newui'` cart (a bill held in the live sale opens there). Scanner through `useScan` + `lookupCode`. Tailwind gained file 14's `limebrand-400/500/600` and `obsidian-700`; the files' scrollbars and pop-in animation are scoped to `[data-newui]` in `index.css`. Strings in three languages (`npos`). Differences from the drawing are listed in docs/43 (split = one way of payment plus khata, trade-in opens the live exchange, walk-in name into notes, Expense F8, the shop's tax rate).

**Verified**: tsc; vitest 72; Playwright `newui-sale` (new — cards and tab counts, a cash sale of a phone and two chargers with the margin and estimated profit, the hide switch, warranty, confirm and receipt, the phone sold on the server; udhaar refusing a walk-in, the khata box 7,000, the party's balance 7,000 on the server; hold, held count, resume; a salesman with no cost, margin, profit or switch; no sideways scroll on a phone) and `newui-frame`. Screenshot compared with file 14. `git diff origin/main` on the live app, features and components: only `router.tsx`. **Not done**: the ID-pending path in a browser (the server's rule is covered by its own tests); Urdu and dark screenshots of the counter; the full Playwright suite.

**Next**: add stock / new purchase (file 01).

**Open questions**: none.
