

## 2026-11-24 — Add stock in the new product (file 01)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/Purchase.tsx` at `/new/purchase/new`, a full-screen route beside the new shell, drawn from `01-add-stock-and-purchase.html` (sidebar, bar, the source and person bar with khata state and the anti-theft bar, the four builder tabs, the bill, payment, review, the saved modal with stickers). It fills the live `DeviceLineDraft` (`emptyDraft`, `draftToApi`, `expandDraft`) and posts what the live purchase posts, keeping the live checks (IMEI, in stock, asking ≥ cost, patched details, lock checks, review tick). Designed here and listed in docs/43: accessory name searches the shop's items first, new items made with no stock, several pieces' IMEIs, ID-checked skip after saving, CNIC onto the seller. Tailwind's `obsidian` shades now come from CSS variables so each file keeps its own (`data-file` 11 / 14 / 01). Strings in three languages (`nbuy`).

**Verified**: tsc; vitest 72; Playwright `newui-purchase` (new — a phone already in stock refused, asking under cost refused, a phone with the charger given, the shop's charger found and its pieces added (2 → 7, still one item), a new cover made with 10 pieces, a typed line, total 7,500, part on udhaar with the dealer owed 2,500 on the server, the review tick, the bill number; a customer's phone with "ID checked" not left pending; no sideways scroll on a phone) and the other four new-product tests after the colour change. Screenshot compared with file 01. Live files: only `router.tsx`. **Not done**: the locked-phone tab and the online / cheque payment in a browser; Urdu and dark screenshots; the full Playwright suite.

**Next**: the purchases list and bill inspector (file 10).

**Open questions**: none.
