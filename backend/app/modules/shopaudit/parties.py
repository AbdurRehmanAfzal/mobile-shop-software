"""Customers & suppliers (docs/16 §5, §13 — docs/17 P5): a person's whole journey up to a day,
rankings with the metric named, and the udhaar book with receivables and payables kept apart.

Everything is read from the documents and the ledger. A person's "as of" balance is the ledger
up to that instant; per-bill remaining amounts are current (payments are allocated to bills
without a date of their own)."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_day
from app.core.errors import NotFound
from app.core.periods import Period, day_end
from app.db.base import ZERO
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.ledger.models import LedgerEntry, LedgerGroup
from app.modules.ledger.service import money, party_balance
from app.modules.parties.models import Party
from app.modules.payments.models import Payment
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.returns.models import ReturnDoc
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus
from app.modules.shopaudit import service as core

# ---- one person's journey -------------------------------------------------------------------


def _cash_in_groups(db: Session, shop_id: uuid.UUID, group_ids: list, side: str) -> Decimal:
    """money that moved on cash accounts inside these document groups (paid at the counter)"""
    if not group_ids:
        return ZERO
    col = LedgerEntry.debit if side == "in" else LedgerEntry.credit
    return money(
        db.scalar(
            select(func.coalesce(func.sum(col), 0)).where(
                LedgerEntry.shop_id == shop_id,
                LedgerEntry.group_id.in_(group_ids),
                LedgerEntry.cash_account_id.is_not(None),
            )
        )
        or 0
    )


def journey(
    db: Session, shop_id: uuid.UUID, party_id: uuid.UUID, as_of: dt.date, *, can_cost: bool
) -> dict:
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    until = day_end(as_of)
    invoices = db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id,
            Invoice.party_id == party_id,
            Invoice.status != InvoiceStatus.VOID,
            Invoice.date <= as_of,
        )
    ).all()
    purchases = db.scalars(
        select(Purchase).where(
            Purchase.shop_id == shop_id,
            Purchase.party_id == party_id,
            Purchase.status == PurchaseStatus.POSTED,
            Purchase.date <= as_of,
        )
    ).all()
    payments = db.scalars(
        select(Payment).where(
            Payment.shop_id == shop_id,
            Payment.party_id == party_id,
            Payment.status != "voided",
            Payment.date <= as_of,
        )
    ).all()
    returns = db.scalars(
        select(ReturnDoc).where(
            ReturnDoc.shop_id == shop_id, ReturnDoc.party_id == party_id, ReturnDoc.date <= as_of
        )
    ).all()
    inv_ids = [i.id for i in invoices]
    pur_ids = [p.id for p in purchases]
    sold_lines = (
        db.execute(
            select(InvoiceLine, Invoice.date, Invoice.no)
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(InvoiceLine.invoice_id.in_(inv_ids), InvoiceLine.kind == "device")
        ).all()
        if inv_ids
        else []
    )
    bought_lines = (
        db.execute(
            select(PurchaseLine, Purchase.date, Purchase.no)
            .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
            .where(PurchaseLine.purchase_id.in_(pur_ids), PurchaseLine.kind == "device")
        ).all()
        if pur_ids
        else []
    )
    dates = (
        [i.date for i in invoices]
        + [p.date for p in purchases]
        + [p.date for p in payments]
        + [r.date for r in returns]
    )
    received_counter = _cash_in_groups(
        db, shop_id, [i.ledger_group_id for i in invoices if i.ledger_group_id], "in"
    )
    paid_counter = _cash_in_groups(
        db, shop_id, [p.ledger_group_id for p in purchases if p.ledger_group_id], "out"
    )
    received_later = money(sum((p.amount for p in payments if p.direction == "in"), ZERO))
    paid_later = money(sum((p.amount for p in payments if p.direction == "out"), ZERO))
    refunds_out = money(sum((r.refund_amount for r in returns if r.kind == "sale"), ZERO))
    refunds_in = money(sum((r.refund_amount for r in returns if r.kind == "purchase"), ZERO))
    # profit on what this person bought from us, and on what we sourced from them
    profit_sold = money(
        sum((ln.line_total - ln.cost for ln, _d, _n in sold_lines if ln.returned_at is None), ZERO)
    )
    sourced_ids = [ln.device_id for ln, _d, _n in bought_lines if ln.device_id]
    sourced_profit = ZERO
    sourced_sold = 0
    if sourced_ids:
        for lt, cost in db.execute(
            select(InvoiceLine.line_total, InvoiceLine.cost)
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(
                Invoice.shop_id == shop_id,
                Invoice.status != InvoiceStatus.VOID,
                Invoice.date <= as_of,
                InvoiceLine.device_id.in_(sourced_ids),
                InvoiceLine.returned_at.is_(None),
            )
        ).all():
            sourced_profit = money(sourced_profit + (lt - cost))
            sourced_sold += 1
    balance = party_balance(db, shop_id, party_id, until=until)
    # open bills (current): receivable / payable apart
    receivable_open = money(
        sum(
            (
                i.total - i.paid
                for i in invoices
                if i.status in (InvoiceStatus.OPEN, InvoiceStatus.PARTIALLY_PAID)
            ),
            ZERO,
        )
    )
    payable_open = money(sum((p.total - p.paid for p in purchases if p.paid < p.total), ZERO))
    timeline = _timeline(
        db, shop_id, invoices, purchases, payments, returns, sold_lines, bought_lines
    )
    out = {
        "party": {
            "id": party.id,
            "name": party.name,
            "name_ur": party.name_ur,
            "phone": party.phone,
            "kinds": party.kinds,
            "city": party.city,
            "created_at": party.created_at,
        },
        "as_of": as_of,
        "first_transaction": min(dates) if dates else None,
        "last_transaction": max(dates) if dates else None,
        "sold": {
            "bills": len(invoices),
            "phones": sum(1 for ln, _d, _n in sold_lines if ln.returned_at is None),
            "value": money(sum((i.total - i.returned_total for i in invoices), ZERO)),
            "profit": profit_sold if can_cost else None,
        },
        "bought": {
            "bills": len(purchases),
            "phones": sum(1 for ln, _d, _n in bought_lines if ln.returned_at is None),
            "value": money(sum((p.total - p.returned_total for p in purchases), ZERO))
            if can_cost
            else None,
            "sourced_sold": sourced_sold,
            "sourced_profit": sourced_profit if can_cost else None,
        },
        "money": {
            "received_at_counter": received_counter,
            "received_later": received_later,
            "received_total": money(received_counter + received_later),
            "paid_at_counter": paid_counter if can_cost else None,
            "paid_later": paid_later if can_cost else None,
            "paid_total": money(paid_counter + paid_later) if can_cost else None,
            "refunded_to_them": refunds_out,
            "refunded_by_them": refunds_in if can_cost else None,
            "payments": len(payments),
        },
        "returns": {
            "sale": {
                "count": sum(1 for r in returns if r.kind == "sale"),
                "amount": money(sum((r.amount for r in returns if r.kind == "sale"), ZERO)),
            },
            "purchase": {
                "count": sum(1 for r in returns if r.kind == "purchase"),
                "amount": money(sum((r.amount for r in returns if r.kind == "purchase"), ZERO)),
            },
        },
        "balance_as_of": balance,
        "receivable_open": receivable_open,
        "payable_open": payable_open if can_cost else None,
        "timeline": timeline,
        "notes": [
            "Balance as of the day is the ledger up to that day; open amounts per bill are as of now.",
        ],
    }
    if not can_cost:
        out["timeline"] = [
            t
            for t in out["timeline"]
            if t["kind"] not in ("purchase", "payment_out", "purchase_return")
        ]
    return out


def _timeline(
    db, shop_id, invoices, purchases, payments, returns, sold_lines, bought_lines
) -> list[dict]:
    names = _device_names(
        db, [ln.device_id for ln, _d, _n in sold_lines + bought_lines if ln.device_id]
    )
    by_inv: dict = defaultdict(list)
    for ln, _d, _n in sold_lines:
        by_inv[ln.invoice_id].append(names.get(ln.device_id))
    by_pur: dict = defaultdict(list)
    for ln, _d, _n in bought_lines:
        by_pur[ln.purchase_id].append(names.get(ln.device_id))
    rows = []
    for i in invoices:
        rows.append(
            {
                "date": i.date,
                "at": i.created_at,
                "kind": "sale",
                "no": i.no,
                "id": i.id,
                "amount": i.total,
                "paid": i.paid,
                "status": i.status,
                "devices": [x for x in by_inv.get(i.id, []) if x],
            }
        )
    for p in purchases:
        rows.append(
            {
                "date": p.date,
                "at": p.created_at,
                "kind": "purchase",
                "no": p.no,
                "id": p.id,
                "amount": p.total,
                "paid": p.paid,
                "status": p.status,
                "devices": [x for x in by_pur.get(p.id, []) if x],
            }
        )
    for p in payments:
        rows.append(
            {
                "date": p.date,
                "at": p.created_at,
                "kind": "payment_in" if p.direction == "in" else "payment_out",
                "no": p.no,
                "id": p.id,
                "amount": p.amount,
                "method": p.method,
                "status": p.status,
                "devices": [],
            }
        )
    for r in returns:
        rows.append(
            {
                "date": r.date,
                "at": r.created_at,
                "kind": f"{r.kind}_return",
                "no": r.no,
                "id": r.id,
                "ref_no": r.document_no,
                "ref_id": r.document_id,
                "amount": r.amount,
                "refund": r.refund_amount,
                "status": r.settlement,
                "devices": [],
            }
        )
    rows.sort(key=lambda r: (r["date"], r["at"]), reverse=True)
    for r in rows:
        r.pop("at", None)
    return rows


def _device_names(db: Session, ids: list) -> dict:
    if not ids:
        return {}
    return {
        d_id: {"device_id": d_id, "label": f"{b} {m}", "imei1": imei}
        for d_id, b, m, imei in db.execute(
            select(Device.id, Brand.name, Model.name, Device.imei1)
            .join(Brand, Brand.id == Device.brand_id)
            .join(Model, Model.id == Device.model_id)
            .where(Device.id.in_(ids))
        ).all()
    }


# ---- rankings ----------------------------------------------------------------------------------

METRICS = (
    "customers_sales",
    "customers_bills",
    "customers_profit",
    "suppliers_purchases",
    "suppliers_devices",
    "suppliers_profit",
    "receivable",
    "payable",
)


def rankings(
    db: Session, shop_id: uuid.UUID, p: Period, metric: str, *, can_cost: bool, limit: int = 10
) -> dict:
    if metric not in METRICS:
        raise ValueError(metric)
    if metric in ("customers_profit", "suppliers_profit") and not can_cost:
        metric = "customers_sales" if metric == "customers_profit" else "suppliers_purchases"
    rows: list[tuple] = []  # (party_id, value, count)
    if metric in ("customers_sales", "customers_bills"):
        rows = db.execute(
            select(
                Invoice.party_id,
                func.coalesce(func.sum(Invoice.total - Invoice.returned_total), 0),
                func.count(Invoice.id),
            )
            .where(
                Invoice.shop_id == shop_id,
                Invoice.party_id.is_not(None),
                Invoice.date >= p.date_from,
                Invoice.date <= p.date_to,
                Invoice.status != InvoiceStatus.VOID,
            )
            .group_by(Invoice.party_id)
        ).all()
        if metric == "customers_bills":
            rows = [(pid, Decimal(c), c) for pid, _v, c in rows]
    elif metric == "customers_profit":
        rows = db.execute(
            select(
                Invoice.party_id,
                func.coalesce(func.sum(InvoiceLine.line_total - InvoiceLine.cost), 0),
                func.count(func.distinct(Invoice.id)),
            )
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(
                Invoice.shop_id == shop_id,
                Invoice.party_id.is_not(None),
                Invoice.date >= p.date_from,
                Invoice.date <= p.date_to,
                Invoice.status != InvoiceStatus.VOID,
                InvoiceLine.returned_at.is_(None),
            )
            .group_by(Invoice.party_id)
        ).all()
    elif metric in ("suppliers_purchases", "suppliers_devices"):
        if metric == "suppliers_purchases":
            rows = db.execute(
                select(
                    Purchase.party_id,
                    func.coalesce(func.sum(Purchase.total - Purchase.returned_total), 0),
                    func.count(Purchase.id),
                )
                .where(
                    Purchase.shop_id == shop_id,
                    Purchase.date >= p.date_from,
                    Purchase.date <= p.date_to,
                    Purchase.status == PurchaseStatus.POSTED,
                )
                .group_by(Purchase.party_id)
            ).all()
        else:
            rows = [
                (pid, Decimal(c), c)
                for pid, c in db.execute(
                    select(Purchase.party_id, func.count(PurchaseLine.id))
                    .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
                    .where(
                        Purchase.shop_id == shop_id,
                        Purchase.date >= p.date_from,
                        Purchase.date <= p.date_to,
                        Purchase.status == PurchaseStatus.POSTED,
                        PurchaseLine.kind == "device",
                        PurchaseLine.returned_at.is_(None),
                    )
                    .group_by(Purchase.party_id)
                ).all()
            ]
    elif metric == "suppliers_profit":
        # phones sold in the period, grouped by who the shop bought them from
        rows = db.execute(
            select(
                Purchase.party_id,
                func.coalesce(func.sum(InvoiceLine.line_total - InvoiceLine.cost), 0),
                func.count(InvoiceLine.id),
            )
            .select_from(InvoiceLine)
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .join(PurchaseLine, PurchaseLine.device_id == InvoiceLine.device_id)
            .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
            .where(
                Invoice.shop_id == shop_id,
                Invoice.date >= p.date_from,
                Invoice.date <= p.date_to,
                Invoice.status != InvoiceStatus.VOID,
                InvoiceLine.returned_at.is_(None),
                Purchase.status == PurchaseStatus.POSTED,
                PurchaseLine.returned_at.is_(None),
            )
            .group_by(Purchase.party_id)
        ).all()
    else:  # receivable / payable as of the period's as-of day
        sign = 1 if metric == "receivable" else -1
        rows = [
            (pid, money(v) * sign, 0)
            for pid, v in db.execute(
                select(LedgerEntry.party_id, func.sum(LedgerEntry.debit - LedgerEntry.credit))
                .where(
                    LedgerEntry.shop_id == shop_id,
                    LedgerEntry.party_id.is_not(None),
                    LedgerEntry.at < day_end(p.as_of),
                )
                .group_by(LedgerEntry.party_id)
            ).all()
            if money(v) * sign > ZERO
        ]
    rows = [(pid, money(v), c) for pid, v, c in rows if pid]
    rows.sort(key=lambda r: (-r[1], -r[2]))
    total = money(sum((r[1] for r in rows), ZERO))
    top = rows[:limit]
    parties = (
        {x.id: x for x in db.scalars(select(Party).where(Party.id.in_([r[0] for r in top]))).all()}
        if top
        else {}
    )
    return {
        "metric": metric,
        "period": p.as_dict(),
        "total": total,
        "parties": len(rows),
        "rows": [
            {
                "rank": i + 1,
                "party_id": pid,
                "name": parties[pid].name if pid in parties else None,
                "phone": parties[pid].phone if pid in parties else None,
                "value": v,
                "count": c,
                "share": (round(float(v / total * 100), 1) if total else 0.0),
            }
            for i, (pid, v, c) in enumerate(top)
        ],
    }


# ---- udhaar (receivables / payables apart) -----------------------------------------------------

AGE_BANDS = ((0, 7, "0-7"), (8, 30, "8-30"), (31, 60, "31-60"), (61, None, "61+"))


def _band(days: int) -> str:
    for lo, hi, key in AGE_BANDS:
        if days >= lo and (hi is None or days <= hi):
            return key
    return "61+"


def udhaar(db: Session, shop_id: uuid.UUID, p: Period, *, can_cost: bool, limit: int = 20) -> dict:
    totals = core.debt_position(db, shop_id, p)
    # movement inside the period, from the party accounts grouped by what caused it
    moves = defaultdict(lambda: ZERO)
    for doc_type, dr, cr in db.execute(
        select(
            LedgerGroup.document_type,
            func.coalesce(func.sum(LedgerEntry.debit), 0),
            func.coalesce(func.sum(LedgerEntry.credit), 0),
        )
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(
            LedgerEntry.shop_id == shop_id,
            LedgerEntry.party_id.is_not(None),
            local_day(LedgerEntry.at) >= p.date_from,
            local_day(LedgerEntry.at) <= p.date_to,
        )
        .group_by(LedgerGroup.document_type)
    ).all():
        dr, cr = money(dr), money(cr)
        if doc_type == "invoice":
            moves["udhaar_given"] += money(dr - cr)
        elif doc_type == "purchase":
            moves["udhaar_taken"] += money(cr - dr)
        elif doc_type == "payment":
            moves["received"] += cr
            moves["paid"] += dr
        elif doc_type in ("sale_return", "exchange_refund"):
            moves["sale_returns"] += money(cr - dr)
        elif doc_type == "purchase_return":
            moves["purchase_returns"] += money(dr - cr)
        elif doc_type in ("repair", "repair_advance", "repair_bill"):
            moves["repairs"] += money(dr - cr)
        else:
            moves["other"] += money(dr - cr)
    # per party as of the as-of day
    until = day_end(p.as_of)
    balances = {
        pid: money(v or 0)
        for pid, v in db.execute(
            select(LedgerEntry.party_id, func.sum(LedgerEntry.debit - LedgerEntry.credit))
            .where(
                LedgerEntry.shop_id == shop_id,
                LedgerEntry.party_id.is_not(None),
                LedgerEntry.at < until,
            )
            .group_by(LedgerEntry.party_id)
        ).all()
        if money(v or 0) != ZERO
    }
    ids = list(balances)
    parties = (
        {x.id: x for x in db.scalars(select(Party).where(Party.id.in_(ids))).all()} if ids else {}
    )
    last_pay = (
        dict(
            db.execute(
                select(Payment.party_id, func.max(Payment.date))
                .where(
                    Payment.shop_id == shop_id, Payment.status != "voided", Payment.date <= p.as_of
                )
                .group_by(Payment.party_id)
            ).all()
        )
        if ids
        else {}
    )
    # oldest open bill per party (age of the debt); phones on open bills
    oldest: dict = {}
    phones: list[dict] = []
    open_inv = db.execute(
        select(Invoice, InvoiceLine, Device.imei1, Brand.name, Model.name)
        .join(InvoiceLine, InvoiceLine.invoice_id == Invoice.id, isouter=True)
        .join(Device, Device.id == InvoiceLine.device_id, isouter=True)
        .join(Brand, Brand.id == Device.brand_id, isouter=True)
        .join(Model, Model.id == Device.model_id, isouter=True)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.party_id.is_not(None),
            Invoice.status.in_([InvoiceStatus.OPEN, InvoiceStatus.PARTIALLY_PAID]),
            Invoice.date <= p.as_of,
        )
    ).all()
    for inv, ln, imei, b, m in open_inv:
        o = oldest.get(inv.party_id)
        if o is None or inv.date < o:
            oldest[inv.party_id] = inv.date
        if ln is not None and ln.device_id and ln.returned_at is None:
            phones.append(
                {
                    "side": "receivable",
                    "party_id": inv.party_id,
                    "party_name": parties[inv.party_id].name if inv.party_id in parties else None,
                    "device_id": ln.device_id,
                    "label": f"{b} {m}",
                    "imei1": imei,
                    "doc_type": "invoice",
                    "doc_id": inv.id,
                    "no": inv.no,
                    "date": inv.date,
                    "agreed": ln.line_total,
                    "doc_total": inv.total,
                    "doc_remaining": money(inv.total - inv.paid),
                    "age_days": (p.as_of - inv.date).days,
                }
            )
    open_pur = db.execute(
        select(Purchase, PurchaseLine, Device.imei1, Brand.name, Model.name)
        .join(PurchaseLine, PurchaseLine.purchase_id == Purchase.id, isouter=True)
        .join(Device, Device.id == PurchaseLine.device_id, isouter=True)
        .join(Brand, Brand.id == Device.brand_id, isouter=True)
        .join(Model, Model.id == Device.model_id, isouter=True)
        .where(
            Purchase.shop_id == shop_id,
            Purchase.status == PurchaseStatus.POSTED,
            Purchase.paid < Purchase.total,
            Purchase.date <= p.as_of,
        )
    ).all()
    for pur, ln, imei, b, m in open_pur:
        o = oldest.get(pur.party_id)
        if o is None or pur.date < o:
            oldest[pur.party_id] = pur.date
        if ln is not None and ln.device_id and ln.returned_at is None:
            phones.append(
                {
                    "side": "payable",
                    "party_id": pur.party_id,
                    "party_name": parties[pur.party_id].name if pur.party_id in parties else None,
                    "device_id": ln.device_id,
                    "label": f"{b} {m}",
                    "imei1": imei,
                    "doc_type": "purchase",
                    "doc_id": pur.id,
                    "no": pur.no,
                    "date": pur.date,
                    "agreed": ln.net_cost if can_cost else None,
                    "doc_total": pur.total if can_cost else None,
                    "doc_remaining": money(pur.total - pur.paid) if can_cost else None,
                    "age_days": (p.as_of - pur.date).days,
                }
            )
    receivable_rows, payable_rows = [], []
    bands = {
        "receivable": defaultdict(lambda: {"amount": ZERO, "parties": 0}),
        "payable": defaultdict(lambda: {"amount": ZERO, "parties": 0}),
    }
    for pid, bal in balances.items():
        side = "receivable" if bal > ZERO else "payable"
        amt = abs(bal)
        od = oldest.get(pid)
        age = (p.as_of - od).days if od else None
        band = _band(age) if age is not None else "no_bill"
        bands[side][band]["amount"] = money(bands[side][band]["amount"] + amt)
        bands[side][band]["parties"] += 1
        row = {
            "party_id": pid,
            "name": parties[pid].name if pid in parties else None,
            "phone": parties[pid].phone if pid in parties else None,
            "amount": amt,
            "oldest_bill": od,
            "age_days": age,
            "band": band,
            "last_payment": last_pay.get(pid),
        }
        (receivable_rows if side == "receivable" else payable_rows).append(row)
    receivable_rows.sort(key=lambda r: -r["amount"])
    payable_rows.sort(key=lambda r: -r["amount"])
    phones.sort(key=lambda r: -r["age_days"])
    band_keys = [k for _lo, _hi, k in AGE_BANDS] + ["no_bill"]
    out = {
        "period": p.as_dict(),
        **totals,
        "movement": {
            k: money(moves.get(k, ZERO))
            for k in (
                "udhaar_given",
                "received",
                "sale_returns",
                "udhaar_taken",
                "paid",
                "purchase_returns",
                "repairs",
                "other",
            )
        },
        "bands": band_keys,
        "receivable_bands": [
            {"band": k, **bands["receivable"].get(k, {"amount": ZERO, "parties": 0})}
            for k in band_keys
        ],
        "payable_bands": [
            {"band": k, **bands["payable"].get(k, {"amount": ZERO, "parties": 0})}
            for k in band_keys
        ],
        "receivable_rows": receivable_rows[:limit],
        "payable_rows": payable_rows[:limit] if can_cost else [],
        "phones": [r for r in phones if can_cost or r["side"] == "receivable"][: limit * 2],
        "notes": [
            "Bills carry no due date: the age is counted from the oldest unpaid bill, so nothing is called overdue.",
            "A bill with several phones shows the bill's remaining amount on each phone.",
        ],
    }
    if not can_cost:
        out["payable"] = {k: None for k in out["payable"]}
        out["movement"] = {
            k: (v if k in ("udhaar_given", "received", "sale_returns") else None)
            for k, v in out["movement"].items()
        }
        out["payable_bands"] = []
    return out
