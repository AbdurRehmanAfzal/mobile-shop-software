"""Day-by-day figures for the graphs on the home screen and the business overview (owner
2026-11-17, ADR-096): sales, purchases, profit / loss, and what people owe the shop / the shop
owes — for the last 7 or 30 days. Read-only, derived like the screens beside them:

- sales: bills of the day less what was returned on them (the dashboard's own week figure);
- purchases: purchase bills of the day less what was returned on them;
- profit: the ledger's net profit of the day (`shopaudit.finance.pnl`, the profit report's rule);
- to get / to give: every person's ledger balance at the end of the day, positive ones added up
  as "to get", negative ones as "to give" (`shopaudit.service.debt_split`'s rule).

Purchases and profit are for those who may see cost; a salesman gets sales and the khata totals,
which the home screen already shows him."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_day
from app.core.clock import today as shop_today
from app.core.periods import day_start, resolve
from app.db.base import ZERO
from app.modules.ledger.models import LedgerEntry
from app.modules.ledger.service import money
from app.modules.purchases.models import Purchase, PurchaseStatus
from app.modules.sales.models import Invoice, InvoiceStatus

RANGES = (7, 30)


def _day(v) -> dt.date:
    return v if isinstance(v, dt.date) else dt.date.fromisoformat(str(v)[:10])


def _debt_by_day(db: Session, shop_id: uuid.UUID, days: list[dt.date]) -> dict[dt.date, tuple]:
    """(to get, to give) at the end of each day: one pass for the balances before the first day,
    one for the movements inside the range"""
    start = day_start(days[0])
    bal: dict[uuid.UUID, Decimal] = defaultdict(lambda: ZERO)
    opening = db.execute(
        select(LedgerEntry.party_id, func.sum(LedgerEntry.debit - LedgerEntry.credit))
        .where(
            LedgerEntry.shop_id == shop_id,
            LedgerEntry.party_id.is_not(None),
            LedgerEntry.at < start,
        )
        .group_by(LedgerEntry.party_id)
    ).all()
    for pid, v in opening:
        bal[pid] = money(v or 0)
    moves: dict[dt.date, list[tuple]] = defaultdict(list)
    rows = db.execute(
        select(
            local_day(LedgerEntry.at),
            LedgerEntry.party_id,
            func.sum(LedgerEntry.debit - LedgerEntry.credit),
        )
        .where(
            LedgerEntry.shop_id == shop_id,
            LedgerEntry.party_id.is_not(None),
            LedgerEntry.at >= start,
        )
        .group_by(local_day(LedgerEntry.at), LedgerEntry.party_id)
    ).all()
    for day, pid, v in rows:
        moves[_day(day)].append((pid, money(v or 0)))
    out: dict[dt.date, tuple] = {}
    for d in days:
        for pid, v in moves.get(d, []):
            bal[pid] = money(bal[pid] + v)
        get = money(sum((b for b in bal.values() if b > ZERO), ZERO))
        give = money(-sum((b for b in bal.values() if b < ZERO), ZERO))
        out[d] = (get, give)
    return out


def trends(db: Session, shop_id: uuid.UUID, days: int, show_cost: bool) -> dict:
    today = shop_today()
    d_from = today - dt.timedelta(days=days - 1)
    span = [d_from + dt.timedelta(days=i) for i in range(days)]
    sales = dict(
        db.execute(
            select(Invoice.date, func.sum(Invoice.total - Invoice.returned_total))
            .where(
                Invoice.shop_id == shop_id,
                Invoice.date >= d_from,
                Invoice.date <= today,
                Invoice.status != InvoiceStatus.VOID,
            )
            .group_by(Invoice.date)
        ).all()
    )
    debt = _debt_by_day(db, shop_id, span)
    purchases: dict = {}
    profit: dict = {}
    if show_cost:
        purchases = dict(
            db.execute(
                select(Purchase.date, func.sum(Purchase.total - Purchase.returned_total))
                .where(
                    Purchase.shop_id == shop_id,
                    Purchase.date >= d_from,
                    Purchase.date <= today,
                    Purchase.status != PurchaseStatus.VOIDED,
                )
                .group_by(Purchase.date)
            ).all()
        )
        from app.modules.shopaudit import finance

        pnl = finance.pnl(db, shop_id, resolve(None, d_from, today, None))
        profit = {_day(r["bucket"]): r["net_profit"] for r in pnl["series"]}
    rows = []
    for d in span:
        row = {
            "date": d,
            "sales": money(sales.get(d) or ZERO),
            "to_get": debt[d][0],
            "to_give": debt[d][1],
        }
        if show_cost:
            row["purchases"] = money(purchases.get(d) or ZERO)
            row["profit"] = money(profit.get(d) or ZERO)
        rows.append(row)
    total = lambda k: money(sum((r[k] for r in rows), ZERO))
    return {
        "days": days,
        "date_from": d_from,
        "date_to": today,
        "show_cost": show_cost,
        "rows": rows,
        "totals": {
            "sales": total("sales"),
            "to_get": rows[-1]["to_get"],
            "to_give": rows[-1]["to_give"],
            **({"purchases": total("purchases"), "profit": total("profit")} if show_cost else {}),
        },
    }
