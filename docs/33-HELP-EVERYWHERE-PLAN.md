# 33 · A "?" with an example on every field, tab and card (owner 2026-11-02)

## 1. Owner brief (verbatim, Roman Urdu)
> ak chez shop keepers nay notice ki hai k hm non technical audit may r sub modules may info icon may
> example be honi chye jis say pta chl jay ek ye field is chez ki hai , r ye tab card is chez ka hai
> mean hr chez pr example ho agr kise ko koe samj nahi a rhi tu wo example dakh lay.

In short: shopkeepers asked for an info icon with an example, in the audit and in every module, on
every field, tab and card, so that anyone who does not understand something can tap and see an
example.

## 2. What existed
- `components/Help.tsx` (2026-10-28): a "?" that opens title / explanation / example from
  `help.<term>`.
- It covered only 18 fixed terms (udhaar, khata, PTA, IMEI, …), used in 19 places.
- Most screens, all audit cards and nearly every form field had none.

## 3. Decision
- `Help` takes any term under `help.` (nested, e.g. `audit.finance.sales_now`) and a small size
  for cards / labels.
- `Section` and `KV` take a `help` key.
- Every term must have title, body and example in en / ur / roman. `Help.test.ts` scans the code for
  every term used and fails if any part is missing in any language.
- Shared wording lives once: `help.common.*` (name, phone, CNIC, address, notes, amount, date,
  payment method, account, discount, tax, paid now, remaining, quantity, period, as of, print /
  Excel, search), plus the original 18 terms. Module texts sit under the module's own namespace.

### What gets a "?"
- every screen title;
- every tab / segment;
- every card, tile, KPI, chart and section;
- every form field.

Plain action buttons (Save, Back) and individual list rows do not.

### Style of the texts
- **title**: the label as the shopkeeper sees it.
- **body**: 1–2 short sentences in shop words, saying what it is and where its number comes from.
- **example**: a concrete shop case with rupees and the result.
- Urdu in Urdu script; Latin digits; money "Rs. 25,000".

## 4. How it was built
The work was split by module. Each group edited only its own screens and wrote its texts to a
fragment; the lead merged the fragments into the locale files, refusing any overwrite. The groups:

| Group | Screens |
|---|---|
| Audit 1 | overview, finance, sales and purchases, udhaar, len-den, reports |
| Audit 2 | stock, products, bills, people, security, staff |
| Counter and sale | home, day hisaab, khata, reminders, sale, return, exchange, invoices, payment |
| Purchase and stock | add stock, device fields, stock, ID check, catalogue, loans, labels |
| Items and khata | accessories, repairs, installments, expenses, people / khata, len-den |
| More and settings | settings, staff, profile, notifications, bulk, accounts, fees, reports |
| Super admin | super admin, business console, key page |

## 5. Status
See `docs/06-PROGRESS.md` (Phase 15).
