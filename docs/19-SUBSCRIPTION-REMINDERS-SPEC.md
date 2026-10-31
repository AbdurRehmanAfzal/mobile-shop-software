# 19 · Subscription plan expiry reminders — owner brief (verbatim, 2026-10-31)

> Pasted by the owner as "ADDENDUM 3". Kept word for word; the gap analysis, decisions and status
> live in `docs/20-SUBSCRIPTION-REMINDERS-PLAN.md`.

## ADDENDUM 3: Subscription plan expiry reminders (popup + top alert bar)

Context: Each shopkeeper uses this software on a paid plan. When the plan is about to end, the shopkeeper must be reminded clearly and politely to pay. If the plan is not renewed, the software will stop and their data is at risk. First check whether the codebase already has a plan/subscription/license concept (plan name, start date, end date, status). If not, add one with a migration. Reuse the existing i18n system and keep the existing English/Urdu support intact.

### A. Data model
- subscription: plan_name, start_date, end_date, status (ACTIVE / EXPIRING_SOON / GRACE / EXPIRED), grace_days (default 7, configurable), amount_due, currency (PKR), last_payment_date.
- subscription_payment_log: date, amount, method, reference/txn id, note, recorded_by (so renewals are traceable).
- reminder_state (per user/device): snoozed_until, last_shown_at, dismissed_today, times_snoozed.
- billing_settings (editable only by the software provider/super-admin, NOT by the shopkeeper): bank/payment details, support contact numbers, popup message templates, reminder schedule. Seed it with placeholder values and clearly mark them in the README so I can fill in my real details.

### B. Reminder schedule (do the planning yourself, use sensible defaults, make them configurable)
- 7 days before expiry: yellow info alert bar only, no popup.
- 3 days before expiry: orange alert bar + popup once per day (can be snoozed).
- 1 day before and on expiry day: red alert bar + popup (snooze limited to "remind me in a few hours").
- Grace period after expiry (default 7 days): software keeps working, red persistent bar, popup on every login, stronger warning.
- After grace ends: soft-lock (see section F). Data is NEVER deleted automatically.

### C. The popup (modal)
Must show in 3 languages together (English, Urdu in Nastaliq/RTL, Roman Urdu), in a clean layout, with a language-neutral look so it is readable for non-technical shopkeepers.
Contents:
1. Title + days remaining (e.g. "Your plan ends in 3 days" / "آپ کا پلان 3 دن میں ختم ہو رہا ہے" / "Aap ka plan 3 din mein khatam ho raha hai").
2. Plan name, expiry date, amount due.
3. Warning text (all 3 languages): if payment is not made, the software will stop working and there is a risk of losing your data. Please pay the fee on time to keep your data safe and the software running.
4. Payment details section: ALL my bank/payment details from billing_settings (bank name, account title, account number, IBAN, branch, plus JazzCash / Easypaisa / other wallets if configured). Each field has a "Copy" button. Show an optional QR code if configured. Also show a support contact with a WhatsApp click-to-chat link prefilled with the shop name and plan.
5. Buttons:
   - "Pay Fee Now / Fee Ada Karein / ابھی فیس ادا کریں" -> opens a payment screen with the bank details, instructions, and a form to submit proof of payment (amount, date, transaction ID, optional screenshot upload) which marks the subscription as "Payment Submitted – Pending Verification" and sends me a notification.
   - "Remind Me Later / Baad Mein Yaad Dilayen / بعد میں یاد دلائیں" -> opens a small choice: in 4 hours, tomorrow, in 3 days (only options that do not go past the expiry date; near expiry the options shrink as per section B).
   - "Close" (X) -> same as snooze for the current rule, never permanent.
6. The popup must NEVER be annoying:
   - Never show it in the middle of a sale, a payment entry, or while a form is being filled; show it only on login, on dashboard load, or when the user is idle on a list page.
   - Never more than once per snooze window; respect snoozed_until across page reloads and across devices of the same shop (store it server-side, not only in localStorage).
   - Auto-hide once the payment is submitted/verified.
   - The popup must not block printing of receipts or any ongoing transaction.

### D. Top alert bar (dashboard and all main pages)
- A slim bar fixed at the top, color-coded by urgency (yellow / orange / red), showing in the active UI language plus a short Roman Urdu line: "Plan khatam hone mein X din baqi hain. Software band ho sakta hai aur data lost hone ka khatra hai."
- Buttons on the bar: "Pay Now" (opens the payment screen) and "Details" (opens the popup).
- The bar is not dismissible permanently (it may be collapsed for the session only). It disappears automatically when the plan is renewed.
- After payment is submitted but not yet verified: show a calm blue bar "Payment received, verification pending".

### E. Renewal flow (provider side)
- A simple super-admin screen (or secured endpoint/CLI command if there is no admin panel) where I can: see all shops with plan status and expiry date, open pending payment proofs, mark payment as verified and extend end_date by the plan duration, record manual payments, and change the plan.
- On verification: update subscription, add a payment log row, clear reminders, and show the shopkeeper a "Thank you, your plan is renewed until <date>" message. Generate a renewal receipt (prefix SUB-0001).
- Since this software may run offline-first, support an offline-friendly renewal: a signed renewal key/code that I can send on WhatsApp which the shopkeeper pastes into the app to extend the plan (signature checked locally, tamper-proof, tied to the shop ID). If the app is always online, tell me and skip this part.

### F. After the grace period (data safety first)
- Soft-lock: the shopkeeper can still log in and VIEW data, EXPORT/backup everything (Excel/PDF/database backup), and open the payment screen, but cannot create new sales/purchases until renewed.
- Show a full-screen banner explaining this in 3 languages. Make sure data is never deleted and is restored to full access immediately after renewal.
- Also add an always-available "Backup my data" button in the popup/bar flow so the shopkeeper feels safe while paying.

### G. Technical requirements
- Compute status on the server using server time (not the device clock) wherever possible; if offline-first, also guard against clock tampering by storing last_seen_date and detecting a clock rolled back.
- All text in translation files (en, ur, ur-Latn "Roman Urdu"), no hardcoded strings. Urdu must render properly with RTL and the existing Nastaliq font.
- Billing settings must not be editable by shopkeeper roles. Salesman role should only see the bar/popup text, not the payment/admin screens.
- Respect the existing roles: Owner sees the full popup; Salesman sees only a short notice telling them to inform the owner.
- Audit log every reminder snooze, payment submission, verification, extension and lock/unlock event.

### H. Tests
- Status transitions by date (active -> expiring -> expired -> grace -> locked) with a mocked clock.
- Reminder schedule: popup frequency per stage, snooze respected after reload, popup not shown during an active sale form.
- Popup and bar render in all 3 languages without missing translation keys.
- Payment proof submission changes status to pending, verification extends end_date correctly, and the bar/popup disappear.
- Soft-lock blocks new transactions but still allows view, export and backup.
- Salesman cannot access billing settings or the admin renewal screen.
- No data is deleted at any stage.

At the end, list every assumption you made and every placeholder (bank details, support number, QR) that I must fill in myself.
