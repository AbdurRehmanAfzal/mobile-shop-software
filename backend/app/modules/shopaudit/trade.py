"""Sales and purchase reports (docs/31 R2 / R3): the bills of a period with how they were paid —
at the counter or on credit, fully / partly / not yet — per employee, per person, as a series and
as a list that opens each bill.

Read-only, from the documents and their own ledger postings. "At the counter" is the money that
moved on a cash / bank / wallet account inside the bill's own posting; "paid" and "due" are the
bill's figures today (later payments are allocated to bills without a date of their own)."""

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.periods import Period
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.ledger.models import LedgerEntry
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.returns.models import ReturnDoc
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus
from app.modules.shopaudit.finance import bucket_of, buckets, granularity

PAY_STATUSES = ("paid", "partial", "unpaid", "returned")


def _counter_cash(db: Session, shop_id: uuid.UUID, group_ids: list, side: str) -> dict:
    """per posting: money in (`debit`) or out (`credit`) on cash accounts inside that posting"""
    ids = [g for g in group_ids if g is not None]
    if not ids:
        return {}
    col = LedgerEntry.debit if side == "in" else LedgerEntry.credit
    out: dict = {}
    for i in range(0, len(ids), 500):
        out.update(
            {
                g: money(v)
                for g, v in db.execute(
                    select(LedgerEntry.group_id, func.coalesce(func.sum(col), 0))
                    .where(
                        LedgerEntry.shop_id == shop_id,
                        LedgerEntry.group_id.in_(ids[i : i + 500]),
                        LedgerEntry.cash_account_id.is_not(None),
                    )
                    .group_by(LedgerEntry.group_id)
                ).all()
            }
        )
    return out


def _users(db: Session):
    """user id -> name, looked up once per report"""
    seen: dict = {}

    def name(u):
        if u not in seen:
            seen[u] = user_name(db, u)
        return seen[u]

    return name


def _names(db: Session, ids) -> dict:
    ids = [i for i in set(ids) if i is not None]
    if not ids:
        return {}
    return {
        r.id: (r.name, r.phone)
        for r in db.execute(select(Party.id, Party.name, Party.phone).where(Party.id.in_(ids)))
    }


def _pay_status(total: Decimal, paid: Decimal, returned: Decimal, doc_status: str) -> str:
    if doc_status == InvoiceStatus.RETURNED:
        return "returned"
    due = total - paid - returned
    if due <= ZERO:
        return "paid"
    return "partial" if paid > ZERO else "unpaid"


def _pct(part: Decimal, whole: Decimal) -> float | None:
    return round(float(part / whole * 100), 1) if whole else None


def _change(now: Decimal, before: Decimal) -> float | None:
    return round(float((now - before) / before * 100), 1) if before else None


# ---- sales -----------------------------------------------------------------------------------------


def _sale_bills(db: Session, shop_id: uuid.UUID, d_from, d_to, user_id, party_id):
    q = select(Invoice).where(
        Invoice.shop_id == shop_id,
        Invoice.date >= d_from,
        Invoice.date <= d_to,
        Invoice.status != InvoiceStatus.VOID,
    )
    if user_id is not None:
        q = q.where(Invoice.created_by == user_id)
    if party_id is not None:
        q = q.where(Invoice.party_id == party_id)
    return db.scalars(q.order_by(Invoice.date.desc(), Invoice.no.desc())).all()


def sales(
    db: Session,
    shop_id: uuid.UUID,
    p: Period,
    *,
    can_cost: bool,
    user_id: uuid.UUID | None = None,
    party_id: uuid.UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = 100,
) -> dict:
    bills = _sale_bills(db, shop_id, p.date_from, p.date_to, user_id, party_id)
    prev = _sale_bills(db, shop_id, p.prev_from, p.prev_to, user_id, party_id)
    counter = _counter_cash(db, shop_id, [b.ledger_group_id for b in bills], "in")
    # kept lines (not returned): units, the line money, the cost — the same reading /products uses
    lines: dict = defaultdict(lambda: {"units": 0, "revenue": ZERO, "cost": ZERO})
    ids = [b.id for b in bills]
    for i in range(0, len(ids), 500):
        for inv_id, qty, rev, cost in db.execute(
            select(
                InvoiceLine.invoice_id,
                func.coalesce(func.sum(InvoiceLine.qty), 0),
                func.coalesce(func.sum(InvoiceLine.line_total), 0),
                func.coalesce(func.sum(InvoiceLine.cost), 0),
            )
            .where(InvoiceLine.invoice_id.in_(ids[i : i + 500]), InvoiceLine.returned_at.is_(None))
            .group_by(InvoiceLine.invoice_id)
        ).all():
            lines[inv_id] = {"units": int(qty), "revenue": money(rev), "cost": money(cost)}
    names = _names(db, [b.party_id for b in bills])
    uname = _users(db)

    def blank() -> dict:
        return {
            "bills": 0,
            "units": 0,
            "billed": ZERO,
            "discount": ZERO,
            "tax": ZERO,
            "returned": ZERO,
            "at_counter": ZERO,
            "on_credit": ZERO,
            "paid": ZERO,
            "due": ZERO,
            "revenue": ZERO,
            "cost": ZERO,
        }

    def add(a: dict, r: dict) -> None:
        a["bills"] += 1
        a["units"] += r["units"]
        for k in (
            "billed",
            "discount",
            "tax",
            "returned",
            "at_counter",
            "on_credit",
            "paid",
            "due",
            "revenue",
            "cost",
        ):
            a[k] = money(a[k] + r[k])

    rows = []
    for b in bills:
        ln = lines.get(b.id, {"units": 0, "revenue": ZERO, "cost": ZERO})
        at_counter = min(counter.get(b.ledger_group_id, ZERO), b.total)
        due = max(money(b.total - b.paid - b.returned_total), ZERO)
        st = _pay_status(b.total, b.paid, b.returned_total, b.status)
        rows.append(
            {
                "id": b.id,
                "no": b.no,
                "date": b.date,
                "party_id": b.party_id,
                "party_name": names.get(b.party_id, (None, None))[0],
                "user_id": b.created_by,
                "units": ln["units"],
                "billed": b.total,
                "discount": b.discount,
                "tax": b.tax_amount,
                "returned": b.returned_total,
                "at_counter": at_counter,
                "on_credit": money(b.total - at_counter),
                "paid": b.paid,
                "due": due,
                "pay_status": st,
                "revenue": ln["revenue"],
                "cost": ln["cost"],
                "due_date": b.due_date,
            }
        )
    if status in PAY_STATUSES:
        rows = [r for r in rows if r["pay_status"] == status]

    totals = blank()
    by_status = {s: {"status": s, "count": 0, "amount": ZERO, "due": ZERO} for s in PAY_STATUSES}
    by_user: dict = defaultdict(blank)
    by_party: dict = defaultdict(blank)
    g = granularity(p)
    series: dict = defaultdict(blank)
    cash_bills = credit_bills = 0
    for r in rows:
        add(totals, r)
        add(by_user[r["user_id"]], r)
        add(by_party[r["party_id"]], r)
        add(series[bucket_of(r["date"], g)], r)
        s = by_status[r["pay_status"]]
        s["count"] += 1
        s["amount"] = money(s["amount"] + r["billed"])
        s["due"] = money(s["due"] + r["due"])
        if r["on_credit"] > ZERO:
            credit_bills += 1
        else:
            cash_bills += 1

    def profit_of(a: dict) -> dict:
        prof = money(a["revenue"] - a["cost"])
        return {
            "cost": a["cost"] if can_cost else None,
            "profit": prof if can_cost else None,
            "margin_pct": _pct(prof, a["revenue"]) if can_cost else None,
        }

    def shape(a: dict) -> dict:
        return {
            **{k: v for k, v in a.items() if k != "cost"},
            **profit_of(a),
            "avg_bill": money(a["billed"] / a["bills"]) if a["bills"] else ZERO,
        }

    # returns handled per employee in the period (the return documents, any bill date)
    ret_q = select(
        ReturnDoc.created_by, func.count(ReturnDoc.id), func.sum(ReturnDoc.amount)
    ).where(
        ReturnDoc.shop_id == shop_id,
        ReturnDoc.kind == "sale",
        ReturnDoc.date >= p.date_from,
        ReturnDoc.date <= p.date_to,
    )
    if user_id is not None:
        ret_q = ret_q.where(ReturnDoc.created_by == user_id)
    if party_id is not None:
        ret_q = ret_q.where(ReturnDoc.party_id == party_id)
    returns_by_user = {
        u: (int(n), money(a or 0)) for u, n, a in db.execute(ret_q.group_by(ReturnDoc.created_by))
    }
    users = []
    for u in set(by_user) | set(returns_by_user):
        a = by_user.get(u) or blank()
        n, amt = returns_by_user.get(u, (0, ZERO))
        users.append(
            {
                "user_id": u,
                "user_name": uname(u),
                **shape(a),
                "returns": n,
                "returns_amount": amt,
            }
        )
    users.sort(key=lambda x: -x["billed"])
    parties_ = [
        {
            "party_id": k,
            "name": names.get(k, (None, None))[0],
            "phone": names.get(k, (None, None))[1],
            **shape(a),
        }
        for k, a in by_party.items()
    ]
    parties_.sort(key=lambda x: -x["billed"])
    prev_billed = money(sum((b.total for b in prev), ZERO))

    text = (q or "").strip().lower()
    listed = [
        r
        for r in rows
        if not text or text in r["no"].lower() or text in (r["party_name"] or "").lower()
    ]
    return {
        "period": p.as_dict(),
        "granularity": g,
        "filters": {"user_id": user_id, "party_id": party_id, "status": status, "q": q},
        "totals": {
            **shape(totals),
            "cash_bills": cash_bills,
            "credit_bills": credit_bills,
            "previous_bills": len(prev),
            "previous_billed": prev_billed,
            "change_pct": _change(totals["billed"], prev_billed),
        },
        "by_status": list(by_status.values()),
        "series": [
            {
                "bucket": b,
                "bills": series[b]["bills"],
                "billed": series[b]["billed"],
                "at_counter": series[b]["at_counter"],
                "on_credit": series[b]["on_credit"],
                "profit": money(series[b]["revenue"] - series[b]["cost"]) if can_cost else None,
            }
            for b in buckets(p)
        ],
        "by_user": users,
        "by_party": parties_[:20],
        "rows": [
            {
                **{k: v for k, v in r.items() if k not in ("revenue", "cost")},
                "user_name": uname(r["user_id"]),
                "profit": money(r["revenue"] - r["cost"]) if can_cost else None,
            }
            for r in listed[: max(1, min(limit, 500))]
        ],
        "rows_total": len(listed),
        "notes": [
            (
                "Billed = what the bills say, tax included; profit = the kept lines less their cost "
                "(the same reading as Products)."
            ),
            (
                "At the counter = money into cash / bank / wallet inside the bill itself; on credit = "
                "the rest of the bill on that day."
            ),
            "Paid, due and the payment status are today's figures for each bill.",
        ],
    }


# ---- purchases ----------------------------------------------------------------------------------


def _purchase_bills(db: Session, shop_id: uuid.UUID, d_from, d_to, user_id, party_id):
    q = select(Purchase).where(
        Purchase.shop_id == shop_id,
        Purchase.date >= d_from,
        Purchase.date <= d_to,
        Purchase.status == PurchaseStatus.POSTED,
    )
    if user_id is not None:
        q = q.where(Purchase.created_by == user_id)
    if party_id is not None:
        q = q.where(Purchase.party_id == party_id)
    return db.scalars(q.order_by(Purchase.date.desc(), Purchase.no.desc())).all()


def purchases(
    db: Session,
    shop_id: uuid.UUID,
    p: Period,
    *,
    user_id: uuid.UUID | None = None,
    party_id: uuid.UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = 100,
) -> dict:
    """Cost-side figures: the route serves it only with VIEW_COST."""
    bills = _purchase_bills(db, shop_id, p.date_from, p.date_to, user_id, party_id)
    prev = _purchase_bills(db, shop_id, p.prev_from, p.prev_to, user_id, party_id)
    counter = _counter_cash(db, shop_id, [b.ledger_group_id for b in bills], "out")
    units: dict = defaultdict(lambda: {"phones": 0, "items": 0})
    ids = [b.id for b in bills]
    for i in range(0, len(ids), 500):
        for pid, kind, qty in db.execute(
            select(PurchaseLine.purchase_id, PurchaseLine.kind, func.sum(PurchaseLine.qty))
            .where(
                PurchaseLine.purchase_id.in_(ids[i : i + 500]), PurchaseLine.returned_at.is_(None)
            )
            .group_by(PurchaseLine.purchase_id, PurchaseLine.kind)
        ).all():
            units[pid]["phones" if kind == "device" else "items"] += int(qty or 0)
    names = _names(db, [b.party_id for b in bills])
    uname = _users(db)

    def blank() -> dict:
        return {
            "bills": 0,
            "phones": 0,
            "items": 0,
            "total": ZERO,
            "discount": ZERO,
            "extra_costs": ZERO,
            "returned": ZERO,
            "at_counter": ZERO,
            "on_credit": ZERO,
            "paid": ZERO,
            "owed": ZERO,
        }

    def add(a: dict, r: dict) -> None:
        a["bills"] += 1
        a["phones"] += r["phones"]
        a["items"] += r["items"]
        for k in (
            "total",
            "discount",
            "extra_costs",
            "returned",
            "at_counter",
            "on_credit",
            "paid",
            "owed",
        ):
            a[k] = money(a[k] + r[k])

    rows = []
    for b in bills:
        at_counter = min(counter.get(b.ledger_group_id, ZERO), b.total)
        u = units.get(b.id, {"phones": 0, "items": 0})
        rows.append(
            {
                "id": b.id,
                "no": b.no,
                "date": b.date,
                "party_id": b.party_id,
                "party_name": names.get(b.party_id, (None, None))[0],
                "supplier_invoice_no": b.supplier_invoice_no or b.reference,
                "user_id": b.created_by,
                "phones": u["phones"],
                "items": u["items"],
                "total": b.total,
                "discount": b.discount,
                "extra_costs": b.extra_costs,
                "returned": b.returned_total,
                "at_counter": at_counter,
                "on_credit": money(b.total - at_counter),
                "paid": b.paid,
                "owed": max(money(b.total - b.paid - b.returned_total), ZERO),
                "pay_status": _pay_status(b.total, b.paid, b.returned_total, b.status),
                "due_date": b.due_date,
            }
        )
    if status in PAY_STATUSES:
        rows = [r for r in rows if r["pay_status"] == status]
    totals = blank()
    by_status = {s: {"status": s, "count": 0, "amount": ZERO, "due": ZERO} for s in PAY_STATUSES}
    by_user: dict = defaultdict(blank)
    by_party: dict = defaultdict(blank)
    g = granularity(p)
    series: dict = defaultdict(blank)
    cash_bills = credit_bills = 0
    for r in rows:
        add(totals, r)
        add(by_user[r["user_id"]], r)
        add(by_party[r["party_id"]], r)
        add(series[bucket_of(r["date"], g)], r)
        s = by_status[r["pay_status"]]
        s["count"] += 1
        s["amount"] = money(s["amount"] + r["total"])
        s["due"] = money(s["due"] + r["owed"])
        if r["on_credit"] > ZERO:
            credit_bills += 1
        else:
            cash_bills += 1
    ret_q = select(func.count(ReturnDoc.id), func.coalesce(func.sum(ReturnDoc.amount), 0)).where(
        ReturnDoc.shop_id == shop_id,
        ReturnDoc.kind == "purchase",
        ReturnDoc.date >= p.date_from,
        ReturnDoc.date <= p.date_to,
    )
    if party_id is not None:
        ret_q = ret_q.where(ReturnDoc.party_id == party_id)
    if user_id is not None:
        ret_q = ret_q.where(ReturnDoc.created_by == user_id)
    ret_n, ret_amt = db.execute(ret_q).one()
    prev_total = money(sum((b.total for b in prev), ZERO))
    text = (q or "").strip().lower()
    listed = [
        r
        for r in rows
        if not text
        or text in r["no"].lower()
        or text in (r["party_name"] or "").lower()
        or text in (r["supplier_invoice_no"] or "").lower()
    ]
    return {
        "period": p.as_dict(),
        "granularity": g,
        "filters": {"user_id": user_id, "party_id": party_id, "status": status, "q": q},
        "totals": {
            **totals,
            "cash_bills": cash_bills,
            "credit_bills": credit_bills,
            "returns": int(ret_n or 0),
            "returns_amount": money(ret_amt or 0),
            "previous_bills": len(prev),
            "previous_total": prev_total,
            "change_pct": _change(totals["total"], prev_total),
        },
        "by_status": list(by_status.values()),
        "series": [
            {
                "bucket": b,
                "bills": series[b]["bills"],
                "total": series[b]["total"],
                "phones": series[b]["phones"],
                "at_counter": series[b]["at_counter"],
                "on_credit": series[b]["on_credit"],
            }
            for b in buckets(p)
        ],
        "by_user": sorted(
            ({"user_id": k, "user_name": uname(k), **a} for k, a in by_user.items()),
            key=lambda x: -x["total"],
        ),
        "by_party": sorted(
            (
                {
                    "party_id": k,
                    "name": names.get(k, (None, None))[0],
                    "phone": names.get(k, (None, None))[1],
                    **a,
                }
                for k, a in by_party.items()
            ),
            key=lambda x: -x["total"],
        )[:20],
        "rows": [
            {**r, "user_name": uname(r["user_id"])} for r in listed[: max(1, min(limit, 500))]
        ],
        "rows_total": len(listed),
        "notes": [
            "Total = the supplier's bill (freight and extra costs included, discount taken off).",
            (
                "At the counter = money paid out of cash / bank / wallet inside the purchase itself; "
                "on credit = the rest of the bill on that day."
            ),
            "Paid, owed and the payment status are today's figures for each bill.",
        ],
    }
