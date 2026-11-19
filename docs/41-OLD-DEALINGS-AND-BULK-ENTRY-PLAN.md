# 41 · Old dealings and several pieces at once — plan and what was built (dealers and shopkeepers, 2026-11-19)

Two things shops and dealers asked on the day they started the software. Decision record: ADR-110.

## 1. What they asked

1. **"We bought the software today. Before today we already gave mobiles, tablets, laptops and
   accessories to shops and customers — Shop A took 5 Apple 17, 10 Samsung, 5 Realme; so much was
   paid, so much is still to come; sometimes we owe them. We do not remember those IMEIs. How does
   that go into the software? From today we will enter every IMEI."**
2. **"At a purchase every phone has to be registered one by one. When we take 5 Apple 17 from a
   dealer with the same cost, colour and details and only the IMEI differs, let us enter them
   together. The same for a sale."**

## 2. What existed

| Need | Found in the code |
|---|---|
| A balance carried over for a person | The server could post it (`POST /ledger/parties/{id}/opening-balance`: the person's khata against the owner's capital — no stock, no income) and the Excel import used it. **The app had no screen for it**, no way to say what the balance was made of, and no way to take a wrong one back. |
| Stock already in the shop on day one | "Old stock" (`/stock/opening`): a phone with its IMEI and cost, no purchase bill. Unchanged. |
| Several phones on one purchase bill | Yes, but each through the whole form. |
| Several phones on one sale bill | Yes: tapped or scanned one at a time, the price typed on each. |

## 3. Design

### 3.1 Old dealings — on the person's khata, without IMEIs

The phones of an old dealing left the shop before the software: they are not in today's stock and
their profit belongs to the past. What is true today is only **the money still open**. So an old
dealing is entered on the person's page ("Old balance"), in one of two ways:

- **Only the amount** still to get or to give.
- **What went**: lines of *what · pieces · rate*, plus what was already paid or received. The
  server adds the lines, takes off what was settled and posts **what is left**. The lines are kept
  in words on the khata entry ("Apple iPhone 17 × 5 @ 300,000 = 1,500,000 | … | Total … · Settled
  before … · Left …"), so the shop and the other side can see what the balance is made of.

Rules:
- Posted as the existing `opening_balance` entry: the person's khata against the owner's capital.
  **No device row, no stock, no sale, no profit.** The books stay balanced (tested).
- The total is the server's; the app's running total is only a preview.
- Owner and manager only (the permission the route already had).
- A wrong entry is **deleted with a reason**: a reversing entry, the wrong one kept and struck
  through, never twice.
- Money paid later against the old balance is ordinary "Money received / paid" on the khata.
- From today every phone is bought and sold with its IMEI as usual. If one of the old phones
  comes back, it is bought back like any phone from that person.

### 3.2 Several pieces of the same — purchase and old stock

In the add-device form a switch **"Several pieces of the same"**: the details (model, colour,
storage, condition, cost, asking price, accessories) are filled once; then each other piece's IMEI
is typed or scanned into a list (a hardware scanner adds one per scan). For a unit known by its
serial number (a laptop, a Wi-Fi tablet) the list takes serial numbers.

- On "Add" the line becomes **one line per piece** — each piece is still its own `devices` row
  with its own IMEI, barcode and history. Nothing about how a phone is stored changes; no server
  change was needed.
- A number already in the list, the same as the first piece, or already in the shop's stock is
  refused at once; the server checks every IMEI again when the bill is saved.
- IMEI 2 and an own barcode are not asked in this mode (they differ per piece): added later on the
  phone's page.
- The cost typed is per piece; the form shows pieces × cost.

### 3.3 Several of the same — sale

- **Pick several**: a switch on the list of phones turns taps into ticks; "Add n to the bill" puts
  them all on the bill together. With a scanner, each scan already adds a phone.
- **One price for all**: when the bill has two or more phones of one model, a bar "model × n —
  price each — Set for all n" puts the price on each of them; any single one can still be changed.
  Each phone stays its own bill line with its own IMEI and cost, so profit per phone is unchanged.

## 4. Not in this phase

- Old dealings from an Excel sheet with their lines (the import takes only the balance today).
- A printed "old balance confirmation" for the other side to sign.
- Pasting a whole column of IMEIs at once (they are added one by one, or by scanner).
- Several pieces in the exchange and trade-in forms.

## 5. Tests

`tests/test_old_dealings.py` (3), `e2e/old-dealings-bulk.spec.ts`. No migration.
