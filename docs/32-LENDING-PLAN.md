# 32 · Len-den — money given / taken with no bill (owner 2026-11-02)

## 1. Owner brief (verbatim, Roman Urdu)
> ak r shop keeper nay btaye hai k asa be hota hai k kuch customer k sath hamra wasay lain dain hota
> hai give and take wo hm say koe chez purchase nahi krtay wasay pasay hm nay kisi say liye hotay hn r
> kisi ko diye hotay hn , wo future m hm say koe chez lay skta hai r day be skta hai so is secnario ko
> be deal kr do is may properly r is ki statistics , reports in out sub kuch proper hona chye

In short: with some people the shop gives and takes money with no purchase or sale. Later the same
person may buy from the shop or sell to it. Handle this properly, with statistics, reports, in and out.

## 2. What existed (audit)
- A payment in / out to a person with no open bill already went into the person's khata (party
  ledger account), so the balance was right.
- **But**:
  - Every report called it bill money: cash & bank "Udhaar received" / "Paid to people", day report
    "Udhaar back" / "Paid out", overview "received / paid in period", udhaar movement "received / paid".
  - Nothing told "money lent" from "advance for a bill".
  - When the person later had an open bill, the money already given stayed "advance kept" on the
    payment and the bill stayed unpaid. There was no way to put it on the bill.
  - The person's screen showed only the whole balance.

## 3. Decision (ADR-041)
- **One khata.** Len-den is a payment with `purpose = 'lending'` (new column, default `'bill'` for
  every existing row, migration `e3a5c7e9f1b3`). It posts to the same party account as every bill,
  so a later sale / purchase nets automatically. There is no second balance.
- **Its own ledger document type `lending`** (reversal `reversal:lending`), so every ledger-based
  report can name it. Cash & bank reasons: `borrowed` (in) / `lent` (out). Day report: `lending`.
  Udhaar movement: `lent` / `borrowed`.
- **Never put on a bill when made.** A lending entry with allocations is refused (`lending_no_bills`);
  no FIFO auto-allocation.
- **Len-den still open** per person = Σ unallocated lending out − Σ unallocated lending in. Positive
  means the person owes the shop. It is a part of the khata; `bills = balance − lending`.
- **Adjust against bills** (`POST /payments/settle/{party_id}`), on demand from the person's screen:
  - Money they gave (advance or len-den in) goes on their open sale bills.
  - Money the shop gave (advance or len-den out) goes on the shop's open purchase bills to them.
  - Oldest first; advances before len-den.
  - Len-den given both ways counts only its net, so a repaid loan is never put on a bill.
  - The khata does not move; only the bills' paid / status change. Allocation lines are marked
    `settled: true`, and the action is an audit row (`party / settle`).
- Cancelling a lending entry is the usual payment void (a reversing posting, never a delete).

## 4. What was built
| Area | Change |
|---|---|
| `payments` | `PaymentPurpose`, `purpose` on create / out / list filter, `lending_balances`, `settle`, `party_lending`; routes `GET /payments/lending/{party_id}`, `POST /payments/settle/{party_id}` (TRANSACT, shop-scoped) |
| `shopaudit/lending.py` | `GET /shop-audit/lending`: lent / borrowed in the period vs the previous one, open now and on the as-of day (they owe us / we owe them, people), adjusted against bills, cancelled entries, by method, series, per person (open, whole khata, last date), entries |
| `shopaudit/finance.py` | cash reasons `borrowed` / `lent` |
| `shopaudit/parties.py` | udhaar movement `lent` / `borrowed`, per-row `lending`, totals `lending.receivable / payable` |
| `shopaudit/service.py` | overview debt: received / paid are bill money only; `lent_in_period` / `borrowed_in_period` |
| `shopaudit/report.py` | complete-report section `lending` (+ `lending_people`, detail `lending_entries`) |
| `reports/service.py` | day report reason `lending`; "udhaar received" no longer counts len-den |
| `units/service.py` | printed receipt titled "Len-den — money given / taken" |
| Frontend | `PartyLending` card on the person's page (open len-den, given / taken / from bills, two buttons, adjust card, entries), `PaymentForm lending`, audit screen `/audit/lending` (+ nav, report center section), udhaar "of which len-den" line and movement rows, day report labels, receipt print on len-den rows; strings en / ur / roman |

## 5. Assumptions (owner can change)
1. Len-den shares the person's khata, so a person's total is one number (the owner's "future me
   cheez lay sakta hai / day sakta hai").
2. Adjusting against bills is a button, not automatic at the counter, so the shopkeeper decides.
3. Any staff who may take payments may record len-den (TRANSACT); the report is owner / manager
   (REPORTS_ALL).
4. No interest, due dates or reminders for len-den (none were asked for).

## 6. Verification
- Backend `tests/test_lending.py` (3 tests):
  - Khata split; no auto-allocation; every report keeps it apart (cash, day report, overview,
    udhaar, len-den report); a normal payment is unchanged.
  - Net-only adjust with the bill status, the cash unchanged and reconcile still ok.
  - Rules, void, roles, shop isolation, report json / xlsx / pdf.
- Playwright `e2e/lending.spec.ts`: take / give from the person's screen, adjust against a later
  bill, the audit screen, the udhaar line.
