# 22 · Automatic barcodes, label printing and scanning — owner brief (verbatim, 2026-10-31)

> Pasted by the owner as "ADDENDUM 4". Kept word for word; what already existed, the decisions and
> the status live in `docs/23-BARCODES-PLAN.md`.

## ADDENDUM 4: Automatic barcode generation, label printing, and scanning

### 0. First inspect what already exists
Before writing anything, search the codebase for any existing barcode/QR/label/IMEI-scan code, libraries, fields and print templates. Summarize what exists and REUSE or extend it instead of duplicating. Tell me what you found in the plan.

### A. Auto-generate a barcode on every stock purchase
- Whenever a purchase transaction adds stock (PURCHASE_FROM_CUSTOMER, PURCHASE_FROM_DEALER, and any exchange/trade-in that brings an item in), a barcode is generated AUTOMATICALLY and saved with the item in the same DB transaction. The user should not have to click anything.
- Items are of two kinds, handle both:
  1. Serialized items (mobiles, tablets, etc.): one unique barcode per physical unit, linked to its IMEI/serial (and second IMEI if dual SIM).
  2. Non-serialized items (chargers, covers, glass protectors, cables, etc.): one barcode per product/SKU, with quantity tracked. When quantity is bought, print N labels if the user asks.
- Barcode value must be unique, never reused, and never change after creation (so old printed labels keep working). A returned and re-sold mobile keeps the SAME barcode (it is the same physical unit); its history continues under that barcode.
- Default barcode value format (configurable): <shop prefix><zero-padded sequence>, e.g. "MS000123". Option to use the IMEI itself as the barcode value for mobiles. Option for the shopkeeper to type a custom barcode manually or to scan an existing manufacturer barcode (e.g. the barcode already on a charger or phone box) and use it instead of generating one. Enforce uniqueness across all items.

### B. Barcode types, chosen by the shopkeeper
Settings page "Barcode Settings":
- Default type: Code 128 (most common in mobile shops, handles letters and numbers, readable by every standard scanner).
- Also support: EAN-13 (for retail-style numeric codes, with correct check digit), Code 39, QR Code, and Data Matrix (optional). Warn the user if the chosen type cannot encode their value (e.g. EAN-13 needs exactly 12 digits + check digit).
- Setting applies to NEW barcodes; already generated barcodes keep their original type. Store barcode_type with each barcode.
- Settings for the shop prefix, starting number, whether to include shop name, price, model and IMEI as text on the label.

### C. Label design and printing
- Generate printable labels as PDF/HTML for common thermal label printers and sheets: 50x30 mm, 40x30 mm, 38x25 mm, 58 mm roll, and A4 sticker sheet. Label size is selectable and saved as default. Let me add custom sizes.
- Label content (configurable): barcode, human-readable code below it, brand + model, short IMEI/last 4 digits, optional sale/asking price (can be hidden), shop name.
- Required for reliable scanning: crisp vector or high-resolution rendering (no blur from scaling), proper quiet zones (blank margins) around the barcode, adequate bar height and module width, black on white. Make the barcode size adjustable and include a "Test print" button and a "Test scan" box where the user can scan the printed label and see if it reads correctly.
- Buttons: "Print label" right after saving a purchase, "Print all labels for this purchase", "Reprint label" from the mobile/product detail page. Every reprint is logged in the audit log (who, when, how many).
- Do not hardcode a specific printer, use browser print with proper CSS page sizes (@page) so it works with any installed printer driver.

### D. Scanner support (USB / Bluetooth hardware scanners)
- Standard barcode scanners behave like a keyboard: they type the code quickly and end with Enter. Make sure scanning works with them without any extra drivers: a global scan listener that distinguishes fast scanner input from normal typing (by key timing and the Enter/terminator), and that works even when no input field is focused on the main screens.
- Where scanning must work:
  1. Sale screen: scan -> mobile/product is added to the cart immediately with its asking price pre-filled (follows the asking-price rules from the previous addendum). Scanning a non-serialized item twice increases quantity.
  2. Search bar everywhere: scan -> opens that item's detail page with its full history.
  3. Purchase screen: scan manufacturer barcode/IMEI to fill the IMEI field quickly.
  4. Sale return and purchase return screens.
  5. Stock count / audit screen: scan items one by one to mark them as "found", then show missing and unexpected items.
- Lookup must match: our barcode, IMEI 1, IMEI 2, and manufacturer barcode. If nothing matches, show a clear message "Item not found" with an option to add it, and play a short error sound; play a short beep on success.
- Handle edge cases: scanned item already sold (show its status and offer to open its history or process a return), scanned item not in stock, duplicate barcode, leading/trailing whitespace or prefix/suffix characters some scanners add, and different keyboard layouts (the scanner may send numbers while the Urdu keyboard layout is active, make the listener independent of the layout).
- Optional: camera-based scanning on mobile/tablet through the browser (e.g. a JS barcode scanning library) for shops that have no hardware scanner.

### E. Integration with history
- Barcode is stored on the mobile record and shown on the Mobile Detail page, with a "Reprint label" button.
- Scanning a barcode on ANY screen can open the item's complete history timeline (the core feature of this software).
- Barcode creation and each reprint appear in the mobile's timeline and audit log.
- Backfill: write a migration/command to generate barcodes for all existing stock items that don't have one yet, without changing any existing barcodes.

### F. Tests
- Purchase of a mobile creates exactly one unique barcode in the same transaction; a failed purchase creates none (rollback).
- Re-sale after a return keeps the same barcode and history.
- Uniqueness is enforced, including custom/manual barcodes.
- Each barcode type: value validation, EAN-13 check digit, Code 128 encoding, and rendered output decodes back to the same value (round-trip test using a decoding library).
- Scanner listener: fast key sequence + Enter is treated as a scan; slow human typing is not; works with prefix/suffix characters.
- Lookup by barcode, IMEI 1, IMEI 2, manufacturer barcode; sold item and unknown item cases.
- Backfill command is idempotent.

At the end, list assumptions, the libraries you chose, and the label sizes you tested, and tell me exactly how to test with a real scanner.
