# 11 — Design System v1.0 (approved 2026-10-22)

Status: **Approved v1.0 · 2026-10-22.** Owner decision: "do what is best for now; give both light and dark." Direction A "Emerald & Gold" as shown in the mockup
https://claude.ai/artifact/AEWv7XqFN62dXjuNWmGnad (5 phone screens: dashboard light, used-mobile purchase/verification, sale confirm, device history, dashboard dark).
This is the source of truth for `frontend/src/index.css` (CSS variables), `frontend/tailwind.config.js` and `frontend/src/components/Bilingual.tsx`. Decisions: **light is the default**, dark and "system" are user-selectable under More → Appearance; **emerald** accent; the **English eyebrow stays on every label** until a shopkeeper test says otherwise. Shopkeeper-group feedback is still welcome and may produce v1.1.

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
- Eyebrow (English label): 10px, uppercase, letter-spacing .12em, 700, muted colour.
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
3. English eyebrow on every label for now.
