# 34 · Repair labs and the repair sticker (owner 2026-11-03)

## 1. Owner brief (verbatim, Roman Urdu)
> shop keeper ak r chez mention kr rhay thay k is ko be ap implement karo apnay software may k hm nay
> mobile market may kafi banday say repair krtay hn so hm apnay mrzi say repair lab ye repairing person
> select kr k ous ko assing kr sktay hn k hm nay ye mobile ous repairing walay ko send kiye hai because
> market may kafi repairing walay ho hm . r in ki be history maintain krnia hai , repairing lab k
> complete record hamray pas hona chye r shop audit may be add kr diye ga r reparing module may be .
> r shop keeper nay ye be mention kia tha k jb hm kis customer say reparing k liye mobile lytay hn tu
> hm ak stick print kr k ous k mobile pr lagay hn jis may ous mobile ki complete detail hotai hai kon
> sa mobile hai , kia problem hai sub kuch r ye ho k sticker print krnay say phlay option ho k kon si
> field sticker may add krni hai . is pr ak proper research kr k is ko implement karo r live kr do ,
> push be khud he kr dyna hai .

In short:
- Shops get repairs done by many people in the market. They want to pick a repair lab / technician,
  assign the phone to it, and keep the history and a complete record of every lab, in the repairs
  module and in the shop audit.
- When a customer's phone comes in, they want to print a sticker with its full details, choosing the
  fields before printing.
- Research it, build it, make it live and push it.

## 2. Research
- Repair-shop software (RepairDesk, RepairShopr and similar) tracks in-house tickets well:
  - ticket id, customer, device, IMEI / serial, issue, due date, assignee;
  - overdue tickets highlighted.
- None documents a dedicated outsourced-lab record (vendor, sent / back dates, vendor cost, result).
  So this design follows how Pakistani markets work: a phone may go to one lab, come back unfixed,
  and go to a second one.
- Ticket labels usually carry the ticket number, customer, device model and issue; the barcode is
  the ticket number.
- The device passcode stays in the ticket and is not printed: a sticker is seen by anyone.

## 3. What existed
- **Repair jobs:** statuses, parts, labour, bill, advance, job sheet.
- **Outside technician:** one "outside technician" field (`outside_party_id`) and one
  `outside_cost`.
  - The cost was posted only for the shop's own stock phones.
  - On a customer's phone it was never booked: repair profit was overstated and the technician's
    khata never showed it.
- **Not there:** no history of trips, no lab record, no repair sticker, and the repairs were not in
  the audit.

## 4. Decision (ADR-044)
- **A lab is a party of kind `technician`** (it already existed). It gets a khata, payments and a
  statement for free.
- **`repair_dispatches`**, one row per trip (migration `a5c7e9b1d3f6`).
  - Sent: lab, what to do, the lab's quote, expected back.
  - Back: fixed / not fixed, the lab's charge, paid on the spot.
  - Or cancelled, with a reason.
  - At most one trip open per job.
- **Booking the charge, when the phone comes back:**
  - customer's phone → `cogs` (a cost of the repair);
  - shop's own phone → `inventory` + the phone's cost;
  - either way the lab's party account is credited, less what was paid now.
  - Delivery no longer books an outside cost a second time.
  - The job's `outside_cost` is the sum of the trips.
- **Status:** sending moves the job to `in_progress`. Back fixed moves it to `repaired` and sends
  the customer the usual "ready" message. Every step is a status-log line, an audit row, and (for
  the shop's own phone) a `note` device event.
- **Repair sticker:** `GET /labels/repairs?ids=…&fields=…&size=…&copies=…`.
  - 16 fields to pick (shop, job no., barcode, customer, mobile, phone model, IMEI, problem, came
    with, date in, ready by, estimate, advance, left to pay, lab, note).
  - The barcode is the job number; scanning it opens the job (`barcodes/lookup` → `repair`).
  - The screen lock is never printed.
  - The last choice is remembered on the device.
- **Audit:** `/shop-audit/repairs`, the complete-report sections `repairs` + `repair_labs`, and the
  screen `/audit/repairs`. Money figures need VIEW_COST.

## 5. Screens
- **Repairs list:** a "Repair labs" entry; each job shows "At lab: <name>" (red when late).
- **Repair job:**
  - "Send to a lab" (pick the lab, what to do, quote, expected back);
  - the card while the phone is at the lab (call the lab, days, late) with "Back from lab"
    (fixed / not fixed, charge, paid now, the rest to its khata) and "Cancel trip";
  - "Lab trips" history;
  - "Print sticker" (fields, size, copies).
- **`/repairs/labs`:** every lab with sent, at lab, fixed %, what the shop owes; "Add a lab".
- **`/repairs/labs/:id`:** what the shop owes, 9 figures (sent, at lab, late, fixed, not fixed,
  fixed %, average days, charges, paid on the spot), every phone with its dates and charge.
- **Audit → Repairs:**
  - counts: taken in, given back, could not fix, open, ready, late, at a lab, late at a lab;
  - money: income, parts, lab charges, profit, lab charges on own phones, average bill;
  - a series, the labs, "needs a look now", and the most common problems.
- Every new field, card and tab has its "?" with an example (docs/33).

## 6. Assumptions (owner can change)
1. A lab's charge is booked when the phone comes back, not when it is sent (the quote is only for
   the record).
2. Sending is repair work: owner, manager, salesman and technician may do it. Booking the charge on
   the way back needs the repair-create permission. The audit is owner / manager.
3. The sticker is a separate print from the job sheet (the customer's slip); both stay.

## 7. Verification
- Backend `tests/test_repair_labs.py` (3 tests):
  - Two labs: rules, one trip at a time, not fixed then fixed, khata balances, history, cancel,
    labs list and record, profit after delivery, audit and report, reconcile.
  - Own phone: the charge goes on the phone's cost once; device events.
  - Sticker default / picked fields / Urdu, scan, shop isolation, roles.
- Playwright `e2e/repair-labs.spec.ts`: send, back with charge, trip history, sticker sheet, labs
  list, lab record, audit.
