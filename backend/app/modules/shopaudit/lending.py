"""Len-den report (docs/32): money lent to / borrowed from people with no bill — what moved in the
period (given, taken, in cash or bank), what is still open today per person and in total, what was
later adjusted against bills, a series and the entries.

Read-only, from `payments` with purpose `lending`. Len-den sits in the person's one khata, so the
open figure here is a part of the receivable / payable on the udhaar screen, never added to it."""

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.periods import Period
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.payments.lending_due import due_rows
from app.modules.payments.models import Payment, PaymentPurpose
from app.modules.payments.service import lending_balances
from app.modules.shopaudit.finance import bucket_of, buckets, granularity


def _sum(rows, direction: str) -> Decimal:
    return money(sum((r.amount for r in rows if r.direction == direction), ZERO))


def lending(db: Session, shop_id: uuid.UUID, p: Period, *, limit: int = 50) -> dict:
    base = select(Payment).where(
        Payment.shop_id == shop_id,
        Payment.purpose == PaymentPurpose.LENDING,
        Payment.status == "posted",
    )
    cur = db.scalars(
        base.where(Payment.date >= p.date_from, Payment.date <= p.date_to).order_by(
            Payment.date.desc(), Payment.created_at.desc()
        )
    ).all()
    prev = db.scalars(base.where(Payment.date >= p.prev_from, Payment.date <= p.prev_to)).all()
    every = db.scalars(base).all()
    voided = db.scalars(
        select(Payment).where(
            Payment.shop_id == shop_id,
            Payment.purpose == PaymentPurpose.LENDING,
            Payment.status == "voided",
            Payment.date >= p.date_from,
            Payment.date <= p.date_to,
        )
    ).all()

    open_now = lending_balances(db, shop_id)
    open_as_of = lending_balances(db, shop_id, until=p.as_of)
    adjusted = money(
        sum(
            (money(a["amount"]) for x in every for a in (x.allocations or []) if a.get("settled")),
            ZERO,
        )
    )

    ids = {x.party_id for x in every} | set(open_now)
    parties = (
        {x.id: x for x in db.scalars(select(Party).where(Party.id.in_(ids))).all()} if ids else {}
    )
    per: dict = defaultdict(
        lambda: {"lent": ZERO, "borrowed": ZERO, "entries": 0, "last_date": None}
    )
    for x in cur:
        r = per[x.party_id]
        r["lent" if x.direction == "out" else "borrowed"] = money(
            r["lent" if x.direction == "out" else "borrowed"] + x.amount
        )
        r["entries"] += 1
    last: dict = {}
    for x in every:
        if x.party_id not in last or x.date > last[x.party_id]:
            last[x.party_id] = x.date
    people = []
    for pid in set(per) | set(open_now):
        party = parties.get(pid)
        r = per[pid]
        people.append(
            {
                "party_id": pid,
                "name": party.name if party else None,
                "phone": party.phone if party else None,
                "lent": r["lent"],
                "borrowed": r["borrowed"],
                "entries": r["entries"],
                "open": open_now.get(pid, ZERO),
                "khata": money(party.balance) if party else ZERO,
                "last_date": last.get(pid),
            }
        )
    people.sort(key=lambda r: (-abs(r["open"]), -(r["lent"] + r["borrowed"]), r["name"] or ""))

    g = granularity(p)
    series: dict = defaultdict(lambda: {"lent": ZERO, "borrowed": ZERO})
    for x in cur:
        s = series[bucket_of(x.date, g)]
        k = "lent" if x.direction == "out" else "borrowed"
        s[k] = money(s[k] + x.amount)

    def side(values, sign) -> dict:
        v = [abs(b) for b in values if (b > ZERO if sign > 0 else b < ZERO)]
        return {"amount": money(sum(v, ZERO)), "people": len(v)}

    lent, borrowed = _sum(cur, "out"), _sum(cur, "in")
    prev_lent, prev_borrowed = _sum(prev, "out"), _sum(prev, "in")
    return {
        "period": p.as_dict(),
        "granularity": g,
        "totals": {
            "lent": lent,
            "borrowed": borrowed,
            "net": money(lent - borrowed),
            "lent_count": sum(1 for x in cur if x.direction == "out"),
            "borrowed_count": sum(1 for x in cur if x.direction == "in"),
            "previous_lent": prev_lent,
            "previous_borrowed": prev_borrowed,
            "voided": len(voided),
            "adjusted_on_bills": adjusted,
        },
        # still open: they owe the shop / the shop owes them (today and on the as-of day)
        "owed_to_shop": side(open_now.values(), +1),
        "shop_owes": side(open_now.values(), -1),
        "as_of": {
            "owed_to_shop": side(open_as_of.values(), +1),
            "shop_owes": side(open_as_of.values(), -1),
        },
        "by_method": [
            {
                "method": m,
                "lent": money(
                    sum((x.amount for x in cur if x.method == m and x.direction == "out"), ZERO)
                ),
                "borrowed": money(
                    sum((x.amount for x in cur if x.method == m and x.direction == "in"), ZERO)
                ),
            }
            for m in sorted({x.method for x in cur})
        ],
        "series": [
            {"bucket": b, "lent": series[b]["lent"], "borrowed": series[b]["borrowed"]}
            for b in buckets(p)
        ],
        # return dates (docs/32 §7): late first, today, soon, later
        "due": due_rows(db, shop_id),
        "people": people[:limit],
        "people_total": len(people),
        "entries": [
            {
                "id": x.id,
                "no": x.no,
                "party_id": x.party_id,
                "party_name": parties[x.party_id].name if x.party_id in parties else None,
                "direction": x.direction,
                "amount": x.amount,
                "method": x.method,
                "date": x.date,
                "notes": x.notes,
                "by": user_name(db, x.created_by),
            }
            for x in cur[:limit]
        ],
        "notes": [
            "Len-den is money lent to or borrowed from a person with no bill. It is in the person's khata, so the open amounts here are a part of the udhaar receivable / payable, not extra.",
            "Money later adjusted against the person's bills is no longer open len-den.",
        ],
    }
