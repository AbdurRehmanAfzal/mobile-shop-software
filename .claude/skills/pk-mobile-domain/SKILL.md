---
name: pk-mobile-domain
description: Pakistani mobile-shop domain rules for this product (used mobiles, PTA/Non-PTA/JV, SIM time, IMEI, CNIC verification, eGadget, loans between shops, credit ledgers, FBR tax, Urdu UI conventions). Load whenever implementing or reviewing business logic, data models, validations, or UI text for devices, verification, sales, purchases, ledger, repairs or tax.
---

# Domain rules

## Devices
- IMEI is 15 digits; validate with the Luhn check. Dual-SIM phones have IMEI2; a few have IMEI3. Serial is optional.
- Condition: `box_pack` (sealed new), `open_box` (new, opened), `used`, `patched` (hardware-modified / "patch" phones, record details).
- PTA status: `pta_approved` (works on Pakistani SIMs indefinitely), `non_pta` (works for a limited **SIM time**, typically 60/120 days per SIM, after which it is blocked unless PTA tax is paid), `jv` (locked/patched to bypass; also has a SIM time, higher risk). Always capture `sim_time_months` for `non_pta` and `jv`; show a warning on sale.
- Warranty: months + start date; box-pack usually 12 months from purchase; used usually 0 or a shop warranty of days.
- One physical device = one `devices` row forever, keyed by IMEI1 per shop. If it is bought again, increment `cycle_no` and append events; never create a duplicate.

## Verification of walk-in purchases (used devices)
- Required before a used device bought from a walk-in can be sold: seller name, phone, CNIC number (format `#####-#######-#`), CNIC front/back photos, seller photo, device photos, eGadget result, PTA status.
- eGadget portal (Punjab Police): https://egadget.punjab.gov.pk — manual check; the app stores the result and optional screenshot. PTA status can be checked by SMS to 8484 with the IMEI; the app offers a "copy IMEI / open SMS" helper.
- `flagged` devices are hard-blocked from sale; owner override must record a reason in the audit log.
- Print a bilingual purchase declaration for the seller to sign.

## Parties and money
- One `parties` table; a party can be customer, supplier, another shop and/or technician at once.
- Balance sign: **positive = party owes the shop** (receivable), **negative = shop owes the party** (payable). Show as "Lena hai / لینا ہے" and "Dena hai / دینا ہے" rather than +/−.
- Money is PKR, `Decimal`, 2 dp, displayed with Latin digits and thousand separators (e.g. `Rs. 1,25,000` is common in Pakistan but use `Rs. 125,000` consistently for now).
- Loans between shops (`amanat`/`udhaar`): device leaves stock with no money; settlement is either return or conversion to a sale to that shop at the agreed price. Returns after partial payment must offer: refund, keep as credit, or keep as income.
- Credit sales are normal; partial payments are normal; always show the running balance after each entry.

## Repairs
- A customer's own device in repair is not stock. Record received accessories and condition photos to avoid disputes. Status changes must be logged with user/time. "Unclaimed" after a configurable number of days.

## Tax
- Sales tax rate is shop-configurable (FBR standard rate changes; never hard-code). Support tax-inclusive pricing (common in retail) and show tax separately on the invoice. Rounding 2 dp per line. FBR POS integration is a later phase.

## UI conventions
- Every label: English (small, top) + Urdu (large, bottom, RTL, Noto Nastaliq Urdu). Numbers always Latin digits. Big tap targets, one task per screen, confirm screens show totals large.
- Common Urdu terms: Sale = فروخت, Purchase = خریداری, Customer = گاہک, Supplier = سپلائر, Balance = بقایا, Payment = ادائیگی, Received = وصول, Stock = اسٹاک, Repair = مرمت, Loan/Amanat = امانت, Return = واپسی, Expense = خرچ, Cash = نقد, Invoice = بل / رسید, Warranty = وارنٹی, Verified = تصدیق شدہ.
