# 27 · Tablets and smart watches — audit, gap table, design decision, migration plan, status

Owner brief: `docs/26-TABLETS-WATCHES-SPEC.md` (Addendum 6, 2026-10-31). Decision record: ADR-038 in
`docs/10-DECISIONS.md`. Read this before touching `backend/app/modules/devices/types.py`, the
device identity schema, `DeviceLineSheet.tsx` or the stock filters.

## 1. What existed before (audit, 2026-10-31)

Tablets and smart watches were **already serialized devices** (owner plan of 2026-10-28, session
log 449–482): the same `devices` row, timeline, ledger, barcode and screens as phones.

### (a) The device model (`devices`, `modules/devices/models.py`) and which rows tablets / watches use

| Field | Phones | Tablets / watches today |
|---|---|---|
| `category` phone / tablet / watch (server default `phone`, migration `b7d2f4a9c1e3`) | ✓ | ✓ — **this is the device type** |
| `imei1` (identity, unique per shop), `imei2`, `serial` | IMEI required | IMEI only with a SIM; otherwise the serial number is the identity (stored in `imei1`, so search / history / uniqueness work unchanged) |
| `cellular` (Wi-Fi only vs Wi-Fi + SIM / GPS vs cellular) | — | ✓ (migration `e5a8c3d1f7b4`) |
| `size_mm` (watch case) | — | watches ✓ |
| `battery_health` % | — | used tablets / watches ✓ |
| `barcode`, `barcode_type`, `manufacturer_code` (ADR-036) | ✓ | ✓ |
| `brand_id`, `model_id` (catalogue `models.category`; 47 tablets + 33 watches seeded) | ✓ | ✓ |
| `storage_id`, `colour_id` | ✓ | tablets ✓ (watches: no storage) |
| `condition` box_pack / open_box / used / patched | ✓ | ✓ (patched is phones only) |
| `pta_status` pta_approved / non_pta / jv / unknown, `sim_time_months` | ✓ | only with a SIM (no JV for tablets / watches); Wi-Fi devices keep `unknown` |
| `warranty_months`, `warranty_start` (set at sale) | ✓ | ✓ |
| `patch_details`, `notes`, `photos` | ✓ | ✓ |
| `cost_price`, `asking_price`, `status`, `verification_status`, `cycle_no`, event projection | ✓ | ✓ |
| `device_accessory_items` kinds box / charger / cable / earphones / airpods / **stylus / keyboard / strap** / other | ✓ | ✓ |
| `device_events` (purchased, verified, sold, returns, loans, repairs, price_changed, note, barcode, label) | ✓ | ✓ |
| Screens: add-device chips Mobile / Tablet / Smart watch, connection chips, case size, battery health; stock filter `category`; sale chips; device page; labels (SIM / Wi-Fi / GPS, battery, PTA) | ✓ | ✓ |
| Reports: audit inventory `by_category`, products by category / brand | ✓ | ✓ |
| Exchange / trade-in (`exchanges` uses `DeviceLineIn` → any category) | ✓ | ✓ |

### (b) Accessories (Addendum 5, docs/25) used for tablets / watches

Counted watches (`category=watch`), bands / straps, chargers, covers, glass: `accessories` with the
product card (brand, fit, grade, colour, size, capacity, connector, warranty, units, price tiers…).
There is no serial on an accessory; a serialized unit is a device.

## 2. Gap table (target §A–F vs. what existed)

| Field / behaviour | Exists today? | Where | Action |
|---|---|---|---|
| Device type MOBILE / TABLET / SMARTWATCH | yes | `devices.category` + `models.category` (phone / tablet / watch) | **reuse** — no second `device_type` column; the API keeps the values `phone / tablet / watch` (labels Mobile / Tablet / Smart watch) |
| Brand, model | yes | `brand_id`, `model_id` | reuse |
| Model number | no | — | **add** `models.model_number` (global) + per-shop library `model_specs.model_number` |
| Colour | yes | `colour_id` | reuse |
| Condition / grade (New sealed / Open box / Used A / Used B / Refurbished / Copy) | partial | `condition` box_pack / open_box / used / patched | **add** `devices.grade` (a / b / refurbished / copy; list configurable in `shops.device_prefs.grades`) beside `condition`; box_pack = New sealed |
| Purchase price, asking price, sale price | yes | `cost_price`, `asking_price`, invoice line | reuse |
| Warranty period / starts at sale | yes | `warranty_months`, `warranty_start` | reuse |
| Warranty: who gives it | no | — | **add** `devices.warranty_by` (shop / supplier / brand) |
| Box / accessories included (box, charger, cable, strap, stylus, manual…) | partial | `device_accessory_items` kinds | **add** kinds `manual`, `wireless_charger`, `cover`, `keyboard` already there; reuse the picker |
| Notes, images, barcode | yes | `notes`, `photos`, `barcode` | reuse |
| Serial / IMEI, IMEI 2 only when cellular, unique | yes | identity rules in `DeviceIdentity` | reuse |
| PTA status only for SIM devices; badge on lists / sale / invoice | partial | enforced; shown on lists and labels, not on the invoice | **add** PTA, type, condition, storage / RAM, colour to the invoice line and print |
| "Factory unlocked" as a PTA value | no | — | **skip** as a PTA value (carrier lock is not PTA); kept as `lock_checks.carrier` |
| Lock status for used devices (activation / FRP / account / paired) + mandatory tick at purchase | no | — | **add** `devices.lock_checks` JSON, `lock_checked_at / by`, event `lock_checked`; required for used tablets / watches, for used phones when `device_prefs.require_lock_check` is on (default off so existing phone flows are unchanged); a device with a lock not cleared cannot be sold |
| Battery health %, battery mAh | partial | `battery_health` | reuse; mAh in `specs.battery_mah` |
| OS / version, chipset, expandable storage, Bluetooth, Wi-Fi, NFC, GPS, weight, year, display size / type / resolution / refresh | no | — | **add** `devices.specs` JSON (per unit) + `model_specs` (the shop's library, learned from every saved device, editable, CSV import) + `models.specs` (global defaults) |
| RAM as a variant | no | — | **add** `devices.ram_gb` (filterable column, like `storage_id`) |
| Tablet: SIM type, cameras, stylus support, keyboard / cover included, fingerprint / face, charging port, fast charge | no | — | `specs` keys (`sim_type`, `camera_front_mp`, `camera_rear_mp`, `stylus_support`, `unlock`, `port`, `fast_charge_w`); keyboard / cover / stylus included = accessory items |
| Watch: case material, band material / colour / size, compatible with, GPS, sensors, water rating, AOD, calling, battery life, watch OS | no | — | `specs` keys (`case_material`, `band_material`, `band_color`, `band_size`, `compatible_with`, `gps`, `sensors[]`, `water`, `aod`, `calling`, `battery_days`, `os`) |
| Paired-device lock check before purchase and sale | no | — | `lock_checks.paired` (watches), purchase rule + sale block |
| Purchase screen: type loads its fields, minimal required set, rest under "More details" | partial | chips + per-type fields exist | **add** "More details" block with the spec fields and lock checks |
| Autocomplete model library (specs fill from previous entries); CSV import | no | — | **add** `GET /devices/model-specs/{model_id}` (merged global + shop), learned on save, `PUT` to edit, `POST /devices/model-specs/import` (CSV) |
| Duplicate IMEI / serial check with history | yes | `GET /devices/lookup` (seen before, times bought, blocks an in-stock unit) | reuse; the chip now links to the unit's page |
| Barcode + label on save; label shows brand, model, storage / RAM, PTA, price | yes / partial | ADR-036 labels | **add** RAM to the label specs line |
| Timeline incl. PTA / lock checks as events | partial | `verified`, prices, sales… | **add** `lock_checked`, `reclassified` events |
| Customer / dealer per-device breakdown | yes | units / journey | reuse |
| Exchange / trade-in of a tablet or watch | yes | `exchanges` (`DeviceLineIn`) | reuse (tested) |
| Filters: type, brand, model, storage, RAM, colour, condition, PTA, price range, in stock / sold, age | partial | status, condition, PTA, brand, category, q | **add** `model_id`, `storage_id`, `colour_id`, `ram_gb`, `grade`, `price_min / max`, `age_min`, `lock_unchecked` |
| Reports: stock by type (count, cost, retail), slow movers, profit by type / brand, PTA vs non-PTA, used with unchecked lock | partial | audit inventory / products, stock ageing | **add** `GET /reports/stock-by-type` (+ unchecked-lock count); the rest reused |
| Migration: `device_type` default MOBILE | yes | `category` default `phone` | reuse |
| Reclassification tool (preview, then apply) preserving history / IMEI / barcode | no | — | **add** `POST /devices/reclassify/preview|apply` (change category / model of existing units; event `reclassified`; nothing else touched) and `POST /devices/from-item/{accessory_id}` (one counted watch → one serialized device: item qty −1 with a reason, device as opening stock at the item's cost, both sides note each other) |
| "Track by serial / IMEI" vs "Track by quantity" per product | partial | device vs accessory | the purchase screen already offers both paths (Add device → Smart watch / Tablet, Add accessory / watch); the conversion tool moves a unit from one to the other |
| Urdu / English labels | yes | en / ur / roman | add the new strings |

## 3. Design decision (§B) — chosen

**Extend the existing device model; no new tables for tablets or watches, no copied screens.**
`devices.category` already is the device type (phone / tablet / watch) with default `phone`, so
no `device_type` column is added (the brief's MOBILE / TABLET / SMARTWATCH are the labels of
those three values). Type-specific data goes in two places: columns for what is filtered or
enforced (`ram_gb`, `grade`, `warranty_by`, `lock_checks`), a `specs` JSON for the spec sheet
(the keys differ per type and change with every new model; a column per key would be dozens of
mostly-empty columns). The spec sheet is learned into a per-shop **model library**
(`model_specs`) so the next unit of the same model fills itself. The device page (`/stock/:id`,
already brand + model as its title) is the "Device Detail" for every type. Non-serialized
watches, bands and chargers stay accessories (Addendum 5). Why: one timeline, one ledger, one
barcode rule, one set of anti-fraud rules, and every existing report / export / e2e keeps working.

## 4. Migration plan (additive, reversible, idempotent)

Revision `b9c1d3e5f7a9_device_types` after `a8b0c2d4e6f8`:
1. `devices` + `grade`, `ram_gb`, `warranty_by`, `specs` (JSON), `lock_checks` (JSON),
   `lock_checked_at`, `lock_checked_by` (FK users) — all nullable; `category` stays as is.
2. `models` + `model_number`, `specs` (JSON) — nullable.
3. New table `model_specs` (`shop_id`, `model_id`, `model_number`, `specs`, `updated_at`,
   unique per shop + model).
4. `shops` + `device_prefs` (JSON: `grades`, `require_lock_check`).
5. No backfill needed (every existing device already has its category); the downgrade drops
   exactly what was added; every add is checked first, so a half-run can be resumed.

## 5. Status

Built and verified 2026-10-31 (docs/06 "Phase 10", session log). Open: a screen for the CSV import of the model library (the API exists); per-type GST is out of scope.

## 6. Assumptions (owner to confirm or change)
1. **Lock check is mandatory for used tablets and smart watches** on purchase (not for opening
   stock, which is stock already in the shop); for used **phones** it is a shop setting, off by
   default, so no existing phone flow or test changes. A device whose lock is `not_cleared`
   cannot be sold until its lock check is updated.
2. **Grade is separate from condition**: condition stays the owner's four words (box pack / open
   box / used / patched); grade adds A / B / refurbished / copy for used units. "New sealed" = box
   pack, "Copy-China" = grade copy.
3. **"Factory unlocked" is not a PTA status** (PTA is about DIRBS registration); it is recorded as
   a lock check (`carrier`). Wi-Fi-only devices keep PTA "not applicable" (`unknown`).
4. **RAM is a column, the rest of the spec sheet is JSON**; the shop's model library is filled
   from what the shop types, never overwritten by a global default.
5. **Reclassification** changes the unit's type (and optionally its model) and writes an event;
   IMEI / serial, barcode, timeline, invoices and balances are untouched. A counted item becomes
   one serialized unit at a time (the item's quantity goes down by one with a reason).
6. CSV import of the model library takes the columns `brand, model, category, model_number` plus
   any spec columns; unknown brands / models are created for the shop.
