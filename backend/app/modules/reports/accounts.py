"""Trial balance and balance sheet (docs/35 §5 item 1, owner 2026-11-04).

Read-only: both are derived from the append-only ledger as of the end of a day; nothing is stored.
Cash accounts keep their opening balance outside the ledger, so it is added here with its other
side on "opening balances" (equity) — the same figure every cash screen already shows. Party
accounts are folded into two lines (people who owe the shop / people the shop owes); owner drawing
is an expense category in the ledger but on the balance sheet it reduces the owner's capital, as in
the profit and loss report.
"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.periods import day_end
from app.db.base import ZERO
from app.modules.expenses.service import list_categories
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount, LedgerEntry
from app.modules.ledger.service import money

# system accounts and what kind of account each one is
KIND = {
    acc.SysAccount.INVENTORY: "asset",
    acc.SysAccount.TAX_PAYABLE: "liability",
    acc.SysAccount.SUSPENSE: "liability",
    acc.SysAccount.EQUITY: "equity",
    acc.SysAccount.SALES: "income",
    acc.SysAccount.DISCOUNTS: "income",
    acc.SysAccount.REPAIR_INCOME: "income",
    acc.SysAccount.OTHER_INCOME: "income",
    acc.SysAccount.COGS: "expense",
    acc.SysAccount.PURCHASES: "expense",
}
DRAWING = acc.expense_account("owner_drawing")


def _balances(db: Session, shop_id: uuid.UUID, as_of: dt.date) -> dict[str, Decimal]:
    """Σ(debit − credit) per ledger account up to the end of `as_of` (the shop's day)"""
    rows = db.execute(
        select(LedgerEntry.account, func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0))
        .where(LedgerEntry.shop_id == shop_id, LedgerEntry.at < day_end(as_of))
        .group_by(LedgerEntry.account)
    ).all()
    return {a: money(v) for a, v in rows}


def _cash_accounts(db: Session, shop_id: uuid.UUID, as_of: dt.date) -> list[CashAccount]:
    return [
        a
        for a in db.scalars(
            select(CashAccount).where(CashAccount.shop_id == shop_id).order_by(CashAccount.name)
        ).all()
        if a.opening_date is None or a.opening_date <= as_of
    ]


def _lines(db: Session, shop_id: uuid.UUID, as_of: dt.date) -> list[dict]:
    """every account with its balance: kind, key, names, debit-positive balance"""
    bal = _balances(db, shop_id, as_of)
    names = {c["key"]: (c["name"], c["name_ur"]) for c in list_categories(db, shop_id)}
    lines: list[dict] = []
    opening = ZERO
    for a in _cash_accounts(db, shop_id, as_of):
        b = money(a.opening_balance + bal.pop(acc.cash_account(a.id), ZERO))
        opening += a.opening_balance
        if b != ZERO or a.is_active:
            lines.append({"kind": "asset", "key": f"cash:{a.id}", "group": "cash", "name": a.name, "name_ur": a.name_ur or a.name, "balance": b})
    # money of cash accounts that are no longer listed (none today; kept so the totals always agree)
    for k in [k for k in bal if acc.is_cash(k)]:
        lines.append({"kind": "asset", "key": k, "group": "cash", "name": "Other money account", "name_ur": "دیگر کھاتہ", "balance": bal.pop(k)})
    owe_us, we_owe, n_us, n_we = ZERO, ZERO, 0, 0
    for k in [k for k in bal if acc.is_party(k)]:
        v = bal.pop(k)
        if v > 0:
            owe_us, n_us = owe_us + v, n_us + 1
        elif v < 0:
            we_owe, n_we = we_owe + v, n_we + 1
    lines.append({"kind": "asset", "key": "receivable", "group": "parties", "count": n_us, "balance": money(owe_us)})
    lines.append({"kind": "liability", "key": "payable", "group": "parties", "count": n_we, "balance": money(we_owe)})
    if opening != ZERO:
        lines.append({"kind": "equity", "key": "opening_cash", "group": "equity", "balance": money(-opening)})
    for k, v in sorted(bal.items()):
        if k == DRAWING:
            lines.append({"kind": "equity", "key": "owner_drawing", "group": "equity", "balance": v})
        elif k.startswith(f"{acc.SysAccount.EXPENSE}:"):
            cat = k.split(":", 1)[1]
            en, ur = names.get(cat, (cat.replace("_", " ").capitalize(), cat))
            lines.append({"kind": "expense", "key": k, "group": "expense", "name": en, "name_ur": ur, "balance": v})
        else:
            lines.append({"kind": KIND.get(k, "other"), "key": k, "group": "system", "balance": v})
    return lines


def trial_balance(db: Session, shop_id: uuid.UUID, as_of: dt.date) -> dict:
    """each account's balance on the debit or the credit side; the two totals are always equal"""
    rows = []
    for ln in _lines(db, shop_id, as_of):
        b = ln.pop("balance")
        if b == ZERO and ln["group"] not in ("cash", "parties"):
            continue
        rows.append({**ln, "debit": b if b > 0 else ZERO, "credit": -b if b < 0 else ZERO})
    debit = money(sum((r["debit"] for r in rows), ZERO))
    credit = money(sum((r["credit"] for r in rows), ZERO))
    return {"as_of": as_of, "rows": rows, "debit": debit, "credit": credit, "balanced": debit == credit}


def balance_sheet(db: Session, shop_id: uuid.UUID, as_of: dt.date) -> dict:
    """what the shop has, what it owes, and the owner's share — assets = liabilities + owner's share"""
    lines = _lines(db, shop_id, as_of)

    def pick(kind: str) -> list[dict]:
        return [ln for ln in lines if ln["kind"] == kind]

    assets = [{**ln, "amount": ln["balance"]} for ln in pick("asset")]
    liabilities = [{**ln, "amount": -ln["balance"]} for ln in pick("liability")]
    # profit since the shop began = income − expenses (owner drawing is not an expense here)
    profit = money(-sum((ln["balance"] for ln in lines if ln["kind"] in ("income", "expense")), ZERO))
    capital = money(-sum((ln["balance"] for ln in lines if ln["key"] in (acc.SysAccount.EQUITY, "opening_cash")), ZERO))
    drawing = money(-sum((ln["balance"] for ln in lines if ln["key"] == "owner_drawing"), ZERO))
    other = money(-sum((ln["balance"] for ln in lines if ln["kind"] == "other"), ZERO))
    owner = [
        {"key": "capital", "amount": capital},
        {"key": "profit", "amount": profit},
        {"key": "owner_drawing", "amount": drawing},
    ]
    if other != ZERO:
        owner.append({"key": "other", "amount": other})
    for group in (assets, liabilities):
        for ln in group:
            ln.pop("balance")
    total_assets = money(sum((ln["amount"] for ln in assets), ZERO))
    total_liabilities = money(sum((ln["amount"] for ln in liabilities), ZERO))
    total_owner = money(sum((ln["amount"] for ln in owner), ZERO))
    return {
        "as_of": as_of,
        "assets": assets,
        "liabilities": liabilities,
        "owner": owner,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "total_owner": total_owner,
        "balanced": total_assets == money(total_liabilities + total_owner),
    }
