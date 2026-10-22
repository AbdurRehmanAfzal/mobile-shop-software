"""Reports (FR-RPT-01, FR-RPT-02, FR-TAX-03). Everything is derived from the ledger and documents."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import ZERO
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus, VerificationStatus
from app.modules.ledger.models import CashAccount, LedgerEntry
from app.modules.ledger.service import cash_balance, money
from app.modules.loans.models import Loan, LoanStatus
from app.modules.parties.models import Party
from app.modules.repairs.models import CLOSED_STATUSES, RepairJob
from app.modules.sales.models import Invoice, InvoiceStatus


def _sum(
    db: Session,
    shop_id: uuid.UUID,
    account_like: str,
    d_from: dt.date,
    d_to: dt.date,
    exact: bool = True,
) -> Decimal:
    """Σ(credit − debit) for income-style accounts in the range (positive = income)."""
    cond = LedgerEntry.account == account_like if exact else LedgerEntry.account.like(account_like)
    v = db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.credit - LedgerEntry.debit), 0)).where(
            LedgerEntry.shop_id == shop_id,
            cond,
            func.date(LedgerEntry.at) >= d_from,
            func.date(LedgerEntry.at) <= d_to,
        )
    )
    return money(v or 0)


def profit_and_loss(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> dict:
    sales = _sum(db, shop_id, "sales", d_from, d_to)
    cogs = -_sum(db, shop_id, "cogs", d_from, d_to)
    repair_income = _sum(db, shop_id, "repair_income", d_from, d_to)
    other_income = _sum(db, shop_id, "other_income", d_from, d_to)
    tax = _sum(db, shop_id, "tax_payable", d_from, d_to)
    rows = db.execute(
        select(
            LedgerEntry.account, func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)
        )
        .where(
            LedgerEntry.shop_id == shop_id,
            LedgerEntry.account.like("expense:%"),
            func.date(LedgerEntry.at) >= d_from,
            func.date(LedgerEntry.at) <= d_to,
        )
        .group_by(LedgerEntry.account)
    ).all()
    expenses = {acct.split(":", 1)[1]: money(v) for acct, v in rows if money(v) != ZERO}
    owner_drawing = expenses.pop("owner_drawing", ZERO)
    total_expenses = money(sum(expenses.values(), ZERO))
    gross = money(sales - cogs)
    net = money(gross + repair_income + other_income - total_expenses)
    return {
        "date_from": d_from,
        "date_to": d_to,
        "sales": sales,
        "cogs": cogs,
        "gross_profit": gross,
        "repair_income": repair_income,
        "other_income": other_income,
        "expenses": expenses,
        "total_expenses": total_expenses,
        "net_profit": net,
        "owner_drawing": owner_drawing,
        "tax_collected": tax,
    }


def cash_flow(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> list[dict]:
    out = []
    for a in db.scalars(
        select(CashAccount).where(CashAccount.shop_id == shop_id, CashAccount.is_active.is_(True))
    ).all():
        cin, cout = db.execute(
            select(
                func.coalesce(func.sum(LedgerEntry.debit), 0),
                func.coalesce(func.sum(LedgerEntry.credit), 0),
            ).where(
                LedgerEntry.shop_id == shop_id,
                LedgerEntry.cash_account_id == a.id,
                func.date(LedgerEntry.at) >= d_from,
                func.date(LedgerEntry.at) <= d_to,
            )
        ).one()
        opening = cash_balance(
            db, shop_id, a.id, until=dt.datetime.combine(d_from, dt.time.min, tzinfo=dt.UTC)
        )
        out.append(
            {
                "cash_account_id": a.id,
                "name": a.name,
                "name_ur": a.name_ur,
                "kind": a.kind,
                "opening": opening,
                "cash_in": money(cin),
                "cash_out": money(cout),
                "closing": money(opening + cin - cout),
            }
        )
    return out


def tax_report(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> dict:
    rows = db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id,
            Invoice.date >= d_from,
            Invoice.date <= d_to,
            Invoice.status != InvoiceStatus.VOID,
        )
    ).all()
    taxable = money(sum((i.total - i.tax_amount for i in rows if i.tax_amount > 0), ZERO))
    return {
        "date_from": d_from,
        "date_to": d_to,
        "invoices": len(rows),
        "taxed_invoices": sum(1 for i in rows if i.tax_amount > 0),
        "taxable_sales": taxable,
        "tax_on_invoices": money(sum((i.tax_amount for i in rows), ZERO)),
        "tax_net_of_returns": _sum(db, shop_id, "tax_payable", d_from, d_to),
    }


def dashboard(db: Session, shop_id: uuid.UUID, show_cost: bool) -> dict:
    today = dt.date.today()
    todays = db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id, Invoice.date == today, Invoice.status != InvoiceStatus.VOID
        )
    ).all()
    balances = (
        db.execute(
            select(Party.balance).where(
                Party.shop_id == shop_id, Party.is_active.is_(True), Party.balance != 0
            )
        )
        .scalars()
        .all()
    )
    stock = db.scalars(
        select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
    ).all()
    pnl = profit_and_loss(db, shop_id, today, today) if show_cost else None
    cash_total = money(
        sum(
            (
                cash_balance(db, shop_id, a.id)
                for a in db.scalars(
                    select(CashAccount).where(
                        CashAccount.shop_id == shop_id, CashAccount.is_active.is_(True)
                    )
                ).all()
            ),
            ZERO,
        )
    )
    return {
        "date": today,
        "sales_count": len(todays),
        "sales_total": money(sum((i.total for i in todays), ZERO)),
        "received_today": money(sum((i.paid for i in todays), ZERO)),
        "profit_today": pnl["net_profit"] if pnl else None,
        "cash_in_hand": cash_total,
        "receivable": money(sum((b for b in balances if b > 0), ZERO)),
        "payable": money(-sum((b for b in balances if b < 0), ZERO)),
        "stock_count": len(stock),
        "stock_value_cost": money(sum((d.cost_price or ZERO for d in stock), ZERO))
        if show_cost
        else None,
        "stock_value_asking": money(sum((d.asking_price or ZERO for d in stock), ZERO)),
        "pending_verification": sum(
            1
            for d in stock
            if d.verification_status in (VerificationStatus.PENDING, VerificationStatus.FLAGGED)
        ),
        "loans_out": db.scalar(
            select(func.count(Loan.id)).where(
                Loan.shop_id == shop_id, Loan.status == LoanStatus.OUT
            )
        )
        or 0,
        "repairs_open": db.scalar(
            select(func.count(RepairJob.id)).where(
                RepairJob.shop_id == shop_id,
                RepairJob.status.notin_([s.value for s in CLOSED_STATUSES]),
            )
        )
        or 0,
    }


def stock_ageing(db: Session, shop_id: uuid.UUID, show_cost: bool) -> list[dict]:
    today = dt.datetime.now(dt.UTC)
    buckets = {"0-15": [], "16-30": [], "31-60": [], "60+": []}
    for d in db.scalars(
        select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
    ).all():
        last = d.last_event_at if d.last_event_at.tzinfo else d.last_event_at.replace(tzinfo=dt.UTC)
        days = (today - last).days
        key = "0-15" if days <= 15 else "16-30" if days <= 30 else "31-60" if days <= 60 else "60+"
        buckets[key].append(d)
    return [
        {
            "bucket": k,
            "count": len(v),
            "value": money(sum((d.cost_price or ZERO for d in v), ZERO)) if show_cost else None,
        }
        for k, v in buckets.items()
    ]
