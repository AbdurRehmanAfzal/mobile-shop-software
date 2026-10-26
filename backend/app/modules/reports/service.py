"""Reports (FR-RPT-01, FR-RPT-02, FR-TAX-03). Everything is derived from the ledger and documents."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus, VerificationStatus
from app.modules.ledger.models import CashAccount, LedgerEntry
from app.modules.ledger.service import cash_balance, money
from app.modules.loans.models import Loan, LoanStatus
from app.modules.parties.models import Party
from app.modules.repairs.models import CLOSED_STATUSES, RepairJob
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus


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
        "sales_total": money(sum((i.total - i.returned_total for i in todays), ZERO)),
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


def stock_summary(db: Session, shop_id: uuid.UUID, show_cost: bool) -> dict:
    """In-stock phones grouped by brand, then model: count and value.

    Value is at cost for owner/manager and at asking price for everyone else (`basis` says which).
    """
    from app.modules.catalogue.models import Brand, Model

    rows = db.execute(
        select(Device, Brand.name, Model.name)
        .join(Brand, Brand.id == Device.brand_id)
        .join(Model, Model.id == Device.model_id)
        .where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
    ).all()
    brands: dict[uuid.UUID, dict] = {}
    for d, brand_name, model_name in rows:
        value = (d.cost_price if show_cost else d.asking_price) or ZERO
        b = brands.setdefault(
            d.brand_id,
            {"brand_id": d.brand_id, "name": brand_name, "count": 0, "value": ZERO, "models": {}},
        )
        m = b["models"].setdefault(
            d.model_id, {"model_id": d.model_id, "name": model_name, "count": 0, "value": ZERO}
        )
        for x in (b, m):
            x["count"] += 1
            x["value"] = money(x["value"] + value)
    by_value = lambda x: (-x["value"], -x["count"], x["name"])
    out = []
    for b in sorted(brands.values(), key=by_value):
        out.append({**b, "models": sorted(b["models"].values(), key=by_value)})
    return {
        "basis": "cost" if show_cost else "asking",
        "count": len(rows),
        "value": money(sum((b["value"] for b in out), ZERO)),
        "brands": out,
    }


def day_report(db: Session, shop_id: uuid.UUID, day: dt.date, show_cost: bool) -> dict:
    """One day's hisaab in shopkeeper terms: what was sold, how it was paid, udhaar given and
    received back, expenses, profit (owner/manager only) and the list of items sold."""
    from app.modules.catalogue.models import Brand, Model
    from app.modules.expenses.models import Expense
    from app.modules.payments.models import Payment

    invoices = db.scalars(
        select(Invoice)
        .where(
            Invoice.shop_id == shop_id, Invoice.date == day, Invoice.status != InvoiceStatus.VOID
        )
        .order_by(Invoice.created_at)
    ).all()
    kinds = dict(
        db.execute(
            select(CashAccount.id, CashAccount.kind).where(CashAccount.shop_id == shop_id)
        ).all()
    )
    parties = dict(
        db.execute(
            select(Party.id, Party.name).where(
                Party.id.in_({i.party_id for i in invoices if i.party_id})
            )
        ).all()
    )
    sellers: dict = {}
    received = {"cash": ZERO, "bank": ZERO, "easypaisa": ZERO, "jazzcash": ZERO}
    udhaar_given = ZERO
    phones = 0
    items = []
    for inv in invoices:
        # paid at the counter = money into a cash account inside the sale's own posting;
        # later payments against this invoice are counted as "udhaar received" on their day
        paid_now = (
            money(
                db.scalar(
                    select(
                        func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)
                    ).where(
                        LedgerEntry.group_id == inv.ledger_group_id,
                        LedgerEntry.cash_account_id.is_not(None),
                    )
                )
                or 0
            )
            if inv.ledger_group_id
            else ZERO
        )
        kind = kinds.get(inv.cash_account_id, "cash")
        received[kind] = money(received.get(kind, ZERO) + paid_now)
        owed = max(money(inv.total - paid_now), ZERO)
        udhaar_given = money(udhaar_given + owed)
        how = kind if owed == 0 else "udhaar" if paid_now == 0 else "part"
        for line in sorted(inv.lines, key=lambda x: x.line_no):
            name = line.description
            returned = line.returned_at is not None
            if line.device_id:
                phones += 0 if returned else 1
                dev = db.get(Device, line.device_id)
                if dev:
                    name = " ".join(
                        filter(
                            None,
                            [db.get(Brand, dev.brand_id).name, db.get(Model, dev.model_id).name],
                        )
                    )
            items.append(
                {
                    "invoice_id": inv.id,
                    "invoice_no": inv.no,
                    "name": name or "",
                    "kind": line.kind,
                    "qty": line.qty,
                    "amount": money(line.line_total),
                    "party_name": parties.get(inv.party_id),
                    "how": how,
                    "sold_by": sellers.setdefault(inv.created_by, user_name(db, inv.created_by)),
                    # came back later: stays in the list (crossed out), not counted as sold
                    "returned": returned,
                }
            )
    udhaar_received = money(
        db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.shop_id == shop_id,
                Payment.date == day,
                Payment.direction == "in",
                Payment.status != "voided",
            )
        )
        or 0
    )
    expenses = money(
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.shop_id == shop_id, Expense.date == day, Expense.status != "voided"
            )
        )
        or 0
    )
    from app.modules.returns.models import ReturnDoc, ReturnKind

    refunded, kept = db.execute(
        select(
            func.coalesce(func.sum(ReturnDoc.refund_amount), 0),
            func.coalesce(func.sum(ReturnDoc.kept_amount), 0),
        ).where(
            ReturnDoc.shop_id == shop_id,
            ReturnDoc.date == day,
            ReturnDoc.kind == ReturnKind.SALE,
        )
    ).one()
    # money that actually moved through cash / bank / Easypaisa today (sales, udhaar back, returns,
    # expenses, payments to dealers...): what is left in hand is in - out
    flows = cash_flow(db, shop_id, day, day)
    money_in = money(sum((f["cash_in"] for f in flows), ZERO))
    money_out = money(sum((f["cash_out"] for f in flows), ZERO))
    return {
        "date": day,
        "money_in": money_in,
        "money_out": money_out,
        "cash_net": money(money_in - money_out),
        "returns_refunded": money(refunded or 0),
        "returns_kept": money(kept or 0),
        "sales_count": len(invoices),
        "phones_sold": phones,
        # net of anything that came back, so a returned phone is not counted as sold
        "sales_total": money(sum((i.total - i.returned_total for i in invoices), ZERO)),
        "received": received,
        "udhaar_given": udhaar_given,
        "udhaar_received": udhaar_received,
        "expenses": expenses,
        "profit": profit_and_loss(db, shop_id, day, day)["net_profit"] if show_cost else None,
        "items": items,
    }


def _line_name(db: Session, ln: InvoiceLine, cache: dict) -> tuple[str, str]:
    """(group key, shop-facing name): phones by brand + model, other items by their name."""
    from app.modules.catalogue.models import Brand, Model

    if ln.device_id:
        dev = db.get(Device, ln.device_id)
        if dev:
            key = f"m:{dev.model_id}"
            if key not in cache:
                cache[key] = (
                    f"{db.get(Brand, dev.brand_id).name} {db.get(Model, dev.model_id).name}"
                )
            return key, cache[key]
    name = (ln.description or "").strip() or "-"
    return f"x:{ln.accessory_id or name.lower()}", name


def _sold_lines(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date):
    return db.execute(
        select(InvoiceLine, Invoice.date)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.date >= d_from,
            Invoice.date <= d_to,
            Invoice.status != InvoiceStatus.VOID,
            InvoiceLine.returned_at.is_(None),
        )
    ).all()


def top_sellers(
    db: Session,
    shop_id: uuid.UUID,
    d_from: dt.date,
    d_to: dt.date,
    show_cost: bool,
    limit: int = 20,
) -> list[dict]:
    """What sold the most in the range: phones grouped by model, other items by name."""
    cache: dict = {}
    rows: dict[str, dict] = {}
    for ln, _ in _sold_lines(db, shop_id, d_from, d_to):
        key, name = _line_name(db, ln, cache)
        r = rows.setdefault(
            key,
            {"name": name, "kind": ln.kind, "qty": 0, "amount": ZERO, "profit": ZERO},
        )
        r["qty"] += ln.qty
        r["amount"] = money(r["amount"] + ln.line_total)
        r["profit"] = money(r["profit"] + ln.line_total - ln.tax_share - ln.cost)
    out = sorted(rows.values(), key=lambda r: (-r["qty"], -r["amount"], r["name"]))[:limit]
    if not show_cost:
        for r in out:
            r["profit"] = None
    return out


def forecast(db: Session, shop_id: uuid.UUID, today: dt.date) -> dict:
    """A plain estimate, not a promise: next 7 days from the same weekday over the last 4 weeks,
    and for each phone model how many days the stock lasts at the last 30 days' selling speed."""
    from app.modules.catalogue.models import Brand, Model

    start = today - dt.timedelta(days=28)
    daily: dict[dt.date, Decimal] = {}
    for inv in db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id,
            Invoice.date >= start,
            Invoice.date <= today,
            Invoice.status != InvoiceStatus.VOID,
        )
    ).all():
        daily[inv.date] = money(daily.get(inv.date, ZERO) + inv.total - inv.returned_total)
    days = []
    for i in range(1, 8):
        d = today + dt.timedelta(days=i)
        same = [daily.get(d - dt.timedelta(weeks=w), ZERO) for w in range(1, 5)]
        days.append({"date": d, "expected": money(sum(same, ZERO) / 4)})
    # "last 7 days" includes today; the estimate itself only looks at past weeks' same weekday
    last7 = sum((v for k, v in daily.items() if k >= today - dt.timedelta(days=6)), ZERO)
    prev7 = sum(
        (
            v
            for k, v in daily.items()
            if today - dt.timedelta(days=13) <= k < today - dt.timedelta(days=6)
        ),
        ZERO,
    )

    sold: dict = {}
    for ln, _ in _sold_lines(db, shop_id, today - dt.timedelta(days=30), today):
        if ln.device_id:
            dev = db.get(Device, ln.device_id)
            if dev:
                sold[dev.model_id] = sold.get(dev.model_id, 0) + 1
    stock: dict = {}
    for dev in db.scalars(
        select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
    ).all():
        stock[dev.model_id] = stock.get(dev.model_id, 0) + 1
    models = []
    for model_id in set(sold) | set(stock):
        m = db.get(Model, model_id)
        name = f"{db.get(Brand, m.brand_id).name} {m.name}" if m else "-"
        s30, have = sold.get(model_id, 0), stock.get(model_id, 0)
        per_day = s30 / 30
        days_left = round(have / per_day) if per_day else None
        advice = (
            "buy_more"
            if s30 and (days_left is not None and days_left <= 7)
            else "slow"
            if have and not s30
            else "ok"
        )
        models.append(
            {
                "model_id": model_id,
                "name": name,
                "sold_30_days": s30,
                "in_stock": have,
                "days_left": days_left,
                "advice": advice,
            }
        )
    order = {"buy_more": 0, "slow": 2, "ok": 1}
    models.sort(key=lambda r: (order[r["advice"]], -r["sold_30_days"], r["name"]))
    return {
        "next_7_days": days,
        "next_7_total": money(sum((d["expected"] for d in days), ZERO)),
        "last_7_days": money(last7),
        "previous_7_days": money(prev7),
        "models": models,
    }
