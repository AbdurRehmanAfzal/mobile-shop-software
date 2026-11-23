

## 2026-11-23 (15) — The new product's drill-down (file 11, screen 2)

**Asked (owner)**: "ok start" — the next screen.

**Done**: `src/newui/pages/StockDrill.tsx`, opened by a kind card (`/new/stock/summary?kind=`): the breadcrumb heading with the kind's worth and counts, the search, the three orders (value, units, average), the capital-concentration bar in the file's colours with its caption, brands as cards that open into model cards (count, average, part of the brand); a model opens the stock list filtered to it (still the live list). Accessories, which have no brands, show their kinds in the same cards (designed here). Server: `reports.stock_summary` gained `top3_share` and `others_share` so the caption is not worked out in the app (ADR-131's rule); `test_stock_summary_kinds` pins them. Strings in three languages (`ndrill`).

**Verified**: ruff; pytest `test_stock_summary_kinds`; tsc; vitest; Playwright `newui-drill` (new: worth 20,000, 4 phones · 2 brands · 3 models, Nokia 60% / Samsung 40% and the caption, the three orders, a brand's models with 83.3% of Nokia, search with and without a match, a model opening the list, accessories by kind, back, Urdu without sideways scroll), `newui-stock` and `newui-frame` (updated: Stock is drawn now; the not-drawn check moved to Udhaar). Screenshot compared with the file. The local backend had to be restarted to serve the new keys.

**Next**: the sale, files 14 and 15.

**Open questions**: none.
