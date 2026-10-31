"""Financial audit (docs/16 §3, §4, §10, §11 — docs/17 P4): P&L with a series and the period
before, cash & bank by reason and by channel, international payments, expenses, tax.

All of it is read from the ledger and the documents; nothing is estimated."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_day
from app.core.periods import Period, day_end
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.expenses.models import Expense, ExpenseCategory
from app.modules.ledger.models import CashAccount, LedgerEntry, LedgerGroup
from app.modules.ledger.service import cash_balance, money
from app.modules.parties.models import Party
from app.modules.payments.models import Payment
from app.modules.paymode.models import PaymentDetail
from app.modules.purchases.models import Purchase
from app.modules.reports import service as rep
from app.modules.sales.models import Invoice, InvoiceStatus

# ---- buckets for series ----------------------------------------------------------------------


def granularity(p: Period) -> str:
    return "day" if p.days <= 31 else "week" if p.days <= 140 else "month"


def bucket_of(d: dt.date, g: str) -> dt.date:
    if g == "day":
        return d
    if g == "week":
        return d - dt.timedelta(days=d.weekday())
    return d.replace(day=1)


def buckets(p: Period) -> list[dt.date]:
    g = granularity(p)
    out: list[dt.date] = []
    d = bucket_of(p.date_from, g)
    while d <= p.date_to:
        out.append(d)
        if g == "day":
            d += dt.timedelta(days=1)
        elif g == "week":
            d += dt.timedelta(days=7)
        else:
            d = (d + dt.timedelta(days=32)).replace(day=1)
    return out


def _as_date(v) -> dt.date:
    return v if isinstance(v, dt.date) else dt.date.fromisoformat(str(v)[:10])


# ---- P&L -------------------------------------------------------------------------------------


def pnl(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    current = rep.profit_and_loss(db, shop_id, p.date_from, p.date_to)
    previous = rep.profit_and_loss(db, shop_id, p.prev_from, p.prev_to)
    g = granularity(p)
    # one pass over the ledger: day × account → Σ(credit − debit)
    rows = db.execute(
        select(
            local_day(LedgerEntry.at),
            LedgerEntry.account,
            func.coalesce(func.sum(LedgerEntry.credit - LedgerEntry.debit), 0),
        )
        .where(
            LedgerEntry.shop_id == shop_id,
            local_day(LedgerEntry.at) >= p.date_from,
            local_day(LedgerEntry.at) <= p.date_to,
            (LedgerEntry.account.in_(["sales", "cogs", "repair_income", "other_income"]))
            | (LedgerEntry.account.like("expense:%")),
        )
        .group_by(local_day(LedgerEntry.at), LedgerEntry.account)
    ).all()
    acc: dict[dt.date, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for day, account, v in rows:
        b = bucket_of(_as_date(day), g)
        v = money(v)
        if account == "sales":
            acc[b]["net_sales"] += v
        elif account == "cogs":
            acc[b]["cogs"] += -v
        elif account in ("repair_income", "other_income"):
            acc[b]["other_income"] += v
        elif account == "expense:owner_drawing":
            acc[b]["owner_drawing"] += -v
        else:
            acc[b]["expenses"] += -v
    series = []
    for b in buckets(p):
        x = acc.get(b, {})
        ns, cg = money(x.get("net_sales", ZERO)), money(x.get("cogs", ZERO))
        ex, oi = money(x.get("expenses", ZERO)), money(x.get("other_income", ZERO))
        series.append(
            {
                "bucket": b,
                "net_sales": ns,
                "cogs": cg,
                "gross_profit": money(ns - cg),
                "expenses": ex,
                "other_income": oi,
                "net_profit": money(ns - cg - ex + oi),
            }
        )
    return {
        "period": p.as_dict(),
        "granularity": g,
        "current": current,
        "previous": previous,
        "series": series,
        "notes": [
            "Net sales = sales after discounts and returns (the `sales` account).",
            "Cost of goods = the recorded cost of what was sold (returns give the cost back).",
            "Owner drawings are not an expense.",
        ],
    }


# ---- cash & bank by reason and by channel --------------------------------------------------------

IN_REASON = {
    "invoice": "sales_now",
    "payment": "udhaar_received",
    "repair": "repairs",
    "repair_advance": "repairs",
    "repair_bill": "repairs",
    "purchase_return": "refund_from_supplier",
    "transfer": "transfer_in",
    "reversal:transfer": "transfer_in",
    "opening_balance": "opening",
    "exchange": "sales_now",
}
OUT_REASON = {
    "purchase": "stock_now",
    "payment": "paid_to_people",
    "expense": "expenses",
    "sale_return": "refunds",
    "exchange_refund": "refunds",
    "repair_cost": "repair_parts",
    "transfer": "transfer_out",
    "reversal:transfer": "transfer_out",
    "fee_payment": "fees",
}
IN_KEYS = (
    "sales_now",
    "udhaar_received",
    "repairs",
    "refund_from_supplier",
    "transfer_in",
    "opening",
    "other_in",
)
OUT_KEYS = (
    "stock_now",
    "paid_to_people",
    "expenses",
    "refunds",
    "repair_parts",
    "fees",
    "transfer_out",
    "other_out",
)


def _reason(doc_type: str, side: str) -> str:
    base = (
        doc_type.split(":", 1)[1]
        if doc_type.startswith("reversal:") and doc_type != "reversal:transfer"
        else doc_type
    )
    if side == "in":
        return (
            IN_REASON.get(base, "other_in")
            if not doc_type.startswith("reversal:") or base == "transfer"
            else _flip(OUT_REASON.get(base, "other_out"))
        )
    return (
        OUT_REASON.get(base, "other_out")
        if not doc_type.startswith("reversal:") or base == "transfer"
        else _flip(IN_REASON.get(base, "other_in"))
    )


def _flip(reason: str) -> str:
    """a reversal of an outflow is money coming back under the same heading (and vice versa);
    it is reported as a reversal so the headings still sum to the account movement."""
    return f"reversal_of_{reason}"


def cash(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    accounts = db.scalars(
        select(CashAccount)
        .where(CashAccount.shop_id == shop_id, CashAccount.is_active.is_(True))
        .order_by(CashAccount.is_default.desc(), CashAccount.name)
    ).all()
    rows = db.execute(
        select(
            LedgerEntry.cash_account_id,
            LedgerGroup.document_type,
            func.coalesce(func.sum(LedgerEntry.debit), 0),
            func.coalesce(func.sum(LedgerEntry.credit), 0),
        )
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(
            LedgerEntry.shop_id == shop_id,
            LedgerEntry.cash_account_id.is_not(None),
            local_day(LedgerEntry.at) >= p.date_from,
            local_day(LedgerEntry.at) <= p.date_to,
        )
        .group_by(LedgerEntry.cash_account_id, LedgerGroup.document_type)
    ).all()
    per: dict[uuid.UUID, dict] = {
        a.id: {"in": defaultdict(lambda: ZERO), "out": defaultdict(lambda: ZERO)} for a in accounts
    }
    for acc_id, doc_type, dr, cr in rows:
        if acc_id not in per:
            continue
        if money(dr) != ZERO:
            per[acc_id]["in"][_reason(doc_type, "in")] += money(dr)
        if money(cr) != ZERO:
            per[acc_id]["out"][_reason(doc_type, "out")] += money(cr)
    flows = {f["cash_account_id"]: f for f in rep.cash_flow(db, shop_id, p.date_from, p.date_to)}
    out_accounts = []
    totals_in: dict[str, Decimal] = defaultdict(lambda: ZERO)
    totals_out: dict[str, Decimal] = defaultdict(lambda: ZERO)
    by_kind: dict[str, dict] = {}
    for a in accounts:
        f = flows.get(a.id) or {
            "opening": cash_balance(
                db, shop_id, a.id, until=day_end(p.date_from - dt.timedelta(days=1))
            ),
            "cash_in": ZERO,
            "cash_out": ZERO,
            "transfers_in": ZERO,
            "transfers_out": ZERO,
            "closing": ZERO,
        }
        ins = {k: money(v) for k, v in per[a.id]["in"].items()}
        outs = {k: money(v) for k, v in per[a.id]["out"].items()}
        for k, v in ins.items():
            totals_in[k] += v
        for k, v in outs.items():
            totals_out[k] += v
        row = {
            "cash_account_id": a.id,
            "name": a.name,
            "name_ur": a.name_ur,
            "kind": a.kind,
            "opening": f["opening"],
            "in": ins,
            "out": outs,
            "cash_in": f["cash_in"],
            "cash_out": f["cash_out"],
            "transfers_in": f["transfers_in"],
            "transfers_out": f["transfers_out"],
            "closing": f["closing"],
            "as_of": cash_balance(db, shop_id, a.id, until=day_end(p.as_of)),
            "current": cash_balance(db, shop_id, a.id),
        }
        out_accounts.append(row)
        k = by_kind.setdefault(
            a.kind, {"kind": a.kind, "in": ZERO, "out": ZERO, "closing": ZERO, "accounts": 0}
        )
        k["in"] = money(k["in"] + f["cash_in"] - f["transfers_in"])
        k["out"] = money(k["out"] + f["cash_out"] - f["transfers_out"])
        k["closing"] = money(k["closing"] + f["closing"])
        k["accounts"] += 1
    # stand-alone payments by the method typed on them (cash / bank / easypaisa / … / remittance)
    by_method: dict[str, dict] = {}
    for direction, method, total, cnt in db.execute(
        select(
            Payment.direction,
            Payment.method,
            func.coalesce(func.sum(Payment.amount), 0),
            func.count(Payment.id),
        )
        .where(
            Payment.shop_id == shop_id,
            Payment.date >= p.date_from,
            Payment.date <= p.date_to,
            Payment.status != "voided",
        )
        .group_by(Payment.direction, Payment.method)
    ).all():
        m = by_method.setdefault(method, {"method": method, "in": ZERO, "out": ZERO, "count": 0})
        m["in" if direction == "in" else "out"] = money(total)
        m["count"] += cnt
    opening = money(sum((a["opening"] for a in out_accounts), ZERO))
    closing = money(sum((a["closing"] for a in out_accounts), ZERO))
    return {
        "period": p.as_dict(),
        "opening": opening,
        "closing": closing,
        "as_of": money(sum((a["as_of"] for a in out_accounts), ZERO)),
        "current": money(sum((a["current"] for a in out_accounts), ZERO)),
        "in": {k: money(v) for k, v in totals_in.items()},
        "out": {k: money(v) for k, v in totals_out.items()},
        "in_total": money(sum(totals_in.values(), ZERO)),
        "out_total": money(sum(totals_out.values(), ZERO)),
        "in_keys": list(IN_KEYS),
        "out_keys": list(OUT_KEYS),
        "accounts": out_accounts,
        "by_kind": list(by_kind.values()),
        "payments_by_method": sorted(by_method.values(), key=lambda m: m["method"]),
        "notes": [
            (
                "Money moved between the shop's own accounts is a transfer: it is in each account's "
                "movement but in no reason and in no income or expense."
            ),
            (
                "Channels are the account types money landed in (cash, bank, Easypaisa, JazzCash, cheque, "
                "remittance); stand-alone payments also show the method typed on them."
            ),
        ],
    }


# ---- international (remittance) payments ------------------------------------------------------


def international(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    rows: list[dict] = []
    # on sales / purchases: the detail typed at the counter
    for d, inv in db.execute(
        select(PaymentDetail, Invoice)
        .join(Invoice, Invoice.id == PaymentDetail.document_id)
        .where(
            PaymentDetail.shop_id == shop_id,
            PaymentDetail.method == "remittance",
            PaymentDetail.document_type == "sale",
            Invoice.date >= p.date_from,
            Invoice.date <= p.date_to,
            Invoice.status != InvoiceStatus.VOID,
        )
    ).all():
        rows.append(_remit_row(db, d, "sale", inv.id, inv.no, inv.date, inv.party_id, "in"))
    for d, pur in db.execute(
        select(PaymentDetail, Purchase)
        .join(Purchase, Purchase.id == PaymentDetail.document_id)
        .where(
            PaymentDetail.shop_id == shop_id,
            PaymentDetail.method == "remittance",
            PaymentDetail.document_type == "purchase",
            Purchase.date >= p.date_from,
            Purchase.date <= p.date_to,
            Purchase.status == "posted",
        )
    ).all():
        rows.append(_remit_row(db, d, "purchase", pur.id, pur.no, pur.date, pur.party_id, "out"))
    # stand-alone payments marked remittance (no foreign amount typed: PKR only)
    for pay in db.scalars(
        select(Payment).where(
            Payment.shop_id == shop_id,
            Payment.method == "remittance",
            Payment.date >= p.date_from,
            Payment.date <= p.date_to,
            Payment.status != "voided",
        )
    ).all():
        rows.append(
            {
                "date": pay.date,
                "document_type": "payment",
                "document_id": pay.id,
                "document_no": pay.no,
                "direction": pay.direction,
                "party_id": pay.party_id,
                "party_name": _party_name(db, pay.party_id),
                "sender_name": None,
                "country": None,
                "service": None,
                "currency": None,
                "foreign_amount": None,
                "rate": None,
                "pkr_amount": pay.amount,
                "reference": pay.reference,
                "fee": None,
                "net": pay.amount,
                "status": None,
            }
        )
    rows.sort(key=lambda r: (r["date"], r["document_no"]), reverse=True)
    by_currency: dict[str, dict] = {}
    for r in rows:
        cur = r["currency"] or "PKR"
        c = by_currency.setdefault(
            cur, {"currency": cur, "foreign_amount": ZERO, "pkr_amount": ZERO, "count": 0}
        )
        c["foreign_amount"] = money(c["foreign_amount"] + (r["foreign_amount"] or ZERO))
        c["pkr_amount"] = money(c["pkr_amount"] + r["pkr_amount"])
        c["fees"] = money(c.get("fees", ZERO) + (r["fee"] or ZERO))
        c["net"] = money(c.get("net", ZERO) + r["net"])
        c["count"] += 1
    return {
        "period": p.as_dict(),
        "rows": rows,
        "total_pkr_in": money(sum((r["pkr_amount"] for r in rows if r["direction"] == "in"), ZERO)),
        "total_pkr_out": money(
            sum((r["pkr_amount"] for r in rows if r["direction"] == "out"), ZERO)
        ),
        "total_fees": money(sum((r["fee"] or ZERO for r in rows), ZERO)),
        "total_net_in": money(sum((r["net"] for r in rows if r["direction"] == "in"), ZERO)),
        "by_status": {
            k: sum(1 for r in rows if (r["status"] or "unknown") == k)
            for k in ("pending", "received", "settled", "unknown")
        },
        "by_currency": list(by_currency.values()),
        "notes": [
            "Fee and status are typed at the counter when known; net = PKR booked − fee. Rows without them show a blank.",
        ],
    }


def _party_name(db: Session, party_id) -> str | None:
    if not party_id:
        return None
    return db.scalar(select(Party.name).where(Party.id == party_id))


def _remit_row(db, d: PaymentDetail, doc_type, doc_id, no, date, party_id, direction) -> dict:
    return {
        "date": date,
        "document_type": doc_type,
        "document_id": doc_id,
        "document_no": no,
        "direction": direction,
        "party_id": party_id,
        "party_name": _party_name(db, party_id),
        "sender_name": d.sender_name,
        "country": d.country,
        "service": d.service,
        "currency": d.currency,
        "foreign_amount": d.foreign_amount,
        "rate": d.rate,
        "pkr_amount": d.amount,
        "reference": d.reference,
        "fee": d.fee,
        "net": money(d.amount - (d.fee or ZERO)),
        "status": d.status,
    }


# ---- expenses ----------------------------------------------------------------------------------


def expenses(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    cats = {
        c.key: c
        for c in db.scalars(
            select(ExpenseCategory).where(
                (ExpenseCategory.shop_id == shop_id) | (ExpenseCategory.shop_id.is_(None))
            )
        ).all()
    }
    accounts = {
        a.id: a for a in db.scalars(select(CashAccount).where(CashAccount.shop_id == shop_id)).all()
    }

    def _rows(d_from, d_to):
        return db.scalars(
            select(Expense)
            .where(
                Expense.shop_id == shop_id,
                Expense.date >= d_from,
                Expense.date <= d_to,
                Expense.status != "voided",
            )
            .order_by(Expense.date.desc(), Expense.created_at.desc())
        ).all()

    rows = _rows(p.date_from, p.date_to)
    prev_rows = _rows(p.prev_from, p.prev_to)

    def _by_cat(rs):
        out: dict[str, dict] = {}
        for e in rs:
            c = cats.get(e.category_key)
            x = out.setdefault(
                e.category_key,
                {
                    "key": e.category_key,
                    "name": c.name if c else e.category_key,
                    "name_ur": c.name_ur if c else None,
                    "amount": ZERO,
                    "count": 0,
                },
            )
            x["amount"] = money(x["amount"] + e.amount)
            x["count"] += 1
        return sorted(out.values(), key=lambda x: -x["amount"])

    by_account: dict[uuid.UUID, dict] = {}
    by_user: dict = {}
    g = granularity(p)
    series_map: dict[dt.date, Decimal] = defaultdict(lambda: ZERO)
    for e in rows:
        a = accounts.get(e.cash_account_id)
        x = by_account.setdefault(
            e.cash_account_id,
            {
                "cash_account_id": e.cash_account_id,
                "name": a.name if a else None,
                "kind": a.kind if a else None,
                "amount": ZERO,
                "count": 0,
            },
        )
        x["amount"] = money(x["amount"] + e.amount)
        x["count"] += 1
        u = by_user.setdefault(
            e.created_by,
            {
                "user_id": e.created_by,
                "user_name": user_name(db, e.created_by),
                "amount": ZERO,
                "count": 0,
            },
        )
        u["amount"] = money(u["amount"] + e.amount)
        u["count"] += 1
        series_map[bucket_of(e.date, g)] += e.amount
    drawing = money(sum((e.amount for e in rows if e.category_key == "owner_drawing"), ZERO))
    total = money(sum((e.amount for e in rows), ZERO) - drawing)
    prev_drawing = money(
        sum((e.amount for e in prev_rows if e.category_key == "owner_drawing"), ZERO)
    )
    largest = sorted(
        (e for e in rows if e.category_key != "owner_drawing"), key=lambda e: -e.amount
    )[:10]
    return {
        "period": p.as_dict(),
        "granularity": g,
        "total": total,
        "owner_drawing": drawing,
        "count": len(rows),
        "previous_total": money(sum((e.amount for e in prev_rows), ZERO) - prev_drawing),
        "by_category": _by_cat(rows),
        "previous_by_category": _by_cat(prev_rows),
        "by_account": list(by_account.values()),
        "by_user": sorted(by_user.values(), key=lambda u: -u["amount"]),
        "series": [{"bucket": b, "amount": money(series_map.get(b, ZERO))} for b in buckets(p)],
        "largest": [
            {
                "id": e.id,
                "no": e.no,
                "date": e.date,
                "amount": e.amount,
                "category": e.category_key,
                "category_name": cats[e.category_key].name
                if e.category_key in cats
                else e.category_key,
                "description": e.description,
                "account": accounts[e.cash_account_id].name
                if e.cash_account_id in accounts
                else None,
                "user_name": user_name(db, e.created_by),
                "has_receipt": bool(e.receipt_path),
            }
            for e in largest
        ],
        "notes": ["Owner drawings are listed apart and are not in the total."],
    }


# ---- tax ----------------------------------------------------------------------------------------


def tax(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    summary = rep.tax_report(db, shop_id, p.date_from, p.date_to)
    rows = []
    names = {}
    for inv in db.scalars(
        select(Invoice)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.date >= p.date_from,
            Invoice.date <= p.date_to,
            Invoice.status != InvoiceStatus.VOID,
            Invoice.tax_amount > 0,
        )
        .order_by(Invoice.date.desc(), Invoice.no.desc())
    ).all():
        if inv.party_id and inv.party_id not in names:
            names[inv.party_id] = _party_name(db, inv.party_id)
        rows.append(
            {
                "invoice_id": inv.id,
                "no": inv.no,
                "date": inv.date,
                "party_name": names.get(inv.party_id),
                "taxable": money(inv.total - inv.tax_amount),
                "tax_rate": inv.tax_rate,
                "tax_inclusive": inv.tax_inclusive,
                "tax_amount": inv.tax_amount,
                "total": inv.total,
                "status": inv.status,
                "returned_total": inv.returned_total,
                "fbr_invoice_no": inv.fbr_invoice_no,
            }
        )
    return {
        "period": p.as_dict(),
        **summary,
        "rows": rows,
        "notes": [
            (
                "Tax collected is what the bills charged; it is a liability until it is filed and paid — "
                "the app does not record the filing."
            ),
            "No tax is recorded on purchases or expenses (used-phone trade).",
            "Returns give the tax back: 'tax net of returns' is the ledger figure.",
        ],
    }
