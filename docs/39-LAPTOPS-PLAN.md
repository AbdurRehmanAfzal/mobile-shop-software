# 39 · Laptops — research, plan and what was built (shopkeepers, 2026-11-18)

Shopkeepers who also trade laptops — new and used, retail and wholesale — asked for laptops in the
same software. The owner's brief: research first, then a plan, then build; a laptop is bought on
the purchase form like a mobile; only the shops that ask for it see it; common details first, the
rest optional; all brands and models, old, new and gaming, built in. Decision record: ADR-108.

## 1. Research: how laptops are traded in a Pakistani shop

- **Two trades in one shop.** New, sealed laptops from distributors (with the brand's warranty), and
  used ones — mostly business lines imported in lots (Dell Latitude, HP EliteBook / ProBook, Lenovo
  ThinkPad), plus MacBooks and gaming laptops. Used stock is graded (A / B) and sold with a short
  shop warranty.
- **How a laptop is named.** Not by storage and colour like a phone, but by: brand and model, then
  **processor and generation** ("Core i5 8th Gen"), **RAM**, **drive and its kind** ("256GB SSD"),
  **screen size**, and the **graphics card** when it has one. That one line is what is written on
  the sticker, the bill and in WhatsApp lists.
- **Identity.** No IMEI, no PTA, no SIM. Each unit has a **serial number / service tag** (Dell
  service tag 7 characters, Lenovo 8, HP 10, Apple 10–12). On old used units the sticker is
  sometimes gone (the BIOS still shows it).
- **What a buyer of a used one asks.** Battery backup / health (cycles on a MacBook), touch or
  x360, backlit keyboard, the charger, any BIOS password, an activation lock on a MacBook, a
  company lock (MDM / Computrace) on ex-company units.
- **Wholesale.** Several units on one bill to another shop at an agreed price each; the rest on that
  shop's khata.
- **The ID check of phones does not fit.** It is built on the IMEI (e-Gadget, PTA DIRBS); used
  laptops arrive in lots from dealers with no seller CNIC per unit.

## 2. What already existed and is reused

`devices` is already a serialized-unit model with a type (`devices.category`: phone / tablet /
watch, ADR-038): per-unit cost, an immutable timeline, a spec sheet (`specs` JSON + the shop's
model library that fills the next unit), RAM and storage columns, grade, battery health and cycles,
warranty, lock checks, barcode and sticker, purchases, sales, returns, exchange, amanat, repairs,
transfers, the ledger and every report. A serial-only unit (Wi-Fi tablet, GPS watch) is already
identified by its serial number. Modules per shop already exist (`admin/modules.py`).

## 3. Design chosen

**A laptop is a fourth device type** — `category = "laptop"` — not a new module with its own tables
or screens. One purchase form, one stock list, one sale, one ledger; every document and report
that works for a phone works for a laptop.

| Topic | Decision |
|---|---|
| Access | New module **`laptops`**, opt-in (never in a plan): the provider switches it on per shop (Super admin → the shop → Modules). Module price 0 = provider only; a price can be set later in Pricing so shops can add it themselves. |
| Shops without it | See nothing new: no Laptop type, no "Laptops" tab, laptop-only brands (Dell, HP …) not in any list, laptop models not in the model list, the stock-by-type report keeps its three rows. Adding a laptop is refused (`module_off`). |
| Module switched off later | Laptops already in stock stay visible and can be sold or returned; none can be added. |
| Identity | Serial number / service tag (stored in `imei1` like every serial-only unit, unique per shop). Sticker unreadable → left empty → the shop's own code `LAP…`, found by its barcode label. |
| Phone-only fields | Dropped on the server for a laptop: IMEI 2, PTA, SIM time, SIM type / lock, region code. |
| Common details (main form) | Type → serial → brand → model → **processor, generation, drive type, screen size, graphics card, gaming** → storage, RAM, colour → condition → battery health → cost, asking price. |
| More details (optional) | Graphics memory, second drive, touch, x360, backlit keyboard, battery backup hours, OS, resolution, panel, refresh rate, fingerprint / face, year, weight; grade, warranty by, model number, faults. |
| Columns vs JSON | No migration. RAM and storage are the existing columns (RAM limit raised to 256 GB); everything else is `specs` keys (`types.SPEC_KEYS`). |
| The naming line | `types.laptop_line` (server: bill, sticker) and `laptopLine` (app: stock list): "Core i5 8th Gen · 8GB · 256GB SSD · 14\" · RTX 3060 6GB". |
| Locks of a used laptop | BIOS password, activation lock (MacBook), company lock (MDM). Asked when the shop's "lock check for used" setting is on, as for phones — not forced, so the common entry stays short. A lock marked "not cleared" blocks the sale, as for every unit. |
| ID check | Not required for a laptop (never held back from sale). The seller is on the purchase bill. |
| Type change | A laptop is never reclassified to or from another type. |
| Catalogue | 15 laptop brands added (Dell, HP, Asus, Acer, MSI, Microsoft, Razer, Gigabyte, Toshiba, Fujitsu, Sony, LG, Chuwi, Panasonic, Framework); laptop models also under Apple, Lenovo, Samsung, Huawei, Honor, Xiaomi, Infinix, Tecno. **1,143 models**, 228 of them gaming (`seeds/laptops.py`); a gaming model ticks "Gaming" by itself. Storages 2TB and 4TB added. A shop adds a missing brand or model on the form, as for phones. |

## 4. What is not in this phase (owner to decide — also in docs/29)

1. **A wholesale price per laptop.** Today a wholesale sale is a normal bill to the other shop at
   the price typed (several laptops on one bill, the rest on their khata). A second, stored
   "wholesale price" per unit that fills itself for a wholesale customer needs one new column.
2. **ID check for a laptop bought from a walk-in person** (CNIC and photo, without e-Gadget).
3. **Laptops in the Excel import.**
4. **A price for the module** so shops can add it themselves from the fees page.
5. Counted laptop accessories (chargers, bags, RAM, SSDs) are ordinary items in Accessories already.

## 5. Status

Built 2026-11-18: backend rules, module, catalogue, bill and sticker line, the form, stock tab,
sale filter, strings and help in three languages, tests (`tests/test_laptops.py`,
`e2e/laptops.spec.ts`).
