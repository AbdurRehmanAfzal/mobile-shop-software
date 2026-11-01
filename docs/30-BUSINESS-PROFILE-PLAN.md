# 30 · Shop business profile — brief, research, audit, what was built

## Owner brief (verbatim, 2026-11-01)

> r ab ye kh rha hun hm shop ki setting may shop fields add krainy like k shop logo upload kr skta
> hai , apna , apni detial add kr skta hai , curreny detail add kr sktay hai by defualt Rs he rhay ki
> pakistan rupees , apna NTN DETAIL , APNI BUSINESS DETAIL , WO DAKH LYNA r&d kr k lia kia kia ho
> skta hai ous k according kr lyna

In English: shop settings should let the shop upload its logo, add the owner's own details, set the
currency (default Rs., Pakistani rupees), its NTN and its business details — research what else
belongs there and build accordingly.

## Research (2026-11-01)

Pakistani POS / digital-invoice setups keep the seller's name and address, NTN (7 digits + check
digit, or 13), STRN (13 digits), CNIC for individuals, province, and an FBR POS ID when the shop is
in FBR's point-of-sale scheme; the receipt header carries the business / brand name, full address,
NTN and STRN; FBR-integrated receipts add an FBR invoice number and QR (not in scope — needs PRAL
integration). Sources: Odoo `l10n_pk_fbr_pos_receipt`, `sh_pos_fbr_connector`, FBR press releases,
ProPakistani (buyer name above Rs. 100,000), Hysab invoice guide, ecosire FBR digital invoicing.

## Audit

| Field | Existed | Action |
|---|---|---|
| Shop name, city, phone, language | yes, on Settings | keep |
| `address`, `whatsapp`, `logo_path` | columns existed, **not on Settings**, logo never printed | expose; logo upload route; printed |
| `ntn`, `strn` | yes, only visible when tax was on, free text | own "Tax registration" card, validated (NTN 1234567-8 or 13 digits; STRN 13 digits) |
| Legal name, tagline (en / ur), business type, registration no., year, province, email, website, social, opening hours | no | **add** |
| Owner name + CNIC | no (only the owner login's name) | **add** |
| FBR POS ID | no | **add** (printed; no FBR transmission) |
| Bank / wallet details on the bill, terms (returns / warranty) | no (footer text only) | **add**, with on / off print choices |
| Currency label | "Rs." hard-coded in ~74 places in the app and on bills | **add** setting: sign (Rs. · Rs · PKR · ₨ · روپے), before / after, paisa or not; always PKR underneath (hard rule) |

## Built

- Backend: `auth/profile.py` (currency, validators, logo inlined as a data URI so printed pages /
  PDFs / shared links show it, one header + one footer for printed documents), 19 shop columns
  (migration `d2f4b6c8e0a2`), `POST / DELETE /shops/current/logo` (JPG / PNG / WEBP ≤ 600 KB,
  settings managers only), `ShopOut` carries `logo_path` and `currency` (in `/me`). Sale bill and
  repair slip use the shared header / footer and the currency label.
- Frontend: `features/more/BusinessProfile.tsx` — cards Logo & business details, Owner details, Tax
  registration (FBR), Currency (with preview), Printed bill (what to show, terms en / ur, bank /
  wallet). The logo is scaled to 512 px in the browser before upload. Money everywhere in the app goes
  through `formatMoney` / `withCur` with the shop's label and position.
- Tests: `backend/tests/test_business_profile.py` (3), `frontend/e2e/business-profile.spec.ts`.

## Assumptions

1. Currency stays PKR (money rule); only the written label changes. Notification texts (WhatsApp /
   email templates) and Excel sheets still say "Rs." for now.
2. Print choices default: logo, tagline, NTN / STRN / FBR POS ID and terms on; owner name, bank
   details and social links off.
3. The seller declaration and the unit statement keep their own headers (they show name, address,
   phone already); the sale bill and repair slip use the new header.
4. FBR POS integration (invoice number + QR from PRAL) is not part of this; the FBR POS ID is printed
   only as information.
