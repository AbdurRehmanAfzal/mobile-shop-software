# 04 — Data Model (v2)

Conventions: UUID primary keys · `shop_id` on every tenant table (via `ShopScoped` mixin) · `created_at`, `updated_at`, `created_by` · money `Numeric(14,2)` · soft delete only where listed · all enums are Python `StrEnum`s stored as strings.

## Tenancy and users
- **organisations**: id, name, plan (`trial|basic|pro|chain`), plan_expires_at, settings json.
- **shops**: id, organisation_id, name, name_ur, address, city, phone, whatsapp, logo_path, ntn, strn, tax_enabled, tax_rate, tax_inclusive, receipt_footer, receipt_footer_ur, invoice_prefix, next_invoice_no, timezone (`Asia/Karachi`), locale default (`ur`).
- **users**: id, organisation_id, name, phone (**globally unique**: login is by phone alone, no org picker), email, password_hash, pin_hash, role (`owner|manager|salesman|technician`), is_active, locale, last_login_at.
- **user_shops**: user_id, shop_id (assignment).
- **audit_log**: id, shop_id, user_id, entity, entity_id, action, before json, after json, at.

Permission matrix (enforced in `core/permissions.py`):
| Capability | owner | manager | salesman | technician |
|---|---|---|---|---|
| Sell / purchase / payments | ✓ | ✓ | ✓ | – |
| See cost price & profit | ✓ | ✓ | – | – |
| Void / reverse | ✓ | ✓ | – | – |
| Expenses | ✓ | ✓ | – | – |
| Repairs | ✓ | ✓ | ✓ (create) | ✓ (work) |
| Staff & settings | ✓ | – | – | – |
| Reports | ✓ | ✓ | own sales | own repairs |

## Master data
- **brands** (global, `shop_id` nullable): name, name_ur. **models**: brand_id, name, name_ur, shop_id nullable.
- **storages**, **colours**: name, name_ur, hex.
- **parties**: id, shop_id, name, name_ur, phone (unique per shop), alt_phone, whatsapp, cnic, address, city, photo_path, kinds json (`["customer","supplier","shop","technician"]`), notes, is_active. Balance is **computed** from ledger (materialised in `party_balances` view / cached column refreshed by the posting service).

## Devices
- **devices**: id, shop_id, imei1 (unique per shop), imei2, serial, brand_id, model_id, storage_id, colour_id, condition (`box_pack|open_box|used|patched`), pta_status (`pta_approved|non_pta|jv|unknown`), sim_time_months, warranty_months, warranty_start, **status** (`in_stock|on_loan|sold|in_repair|faulty|returned_to_supplier|with_customer_for_approval`), current_party_id, cost_price, asking_price, patch_details, notes, photos json, first_seen_at, cycle_no (how many times bought).
- **device_events** (append-only): id, shop_id, device_id, seq, type (see FR-DEV-04), party_id, amount, ledger_group_id, document_type, document_id, data json, user_id, at.
- **device_accessory_items**: device_id, kind (`box|charger|cable|earphones|airpods|other`), came_with (bool), condition, pending_from (`none|vendor|shop`), expected_at, delivered_at, given_at_sale (bool), promised_to_customer_at, notes.
- **verifications**: id, shop_id, device_id, purchase_id, seller_party_id, cnic_no, cnic_front_path, cnic_back_path, seller_photo_path, egadget_result (`clear|flagged|not_checked`), egadget_screenshot_path, pta_checked (bool), pta_result, declaration_signed (bool), declaration_path, checked_by, checked_at, notes.

## Documents
- **purchases**: id, shop_id, no, party_id, kind (`supplier|walk_in|shop|trade_in`), date, subtotal, discount, total, paid, payment_account, status, notes. **purchase_lines**: purchase_id, device_id | accessory_id, qty, unit_cost, line_total.
- **invoices** (sales): id, shop_id, no (gap-free per shop), party_id (nullable for cash walk-in), date, subtotal, discount, tax_rate, tax_amount, total, paid, payment_account, status (`open|paid|partially_paid|returned|void`), fbr_invoice_no, notes. **invoice_lines**: invoice_id, device_id | accessory_id, qty, unit_price, tax, line_total, trade_in_device_id (for exchanges).
- **loans**: id, shop_id, device_id, party_id, out_at, expected_back_at, settled_at, settlement (`returned|sold_to_party`), invoice_id.
- **payments**: id, shop_id, party_id, direction (`in|out`), amount, account (`cash|bank:<id>`), method (`cash|bank|easypaisa|jazzcash|card`), reference, allocations json [{document_type, id, amount}], date, notes.
- **expenses**: id, shop_id, category_id, amount, account, date, party_id (nullable, e.g. staff for salary), receipt_path, notes. **expense_categories**: shop_id nullable, name, name_ur.
- **cash_accounts**: id, shop_id, kind (`cash|bank|easypaisa|jazzcash`), name, opening_balance, opening_date. **day_closes**: shop_id, date, expected_cash, counted_cash, difference, closed_by.
- **repair_jobs**: id, shop_id, no, party_id, device_id (nullable), device_desc (brand/model/imei text for customer devices), fault_codes json, fault_text, received_accessories json, condition_photos json, estimate, advance, promised_at, technician_id, status, parts_total, labour, total, paid, warranty_days, delivered_at, outside_party_id, notes. **repair_parts**: job_id, accessory_id, qty, unit_cost. **repair_status_log**: job_id, from, to, user_id, at, note.
- **accessories**: id, shop_id, sku, name, name_ur, category, qty, cost, price, reorder_level. **accessory_movements**: accessory_id, qty_delta, reason (`purchase|sale|repair|adjust`), document ref.

## Ledger
- **ledger_groups**: id, shop_id, document_type, document_id, memo, posted_by, at, reverses_group_id (nullable).
- **ledger_entries**: id, group_id, shop_id, account (`cash|bank:<id>|party:<uuid>|sales|purchases|cogs|inventory|expense:<cat>|tax_payable|repair_income|discounts|other_income`), party_id, device_id, debit, credit, at.
Invariant: per group, Σdebit = Σcredit. Party balance = Σ(debit − credit) on `party:<id>` (positive = party owes shop).

Posting recipes (examples):
- Sale Rs. 50,000, paid 30,000 cash, tax 0: Dr party 50,000 / Cr sales 50,000; Dr cash 30,000 / Cr party 30,000; Dr cogs cost / Cr inventory cost.
- Purchase from walk-in Rs. 1,000 cash: Dr inventory 1,000 / Cr cash 1,000.
- Loan out: no ledger entries, only device event + loans row.
- Loan settled as sold to Shop B for 1,000, paid 500: as a sale to party Shop B.
- Sale return: reversing group of the sale (+ refund entry if cash returned).

## Notifications
- **message_templates**: shop_id nullable, key, channel, body_en, body_ur. **messages**: shop_id, party_id, channel (`whatsapp|sms|email`), template_key, payload json, status, provider_id, sent_at, error.

## Reports
Materialised per request from ledger + documents; no separate tables except `report_schedules` (shop_id, kind, cron, recipients).

## Sync (P2)
`sync_outbox` (shop_id, table, row_id, op, payload, seq) and `sync_cursor`. All tenant tables already have UUID ids and `updated_at`.
