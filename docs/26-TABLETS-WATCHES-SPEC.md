# 26 · Tablets and smart watches — owner brief (verbatim, 2026-10-31)

> Pasted by the owner as "ADDENDUM 6". Kept word for word; the current-field audit, the gap table,
> the design decision, the migration plan and status live in `docs/27-TABLETS-WATCHES-PLAN.md`.

## ADDENDUM 6: Tablets and Smart Watches — audit existing fields FIRST, then upgrade

### 0. Do this BEFORE writing any code (mandatory)
1. Find how tablets and smart watches are currently handled in this codebase (they may be stored as "mobiles", as "accessories", or not at all). Inspect models/tables, purchase screen, stock screen, sale screen, invoice, reports, barcode (Addendum 4), history/ledger (Addendum 1).
2. List the CURRENT fields in a table for: (a) the existing mobile model, (b) accessories (Addendum 5), and note which of them tablets/watches already use.
3. Compare them against the TARGET fields in section A and output a gap table: Field | Exists today? (yes/no/partial) | Where | Action (reuse / add / migrate / skip, with reason).
4. Show me the table and your migration plan, then proceed without waiting. Do not duplicate fields that already exist under another name. Do not lose or break existing data, invoices or history.

### B. Design decision (decide yourself, then tell me what you chose)
Tablets and cellular smart watches are "serialized devices" like mobiles (unique IMEI/serial, one history timeline per unit, same purchase -> sale -> return cycles, same ledger, asking price vs sale price rules, anti-fraud rules, barcode on purchase). Prefer extending the existing device/mobile model with a device_type (MOBILE / TABLET / SMARTWATCH) and type-specific fields, instead of creating copies of all screens. Reuse the existing Mobile Detail history page (renaming it "Device Detail" if needed) so tablets and watches get the full history for free.
Non-serialized watches (cheap watches with no IMEI/serial, common in local markets) and bands/straps/chargers are handled as accessories (Addendum 5) with watch-specific attributes. Per product, let the user choose "Track by serial/IMEI" or "Track by quantity".

### A. TARGET fields (from spec sheets of tablets and smart watches, plus Pakistani market needs)
Common to both (reuse existing mobile fields where they exist):
- Device type, brand, model, model number, color, condition/grade (New sealed / Open box / Used A / Used B / Refurbished / Copy-China, configurable), purchase price, asking price, sale price, warranty (period, who gives it, starts at sale date), box/accessories included (box, charger, cable, strap, stylus, manual; checkboxes), notes, images (optional), barcode.
- Serial number / IMEI (IMEI 1 and IMEI 2 only when cellular), unique-checked; for Wi-Fi-only devices a serial number or none.
- PTA status for any device with SIM/cellular (PTA approved / Non-PTA / JV / Factory unlocked / Not applicable), shown in a clear badge on lists, sale screen and invoice. Do not mark it required for Wi-Fi-only devices.
- Lock status for used devices: iCloud / Activation lock cleared (yes/no/not applicable), Google/FRP lock cleared, Samsung account lock; show a warning checkbox that must be ticked at purchase of a used device ("lock checked and removed").
- Battery health (%) for used devices (optional) and battery capacity (mAh).
- OS and version, processor/chipset, RAM, internal storage (storage/RAM are variant attributes: same model with different storage = different variant/price), expandable storage (microSD yes/no), Bluetooth version, Wi-Fi (standard/band), NFC, GPS, weight, release year (optional).
- Display: size (inches), type/technology (LCD/IPS/AMOLED/Super AMOLED/OLED), resolution, refresh rate (optional).

Tablet-specific:
- Connectivity: Wi-Fi only / Wi-Fi + Cellular (4G/5G), SIM type (nano SIM/eSIM), front camera MP, rear camera MP, stylus/pencil support (and whether included), keyboard/smart cover included, fingerprint/face unlock, battery mAh, charging port (Type-C/Lightning/Micro-USB), fast-charge wattage (optional).

Smart watch-specific:
- Case size (mm), case material (aluminium/steel/titanium/plastic), band/strap material, band color, band size (S/M/L/one size), compatible with (Android / iOS / both), standalone cellular (LTE/eSIM) yes/no, GPS, heart-rate/SpO2/sleep/ECG sensors (checkbox list), water resistance rating (IP67/IP68/5ATM), always-on display, calling support (Bluetooth calling), wireless charger/cable included, battery mAh, battery life (days), watch OS (Wear OS / watchOS / Tizen / other / proprietary).
- For Apple Watch/Galaxy Watch style devices: paired-device lock check (similar to activation lock) before purchase and before sale.

### C. Purchase screen
- Selecting device type MOBILE/TABLET/SMARTWATCH loads the right set of fields. Required fields stay minimal: type, brand, model, serial/IMEI (if serialized), purchase price, paid amount, party. Everything else is optional or under "More details", since shopkeepers buy in a hurry.
- Autocomplete from a brand/model library that the shop builds as it goes (previously entered models and their specs are suggested, so repeated models fill their specs automatically). Optionally allow import of a model library from CSV.
- Quick duplicate check: IMEI/serial already in stock or previously in the system -> show its full history and warn (could be a returned or re-sold unit, or a stolen/duplicate entry).
- Auto-generate barcode + label on save (Addendum 4); label shows brand, model, storage/RAM, PTA badge, price (optional).

### D. History, ledger and invoices (same core principle)
- Every tablet/watch has the full timeline: in from whom, price, paid/remaining, payments, asking-price history, sale, returns, re-sales, profit; linked invoices; PTA/lock status checks logged as events with who/when.
- Customer and dealer pages include these devices in the same per-device breakdown of outstanding amounts.
- Invoice shows device type, brand, model, storage/RAM, color, IMEI/serial, PTA status, condition/grade, warranty, and included accessories.
- Exchange/trade-in: allow a tablet or watch to be taken in part payment against a mobile sale, with its value counted in the invoice and ledger.

### E. Search, filters, reports
- Filter by device type, brand, model, storage, RAM, color, condition, PTA status, price range, in stock/sold, age of stock.
- Reports: stock by device type (count + cost value + retail value), slow-moving devices, profit by device type/brand, PTA vs non-PTA stock, used devices with unchecked lock status.

### F. Migration
- Add device_type with default MOBILE for all existing records. Existing mobiles must keep working exactly as before.
- If tablets or watches were previously entered as mobiles or accessories, provide a safe reclassification tool (preview first, then apply), preserving history and IMEI/barcode.
- Keep Urdu/English labels for all new fields. Migrations must be reversible and idempotent.

### G. Tests
- Create a tablet (cellular) and a smart watch (Wi-Fi only, serial) via purchase: unique barcode generated, correct fields saved, history timeline created, ledger balance correct.
- The acceptance scenario from Addendum 1 (buy from A, sell to B, partial payments) also passes for a TABLET and for a SMARTWATCH.
- Duplicate IMEI/serial warning; PTA field only enforced for cellular devices; lock-check confirmation required for used devices.
- Reclassification tool preserves history, barcode and balances.
- Existing mobile flows still pass all earlier tests (no regression).

At the end, give me the final list of fields added or reused, what you decided in section B and why, and every assumption you made.
