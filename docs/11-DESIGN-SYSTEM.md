# 11 — Design System v2.0 "Dukaan counter" (approved 2026-10-26)

Status: **Approved v2.0 · 2026-10-26** (ADR-009). Mockup: https://claude.ai/artifact/AyT6sqrTu2u1BTHqowjNqH (home UR/EN, 3-step sale, udhaar khata, stock worth, day hisaab, laptop counter).
Why: owner + 10 testers rejected v1.x as "not easy, looks like Easypaisa (a payment app)". Users are not technical: every screen answers one plain question in shop words.

## Principles
1. **One job = one colour = one word.** Sell (green), Add stock (blue), Udhaar (amber), Stock (violet), Repair (teal), Expense (rose). The same colour is used for that job's tile, side-menu item, headers and summary cards.
2. **Answers on the home screen.** Any day's sale / udhaar given / cash in (Today · Yesterday · Date), I will get / I have to give, stock worth in rupees and lakh. No hidden amounts, no eye toggle.
3. **Three steps max** for everyday work (sale: which phone → how much & how paid → done). Rare options (discount, warranty, box/charger, customer on a cash sale) sit behind one "more options" link.
4. **Shop words, not accounting words**: udhaar, lena/dena, "paise mile / paise diye", "stock daalein", "ID card check" (not ledger, party, verification, receivable).
5. **One language at a time**; digits always Latin in Manrope (`.num` sets the font so Nastaliq never draws 0 as a dot).
6. **Every action looks like a button and has an icon** (owner, 2026-10-26: "simple text samajh nahi aa raha"). No bare text links: secondary actions use `IconChip` (icon + words in a bordered pill), main actions `BiButton` with `icon`, choices (cash / account / udhaar, ID check / skip) are chips with an icon above the word; "ghost" buttons have a border. Home's "See full hisaab" and "Profit & reports" are tiles. **No icon without words either**: every icon button shows its name (`BtnText`, icon above the word in headers, beside it in rows), e.g. Back, Delete, Edit, More, Messages.
7. **A card that opens something says so**: a "See details ›" pill (`SeeMore`) at the bottom of every tappable card on home (hisaab, khata, stock, profit) and on attention rows (owner, 2026-10-26: users did not know cards could be tapped).
8. **Phone and laptop equal.** Phone: 5-tab bottom bar (Home, Stock, Udhaar, Hisaab, More), no FAB. Laptop (≥1024px): the job tiles become a side menu with F-keys (F2 sell, F3 add stock, F4 udhaar, F6 stock, F7 repair, F8 expense; F5 left alone).

## Looks (v2.1 → v2.2, 2026-10-26)
Testers said the pastel job tiles looked "like a school kids' software, not professional". Three looks share the same tokens, switchable under More → App → Look (`useTheme().palette`, `html[data-palette]`):
- **Modern (default since v2.2, owner: "Stripe and Google inspired"):** Stripe navy text (#0A2540) on #F6F9FC, white cards with a hairline + very soft shadow, one blurple accent (#635BFF) for Sell, primary buttons and Profit, navy Add stock and hisaab card, light lavender icon wells, Inter font, tighter corners (buttons 12px, cards 16px), Material-style pill behind the active bottom tab.
- **Professional:** cool grey ground, white cards, one teal accent. Sell = solid teal, Add stock = solid ink; every other job is a neutral grey well with an ink icon. Money keeps its meaning colours (green in, amber to get, red to give).
- **Navy:** navy + gold. Sell = solid navy, Add stock = solid gold, other jobs neutral.
- **Colorful:** the v2.0 pastel tiles, kept for comparison.
Each job has three tokens: `--t-<job>` (tile), `--t-<job>-fg` (text on the tile) and `--t-<job>-icon` (icon inside a white well). A solid card must use the light "See details" pill and the `-icon` colour, never white on white.

## Colour tokens (CSS variables in `frontend/src/index.css`, Tailwind names in brackets)
| Token | Light | Use |
|---|---|---|
| ink | #1B1F24 | text, primary dark buttons, selected chips |
| ground | #F6F4EF | app background |
| surface / line / muted | #FFFFFF / #E6E2DA / #5E646B | cards, hairlines, secondary text |
| emerald | #1E6B45 | "complete sale", money in, success |
| receivable / payable | #8A5300 / #A1352B | lene hain / dene hain amounts |
| tiles (`sell`, `buy`, `khata`, `stockt`, `repair`, `expense` + `-fg`) | #DDEFE3/#14482F, #DFE8F5/#173C6B, #F8EBD3/#6B4000, #E9E4F4/#432C78, #DCEEEE/#144A4A, #F6E2DF/#7E2219 | job colour: background / text+icon |
Dark theme redefines every token (deep tinted tiles with light text). Light is default; dark/system under More → Appearance.

## Components
- `features/counter/jobs.ts`: the single list of jobs (route, label, icon, colour, F-key) used by Home and the side menu.
- `DayPicker`: Today / Yesterday / Date chips (local YYYY-MM-DD).
- Home tiles (2 big + 4 small), Hisaab card, lena/dena cards, stock-worth card, attention rows.
- Pages: `/stock/summary` (brand → model worth), `/hisaab` (any day), `/khata` (totals are filters; paise mile / diye), `/sale/new` (3 steps).
- Existing primitives (`BiLabel`, `BiButton`, `BiInput`, `Sheet`, `RemoveSheet`…) stay; build new screens from them on these tokens.

## Typography, shape, icons, accessibility
Manrope (UI, numbers) + Noto Nastaliq Urdu (Urdu mode). Radius: tiles/cards 20–24px, buttons 16–18px, chips full. Lucide stroke icons, no emoji. Tap targets ≥44px (main actions 56–64px). Never colour alone: amounts also say "lene hain / dene hain".

---

# Archive: v1.0 "Emerald & Gold" (2026-10-22, superseded)


Status: **Approved v1.0 · 2026-10-22.** Owner decision: "do what is best for now; give both light and dark." Direction A "Emerald & Gold" as shown in the mockup
https://claude.ai/artifact/AEWv7XqFN62dXjuNWmGnad (5 phone screens: dashboard light, used-mobile purchase/verification, sale confirm, device history, dashboard dark).
This is the source of truth for `frontend/src/index.css` (CSS variables), `frontend/tailwind.config.js` and `frontend/src/components/Bilingual.tsx`. Decisions: **light is the default**, dark and "system" are user-selectable under More → Appearance; **emerald** accent; **one language at a time**: Urdu mode shows only Urdu, English mode only English (owner feedback 2026-10-22 after seeing the stacked labels). Shopkeeper-group feedback is still welcome and may produce v1.1.

## Why this direction
- Shopkeepers judged v1 "not modern, not luxury" (FR-PLT-08). The cues of "expensive" on a phone are: deep dark surfaces with one warm metallic accent, generous radius, soft real shadows, confident large numbers, and Urdu set in Nastaliq at display size rather than as an afterthought.
- Money is the hero. Every screen has one big tabular number the eye lands on first.

## Colour tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `ink` | #0E1613 | #F2F1EC (text) | Primary text; hero cards in light mode |
| `ground` | #F4F3EE | #0B100E | App background (warm off-white, never pure white) |
| `surface` | #FFFFFF | #141C18 | Cards |
| `line` | #E4E2DA | #243029 | Hairlines, card borders |
| `muted` | #5C655F | #A9B0AB | Secondary text (≥4.5:1 on surface) |
| `emerald` | #136F56 | #136F56 | Primary action, success, "verified" |
| `emerald-deep` | #0B4A3A | — | Pressed state, dark text on emerald tint |
| `emerald-tint` | #DCEFE6 / #EEF5F2 | rgba(19,111,86,.18) | Success chips, icon wells |
| `gold` | #C8A14F | #C8A14F (#F3C96B for text on dark) | Profit, highlights, primary FAB on dark |
| `receivable` | #9A5B00 on #FFF4DB | #F3C96B | "Lena hai" amounts |
| `payable` | #B3261E on #FDE8E6 | #F28B82 | "Dena hai" amounts |
Rules: one accent per screen region; gold only for money/highlights, never for large fills in light mode; red/amber differ in lightness as well as hue.

## Typography
- Latin UI: **Manrope** 500/600/700/800. Numbers: 800, `font-variant-numeric: tabular-nums`, letter-spacing −0.02em. Always Latin digits.
- Urdu: **Noto Nastaliq Urdu** 400/700, `direction: rtl`, `unicode-bidi: isolate`, line-height 1.9. Urdu is the larger line in every bilingual pair.
- English mode: Manrope 500–700 at the scale below; Urdu mode: Nastaliq one step larger. No English eyebrow above Urdu text.
- Scale: eyebrow 10 · caption 11–12 · body 13–14 · Urdu body 14–15 · title 17–20 · Urdu title 18–20 · stat 22 · hero number 38.

## Shape, depth, motion
- Radius: cards 20–24px, buttons 18px, icon wells 12–14px, chips 999px, phone screen corners 44px.
- Shadows: only on the hero/dark card and primary CTA: `0 18px 40px -24px rgba(14,22,19,.55)` and `0 14px 28px -14px rgba(19,111,86,.8)`. Everything else is flat with a 1px `line` border.
- Bottom nav and sticky footers: translucent surface + `backdrop-filter: blur(10px)`.
- Motion (to implement): 160ms ease-out on press scale(.98); sheet transitions 240ms; number count-up on dashboard load.

## Components seen in the mockup
Top bar (shop monogram + bilingual name + bell) · Hero stat card · 2×2 stat tiles · Quick-action grid · Attention list rows · Bottom nav with raised "new" FAB · Step header with progress segments · Summary strip (device + price) · Photo tiles (CNIC/seller) · Check rows with result chips · Segmented control (PTA / Non-PTA / JV; Cash / Easypaisa / Bank) · Labelled numeric input · Checkbox row with print icon · Sticky footer CTA with secondary action · Customer card with balance · Line item with accessory chips · Totals card (dark) with highlighted new balance · Timeline (device events) with status nodes.

## Iconography
Stroke icons, 1.75px, round caps (Lucide-compatible). No emoji anywhere in product UI.

## Accessibility
Tap targets ≥44px; text contrast ≥4.5:1 (muted #5C655F on white = 5.9:1; #A9B0AB on #141C18 = 7.1:1); never colour alone for meaning (amount sign is also written as "Lena hai / Dena hai").

## Implementation map
- Tokens: `:root` (light), `:root[data-theme='dark']`, and `:root[data-theme='system']` under `prefers-color-scheme: dark` in `frontend/src/index.css`; Tailwind colours read them as `rgb(var(--x) / <alpha-value>)`.
- Theme store: `frontend/src/lib/theme.ts` (zustand, persisted, sets `data-theme` and the `theme-color` meta).
- Primitives: `BiLabel`, `BiButton` (primary/secondary/danger/ghost/gold), `BiInput`, `BiAlert`, `BiSegmented` in `frontend/src/components/Bilingual.tsx`.
- Icons: `lucide-react`, 1.75 stroke.
- Shell: `frontend/src/app/Shell.tsx` (monogram top bar, bottom nav with raised FAB).

## Resolved questions (2026-10-22)
1. Default: light; dark and system available to every user.
2. Accent: emerald (#136F56); gold reserved for money/highlights.
3. Superseded 2026-10-22: no stacked EN+UR labels; the UI renders only the active language. `useLang()` in `Bilingual.tsx` picks the string and the type style.

## UI reference from the owner (2026-10-22): Easypaisa app screenshots
Stored outside the repo in `C:\Users\HP\Documents\projects\mobile shop\*.png` (First Screen, Login Screen, After Login Screen, Bank Transfer, Mobile Packages). Patterns adopted:
- **Home**: solid brand-green header band (avatar left, title centre, search + bell right) with a white hero card overlapping it; **amounts hidden by default** behind an eye toggle (customers stand at the counter); three large primary action tiles; one card holding a 4-column "more services" icon grid; bottom nav with a raised centre button.
- **Centre button opens a chooser** ("What do you want to do?") grid sheet, like "Send Money To".
- **PIN login**: lock icon, PIN boxes, on-screen keypad, "forgot PIN → password".
- **Lists**: search pill, underline tabs, rows with logo/initials + chevron (Bank Transfer); offer cards with stat columns + pill CTA (Mobile Packages) — to apply to stock cards next.
Colours stay on our tokens (emerald + gold); the green band uses `emerald`. Switching to Easypaisa's brighter green is a single token change if the owner wants it.
