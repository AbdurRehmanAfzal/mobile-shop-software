# 20 · Subscription reminders — gap analysis, decisions, status (addendum 3, 2026-10-31)

Spec: `docs/19-SUBSCRIPTION-REMINDERS-SPEC.md` (verbatim owner brief). ADR-035. Owner's setup checklist and manual-test table: `docs/21-OWNER-SETUP-CHECKLIST.md`.

## 1. What already existed (audit before building)

| Spec item | Found in the code | Verdict |
|---|---|---|
| Plan / subscription concept | `organisations.plan`, `plan_expires_at`, `monthly_fee`, `fee_note`; `admin/plans.py` (`days_left`, `status_of` unlimited/ok/due_soon/expired/locked, `assert_writable`, `set_plan` with extend-by-months, ADR-019) | reuse; add `plan_started_at`, `grace_days`, `plan_status_seen` |
| Payment log | `fee_payments` (amount, method, reference, proof, months, status pending/approved/rejected, created_by, handled_by/at), ADR-020 | reuse; add `paid_on`, `receipt_no` |
| Grace + soft-lock | 15 grace days then every non-GET refused (`plan_expired`) | keep the mechanism; grace defaults to **7**, configurable globally and per shop; paying / proof upload / reminders / backup stay allowed while locked |
| Owner notice | `PlanBanner` from 7 days before, owner only, locked notice for all | replaced by the colour-coded bar for every role |
| Provider screen | Super admin: shops with plan chips and filters, set plan / fee / expiry / +1 +3 +12 months, pending proofs approve / reject, payment accounts (wallets) | reuse; add billing settings, manual payments with receipts, renewal codes, per-shop grace |
| Billing details | `platform_settings.payment_accounts` (wallets) | reuse as the wallets list; add `platform_settings.billing` (bank, support, schedule, note, QR) |
| Reminder state, popup, trilingual texts, receipts, renewal codes, backup, clock guard, lock/unlock audit | none | built |

## 2. What was built

- **Backend `app/modules/plan/`**: `billing.py` (settings with placeholders, `for_shopkeeper` hides placeholder bank lines), `reminders.py` (stages none/info/warn/urgent/grace/locked, state ACTIVE/EXPIRING_SOON/GRACE/EXPIRED, popup decision, snooze options that never pass the expiry, server-side state per user, escalation voids an earlier snooze, lock/unlock audit), `renewal.py` (Ed25519 signed codes `MS1.<payload>.<sig>`, `keygen`), `clockguard.py` (high-water mark of the time seen, persisted hourly by the scheduler tick), `router.py` (`/api/v1/plan/reminder`, `/reminder/shown|snooze|thanks`, `/redeem`, `/receipts/{id}`, `/backup`), `models.py` (`plan_reminder_states`, `plan_renewal_codes`). `admin/fees.py`: `paid_on`, `receipt_no` (SUB-0001 … from `platform_settings.receipt_seq`), `notify_admin` (WhatsApp `fee_submitted_admin`), audit `verify` / `reject`, `record_manual`. Admin router: `GET/PUT /admin/billing`, `POST /admin/shops/{id}/payments`, `POST /admin/shops/{id}/renewal-code`, `grace_days` on the plan route. Soft-lock allowlist `LOCKED_ALLOW` in `plans.py`. Migration `e6f8a0b2c3d5`.
- **Frontend**: `lib/planReminder.ts` (store; form pages where the popup never opens), `components/PlanReminders.tsx` (`PlanBar`, `PlanOverlays` = popup + lock screen + thank-you; the popup shows en + ur + roman together), FeesPage (bank details, paid-on date, renewal code, backup, receipts), AdminPage (billing sheet, record payment, renewal code, per-shop grace). Strings `plan.bar.*`, `plan.pop.*`, `plan.lock.*`, `plan.thanks.*`, `fees.*`, `admin.*` in en / ur / roman.
- **Tests**: `tests/test_plan_reminders.py` (7: stages by date + lock/unlock audit, popup schedule + snooze + staff notice + 403s, billing settings provider-only + per-shop grace, proof → pending → verified with receipt + thanks + admin notice + manual payment, soft-lock views / exports / backs up / pays but cannot sell and nothing deleted, renewal code once and only for its shop, clock rolled back), `e2e/plan-reminders.spec.ts`.

## 3. Schedule (defaults; Super admin → Billing settings changes them)

| Days to expiry | Stage | Bar | Popup | Snooze choices |
|---|---|---|---|---|
| > 7 | none | — | — | — |
| ≤ 7 | info | yellow | no | — |
| ≤ 3 | warn | orange | once a day | 4 h · tomorrow · 3 days (never past the expiry) |
| ≤ 1 (and the day itself) | urgent | red | on login / every 4 h | 4 h |
| expired, within grace (7) | grace | red | on every login / every 4 h | 4 h · tomorrow |
| past grace | locked | dark red + full-screen notice | notice instead of popup | — |
| proof submitted, not verified | any | calm blue | no | — |

Moving to a more urgent stage shows the popup again even if it was snoozed in a calmer one. Close (X) = the stage's default snooze (tomorrow in warn, 4 h otherwise). Staff see the bar's short line only.

## 4. Assumptions (owner to confirm)

1. **Grace is 7 days now** (was 15). Shops already inside days 8–15 of a grace would lock; none exist in production yet (every shop opened before plans had no expiry).
2. The subscription *is* the organisation: one plan for all branches of an owner.
3. `amount_due` = the monthly fee × 1; the shopkeeper picks the months on the form. Currency PKR only.
4. "Payment Submitted – Pending Verification" = `fee_payments.status = pending`; the bar turns blue, the popup stops.
5. The popup shows all three languages at once — an explicit exception to the one-language rule, for this screen only.
6. Offline renewal codes are included because the one-PC Windows install exists (`LOCAL_MODE`). The SaaS server signs with `RENEWAL_PRIVATE_KEY`; every install verifies with `RENEWAL_PUBLIC_KEY`. The dev pair in `backend/.env` is for this PC only.
7. The clock guard keeps the latest time ever seen (memory + `platform_settings.last_seen` hourly); a clock set back more than 12 h is flagged in the popup and never shortens the countdown.
8. Backup = a zip of CSVs (stock, people, khata, sales, purchases, expenses, accessories) from the existing exports; the server never deletes data at any stage.
9. The provider is notified of a new proof on WhatsApp through the existing outbox (`ADMIN_WHATSAPP` or the first super user).
10. Receipt numbers `SUB-0001…` are global across shops (the provider's own numbering).

## 5. Placeholders the owner must fill (Super admin → Fees → Billing settings)

Bank name, account title, account number, IBAN, branch (all `PLACEHOLDER…` until changed and hidden from shopkeepers while they are), support phone and WhatsApp (`+92 300 0000000`), optional QR image, optional note per language; wallets under Accounts. On the VPS `.env`: `RENEWAL_PRIVATE_KEY` + `RENEWAL_PUBLIC_KEY` from `python -m app.modules.plan.renewal keygen` (the public key also goes into the Windows build's settings).

## 6. Deferred

Popup message templates editable by the provider (the texts live in the i18n files; the per-language *note* is editable), e-mail reminders, automatic WhatsApp reminders to the owner at each stage (the bar and popup are in-app; the existing night report could carry a line).
