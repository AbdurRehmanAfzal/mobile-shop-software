"""Balances as of a day, and the overview KPIs for a period (docs/17 P3-2, P3-3).

Every balance-type figure comes as opening (before the period), closing (end of the period) and
current (now); every flow-type figure is the period's sum. Revenue is the `sales` account; cash is
what moved on the cash accounts; the two are never mixed (a March sale paid in April is March
revenue and April cash)."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_day
from app.core.periods import Period, day_end, day_start
from app.db.base import ZERO
from app.modules.devices.models import Device, DeviceEvent
from app.modules.devices.state import DeviceStatus
from app.modules.ledger.models import LedgerEntry
from app.modules.ledger.service import cash_balance, money
from app.modules.payments.models import Payment
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.reports import service as rep
from app.modules.returns.models import ReturnDoc, ReturnKind
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

LIMITATIONS = {
    "no_due_dates": "Sales and purchases carry no due date; debt age is counted from the document.",
    "no_purchase_tax": "No tax is recorded on purchases (used-phone trade).",
    "no_remittance_fees": "Remittance fees and settlement status are not recorded.",
}


def first_day(db: Session, shop_id: uuid.UUID) -> dt.date | None:
    """the shop's earliest ledger day (coverage note; start of `all_time`)"""
    v = db.scalar(select(func.min(local_day(LedgerEntry.at))).where(LedgerEntry.shop_id == shop_id))
    if v is None:
        return None
    return v if isinstance(v, dt.date) else dt.date.fromisoformat(str(v)[:10])


# ---- money (cash, bank, wallets) ---------------------------------------------------------


def money_position(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    rows = rep.cash_flow(db, shop_id, p.date_from, p.date_to)
    accounts = []
    for r in rows:
        current = cash_balance(db, shop_id, r["cash_account_id"])
        as_of = cash_balance(db, shop_id, r["cash_account_id"], until=day_end(p.as_of))
        accounts.append({**r, "as_of": as_of, "current": current})
    tot = lambda k: money(sum((a[k] for a in accounts), ZERO))
    inflows = money(tot("cash_in") - tot("transfers_in"))
    outflows = money(tot("cash_out") - tot("transfers_out"))
    by_kind: dict[str, Decimal] = {}
    for a in accounts:
        by_kind[a["kind"]] = money(by_kind.get(a["kind"], ZERO) + a["as_of"])
    return {
        "opening": tot("opening"),
        "inflows": inflows,
        "outflows": outflows,
        "transfers": tot("transfers_in"),
        "net": money(inflows - outflows),
        "closing": tot("closing"),
        "as_of": tot("as_of"),
        "current": tot("current"),
        "by_kind": by_kind,
        "accounts": accounts,
    }


# ---- debt (receivable / payable kept apart) -----------------------------------------------


def debt_split(db: Session, shop_id: uuid.UUID, until: dt.datetime | None) -> dict:
    """Σ per party of the ledger up to `until`: positive balances are receivable, negative payable."""
    stmt = (
        select(LedgerEntry.party_id, func.sum(LedgerEntry.debit - LedgerEntry.credit))
        .where(LedgerEntry.shop_id == shop_id, LedgerEntry.party_id.is_not(None))
        .group_by(LedgerEntry.party_id)
    )
    if until is not None:
        stmt = stmt.where(LedgerEntry.at < until)
    receivable = payable = ZERO
    debtors = creditors = 0
    for _pid, bal in db.execute(stmt).all():
        bal = money(bal or 0)
        if bal > ZERO:
            receivable = money(receivable + bal)
            debtors += 1
        elif bal < ZERO:
            payable = money(payable - bal)
            creditors += 1
    return {
        "receivable": receivable,
        "payable": payable,
        "debtors": debtors,
        "creditors": creditors,
    }


def debt_position(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    opening = debt_split(db, shop_id, day_start(p.date_from))
    closing = debt_split(db, shop_id, day_end(p.date_to))
    as_of = debt_split(db, shop_id, day_end(p.as_of))
    current = debt_split(db, shop_id, None)
    pay_in, pay_out = ZERO, ZERO
    for direction, total in db.execute(
        select(Payment.direction, func.coalesce(func.sum(Payment.amount), 0))
        .where(
            Payment.shop_id == shop_id,
            Payment.date >= p.date_from,
            Payment.date <= p.date_to,
            Payment.status != "voided",
        )
        .group_by(Payment.direction)
    ).all():
        if direction == "in":
            pay_in = money(total)
        else:
            pay_out = money(total)
    return {
        "receivable": {
            "opening": opening["receivable"],
            "closing": closing["receivable"],
            "as_of": as_of["receivable"],
            "current": current["receivable"],
            "parties": current["debtors"],
        },
        "payable": {
            "opening": opening["payable"],
            "closing": closing["payable"],
            "as_of": as_of["payable"],
            "current": current["payable"],
            "parties": current["creditors"],
        },
        "received_in_period": pay_in,
        "paid_in_period": pay_out,
    }


# ---- stock as of a day (from the immutable device events) ----------------------------------


def stock_walk(db: Session, shop_id: uuid.UUID, until: dt.datetime | None) -> dict[uuid.UUID, str]:
    """device id -> status after its last event before `until` (all devices that had any event)."""
    stmt = select(DeviceEvent.device_id, DeviceEvent.status_after).where(
        DeviceEvent.shop_id == shop_id
    )
    if until is not None:
        stmt = stmt.where(DeviceEvent.at < until)
    last: dict[uuid.UUID, str] = {}
    for dev_id, status in db.execute(stmt.order_by(DeviceEvent.at, DeviceEvent.seq)).all():
        last[dev_id] = status
    return last


def stock_at(db: Session, shop_id: uuid.UUID, until: dt.datetime | None, can_cost: bool) -> dict:
    if until is None:
        devs = db.scalars(
            select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
        ).all()
    else:
        ids = [d for d, s in stock_walk(db, shop_id, until).items() if s == DeviceStatus.IN_STOCK]
        devs = db.scalars(select(Device).where(Device.id.in_(ids))).all() if ids else []
    return {
        "count": len(devs),
        "cost_value": money(sum((d.cost_price or ZERO for d in devs), ZERO)) if can_cost else None,
        "asking_value": money(sum((d.asking_price or ZERO for d in devs), ZERO)),
    }


def stock_position(db: Session, shop_id: uuid.UUID, p: Period, can_cost: bool) -> dict:
    return {
        "opening": stock_at(db, shop_id, day_start(p.date_from), can_cost),
        "closing": stock_at(db, shop_id, day_end(p.date_to), can_cost),
        "as_of": stock_at(db, shop_id, day_end(p.as_of), can_cost),
        "current": stock_at(db, shop_id, None, can_cost),
        "note": "Values use each phone's recorded cost / asking price; the stock held on a past day "
        "is rebuilt from the device events.",
    }


# ---- documents in the period ---------------------------------------------------------------


def documents(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    inv_count, inv_total = db.execute(
        select(func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.shop_id == shop_id,
            Invoice.date >= p.date_from,
            Invoice.date <= p.date_to,
            Invoice.status != InvoiceStatus.VOID,
        )
    ).one()
    phones_sold = db.scalar(
        select(func.count(InvoiceLine.id))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.date >= p.date_from,
            Invoice.date <= p.date_to,
            Invoice.status != InvoiceStatus.VOID,
            InvoiceLine.kind == "device",
            InvoiceLine.returned_at.is_(None),
        )
    )
    pur_count, pur_total = db.execute(
        select(func.count(Purchase.id), func.coalesce(func.sum(Purchase.total), 0)).where(
            Purchase.shop_id == shop_id,
            Purchase.date >= p.date_from,
            Purchase.date <= p.date_to,
            Purchase.status == PurchaseStatus.POSTED,
        )
    ).one()
    phones_bought = db.scalar(
        select(func.count(PurchaseLine.id))
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .where(
            Purchase.shop_id == shop_id,
            Purchase.date >= p.date_from,
            Purchase.date <= p.date_to,
            Purchase.status == PurchaseStatus.POSTED,
            PurchaseLine.kind == "device",
            PurchaseLine.returned_at.is_(None),
        )
    )
    returns = {}
    for kind, cnt, amt in db.execute(
        select(
            ReturnDoc.kind, func.count(ReturnDoc.id), func.coalesce(func.sum(ReturnDoc.amount), 0)
        )
        .where(
            ReturnDoc.shop_id == shop_id,
            ReturnDoc.date >= p.date_from,
            ReturnDoc.date <= p.date_to,
        )
        .group_by(ReturnDoc.kind)
    ).all():
        returns[kind] = {"count": cnt, "amount": money(amt)}
    sr = returns.get(ReturnKind.SALE.value, {"count": 0, "amount": ZERO})
    pr = returns.get(ReturnKind.PURCHASE.value, {"count": 0, "amount": ZERO})
    return {
        "invoices": inv_count,
        "invoices_total": money(inv_total),
        "phones_sold": phones_sold or 0,
        "sale_returns": sr,
        "purchases": pur_count,
        "purchases_total": money(pur_total),
        "purchases_net": money(money(pur_total) - pr["amount"]),
        "phones_bought": phones_bought or 0,
        "purchase_returns": pr,
    }


# ---- the overview --------------------------------------------------------------------------


def overview(db: Session, shop_id: uuid.UUID, p: Period, *, can_cost: bool) -> dict:
    pnl = rep.profit_and_loss(db, shop_id, p.date_from, p.date_to)
    prev = rep.profit_and_loss(db, shop_id, p.prev_from, p.prev_to)
    docs = documents(db, shop_id, p)
    money_ = money_position(db, shop_id, p)
    prev_money = money_position(
        db, shop_id, Period("custom", p.prev_from, p.prev_to, p.prev_to, p.prev_from, p.prev_to)
    )
    out = {
        "period": p.as_dict(),
        "coverage": {
            "first_day": first_day(db, shop_id),
            "limitations": list(LIMITATIONS.values()),
        },
        "sales": {
            "gross_sales": pnl["gross_sales"],
            "discounts": pnl["discounts"],
            "sales_returns": pnl["sales_returns"],
            "net_sales": pnl["net_sales"],
            "tax_collected": pnl["tax_collected"],
            **{k: docs[k] for k in ("invoices", "invoices_total", "phones_sold", "sale_returns")},
        },
        "purchases": {
            k: docs[k]
            for k in (
                "purchases",
                "purchases_total",
                "purchases_net",
                "phones_bought",
                "purchase_returns",
            )
        },
        "profit": {
            "cogs": pnl["cogs"],
            "gross_profit": pnl["gross_profit"],
            "operating_expenses": pnl["operating_expenses"],
            "operating_profit": pnl["operating_profit"],
            "repair_income": pnl["repair_income"],
            "other_income": pnl["other_income"],
            "net_profit": pnl["net_profit"],
            "owner_drawing": pnl["owner_drawing"],
        }
        if can_cost
        else None,
        "expenses": {"total": pnl["total_expenses"], "by_category": pnl["expenses"]},
        "money": money_,
        "debt": debt_position(db, shop_id, p),
        "stock": stock_position(db, shop_id, p, can_cost),
        "previous": {
            "net_sales": prev["net_sales"],
            "net_profit": prev["net_profit"] if can_cost else None,
            "total_expenses": prev["total_expenses"],
            "inflows": prev_money["inflows"],
            "outflows": prev_money["outflows"],
        },
    }
    return out
