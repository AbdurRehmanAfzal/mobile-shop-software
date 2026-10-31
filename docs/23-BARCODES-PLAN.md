# 23 · Barcodes, labels and scanning — what existed, what was built (addendum 4, 2026-10-31)

Spec: `docs/22-BARCODES-SPEC.md` (verbatim). ADR-036.

## 1. What already existed (found before writing anything)

| Area | Found | Reused as |
|---|---|---|
| Label printing | `backend/app/modules/labels` (ADR-024): server-rendered print page sized to the sticker (`@page`), roll sizes 38×25 · 50×25 · 50×30 · 60×40 · 70×40, A4 sheet, custom mm, field toggles, copies, secret cost code; `LabelSheet.tsx` on the phone page, stock multi-select, purchase done, items | the one label engine; it now prints the **stored barcode in its own type** instead of the IMEI, gained 40×30 and 58×40 (58 mm roll), the "IMEI last 4" field, QR layout, and logs every print |
| Barcode rendering | `python-barcode` (Code 128 SVG) | kept for Code 128 / EAN-13 / Code 39; `segno` added for QR; `zxing-cpp` (dev) decodes the rendered PNGs in tests |
| Camera scanning | `lib/scan.ts` + `ScanButton` (zxing-js / BarcodeDetector, live camera or photo, IMEI-only filter), used by `ImeiInput` and `SearchBox scan` | kept; photo scanning can now return **any** code (`scanPhoto(file, true)`, `onCode`) |
| IMEI lookup | `GET /devices/lookup`, `imei_lookup`, search by `q` on stock / sale / return | kept; the new `GET /barcodes/lookup` adds barcode, IMEI 2, SKU and maker's code |
| Fields | `devices.imei1/imei2/serial`, `accessories.sku` | kept; new `barcode`, `barcode_type`, `manufacturer_code` on both |
| Hardware scanner | nothing — a USB scanner only typed into whatever box had focus | new global keyboard-wedge listener |
| History | immutable `device_events` (ADR) | new neutral events `barcode_assigned` (backfill) and `label_printed`; purchase events carry the barcode |

## 2. What was built

- **Backend `app/modules/barcodes/`**: `codes.py` (types, EAN-13 check digit, validation reasons en/ur, SVG + PNG rendering with quiet zones), `service.py` (shop prefs, next value `prefix + zero-padded sequence` or the IMEI, custom / scanned values, uniqueness across phones and items including IMEIs and SKUs, `clean()` for scanner prefixes / Urdu digits, `lookup`, `backfill`, `stock_count`, `log_print`), `router.py` (`/api/v1/barcodes/settings` GET/PATCH owner, `/check`, `/lookup`, `/count`, `/backfill` owner, `/render/{type}`, `/test-label`), `backfill.py` CLI. `new_device` and `accessories.create` call `assign_*` in the same transaction; a bought-back phone keeps its code. Migration `f7a9b1c3d4e6`.
- **Frontend**: `lib/scanner.ts` (`WedgeDetector`: ≥4 chars, ≤60 ms between keys, Enter/Tab terminator, `e.code`-based characters so the Urdu layout does not matter, AIM prefix stripping; `useScan` stack; `beep`), `ScanListener` in the shell (default: lookup → open the phone / item, "Item not found · Add it"), scan handling on the sale screen (phone with asking price, item qty +1, sold phone → history / return), purchase line (IMEI 1 → IMEI 2 → maker's code; own barcode field), return screen, stock list, **Stock count** page (`/stock/count`, More tile), Settings → **Barcode settings** (type, prefix, start number, value mode, next value, Test print, Test scan box, backfill), barcode on the phone page and item rows. Strings `barcode.*`, `count.*`, `label.f.last4` en/ur/roman.
- **Tests**: `tests/test_barcodes.py` (14): one barcode per phone in the same transaction and none on a failed purchase; resale after return keeps it; custom / maker's codes and uniqueness incl. items and IMEIs; each type validates, renders and **decodes back** (zxing-cpp); settings (type, prefix, start only forward, IMEI mode, 403 for staff); lookup by barcode / IMEI 1 / IMEI 2 / SKU / maker's code with CR-LF, `]C1`, Urdu digits, sold and unknown, other shop, salesman without cost; stock count; backfill idempotent; label prints logged. `lib/scanner.test.ts` (6): fast burst = scan, slow typing = not, terminator, Tab, prefixes / layout, pause. `e2e/barcodes.spec.ts`.

## 3. Assumptions

1. The barcode value is `prefix + 6-digit sequence` (`MS000123`) by default; the prefix defaults to `MS` and is per shop; EAN-13 generated values are `digits-of-prefix (or 20) + sequence + check digit`.
2. "Never reused": the sequence only moves forward (the start number cannot go below the last used number); a custom code that is already in use — as a barcode, an IMEI or a SKU — is refused.
3. Non-serialised items get **one barcode per SKU** at creation (opening stock, purchase of a new item, items sheet); buying more of an existing SKU does not make a new code; N labels = the copies control.
4. Data Matrix is not offered (no maintained pure-Python encoder); QR covers the 2-D case. The settings say so.
5. Reprints are logged through the existing GET print page (one audit row per print with who / when / how many, a `label_printed` event per phone).
6. Camera scanning stays IMEI-first (box labels carry several codes); a photo can return any code where the caller asks (search boxes).
7. The scanner must be in its factory "keyboard + Enter suffix" mode (every common USB / Bluetooth scanner's default).

## 4. Libraries

`python-barcode` 0.16 (Code 128 / EAN-13 / Code 39, SVG + PNG), `segno` 1.6 (QR, SVG + PNG), `zxing-cpp` 3.1 (tests only: decodes the PNGs), `Pillow` (already present), `@zxing/browser` + `BarcodeDetector` (already present, camera).

## 5. Label sizes tested

50×30, 40×30, 38×25, 58×40 (58 mm roll) and A4 sheet (38.1×21.2 grid) by test (`@page` sizes and content), plus 50×25, 60×40, 70×40 and custom mm from ADR-024. Bars: module 0.25 mm at 100 % width, 8 mm high, 2.5 mm quiet zones; QR with a 2-module border.

## 6. How to test with a real scanner

1. Plug the USB scanner in (or pair the Bluetooth one); no driver. Scan any barcode into Notepad: it must type the code and press Enter. If it does not add Enter, scan the "add CR suffix" code from the scanner's manual.
2. In the app: More → Settings → **Barcode settings** → **Test print** → print on the label printer (choose the label size in the print dialog = the page size).
3. Scan the printed label into the **Test scan** box on the same card: it shows "Read: <phone or item>".
4. Home: scan the label → the phone's page opens. Sale → scan → the phone is on the bill with its asking price; scan an accessory twice → qty 2. Return → scan a sold phone → its bill opens. Stock count → scan everything → Check.
5. Urdu keyboard layout active: scan again — the listener reads the physical keys, so it still works.
6. Old stock: Settings → **Barcodes for old stock** (or `python -m app.modules.barcodes.backfill` on the server) once; then print labels from the stock list (multi-select → labels).
