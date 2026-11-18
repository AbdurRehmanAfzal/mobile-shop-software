"""General ledger (owner 2026-11-18, ADR-104): every line of one account for a period, with the
balance before, the running balance and the totals. The accounts are the trial balance's own
lines (the chart of accounts), so a figure on the trial balance opens into the entries behind it.

Read-only, straight from the append-only ledger; nothing is stored. Everything that was ever
posted is listed — a deleted bill shows as its entry and the entry that reversed it, both marked —
because this is the account's complete history, and its closing balance is the trial balance's
figure for the same day.

Account keys (as on the trial balance):
- `cash:<id>`      one cash / bank / wallet account (its opening balance is outside the ledger and
                   is added to the balance, as on every cash screen)
- `receivable` / `payable`   every line on people's khatas (one sub-ledger; a person's own khata
                   is on their page)
- `owner_drawing`  what the owner took out
- `expense:<key>`  one expense category
- `opening_cash`   the opening balances of the money accounts (no ledger lines of its own)
- any system account: `sales`, `cogs`, `inventory`, `other_income`, `repair_income`, `discounts`,
  `tax_payable`, `equity`, `suspense`, `purchases`, `branch_transfer`"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_date, local_day
from app.core.errors import NotFound
from app.db.base import ZERO
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount, LedgerEntry, LedgerGroup
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.reports import accounts as chart

MAX_ROWS = 5000  # one request never loads more lines than this; narrow the dates for more


def _filter(db: Session, shop_id: uuid.UUID, key: str):
    """(where-clause, opening balance outside the ledger) for an account key"""
    if key in ("receivable", "payable"):
        return LedgerEntry.party_id.is_not(None), ZERO
    if key == "owner_drawing":
        return LedgerEntry.account == chart.DRAWING, ZERO
    if acc.is_cash(key):
        a = db.get(CashAccount, acc.id_of(key))
        if a is None or a.shop_id != shop_id:
            raise NotFound(code="account_not_found")
        return LedgerEntry.account == key, money(a.opening_balance)
    return LedgerEntry.account == key, ZERO


def accounts(db: Session, shop_id: uuid.UUID, as_of: dt.date) -> list[dict]:
    """the chart of accounts: every account the shop has, with its balance on that day"""
    out = []
    for ln in chart._lines(db, shop_id, as_of):
        out.append({**ln, "balance": ln["balance"]})
    return out


def ledger(
    db: Session,
    shop_id: uuid.UUID,
    key: str,
    d_from: dt.date,
    d_to: dt.date,
    *,
    offset: int = 0,
    limit: int = 200,
) -> dict:
    line = next((x for x in chart._lines(db, shop_id, d_to) if x["key"] == key), None)
    if key == "opening_cash":
        # no ledger lines: the opening balance typed on each money account
        rows = [
            {
                "date": a.opening_date,
                "type": "opening_balance",
                "no": "",
                "memo": a.name,
                "party_name": None,
                "debit": ZERO,
                "credit": money(a.opening_balance),
                "balance": ZERO,
                "reversed": False,
                "group_id": None,
            }
            for a in db.scalars(
                select(CashAccount).where(CashAccount.shop_id == shop_id).order_by(CashAccount.name)
            ).all()
            if a.opening_balance
        ]
        running = ZERO
        for r in rows:
            running = money(running - r["credit"])
            r["balance"] = running
        return {
            "account": line or {"key": key, "kind": "equity", "group": "equity"},
            "date_from": d_from,
            "date_to": d_to,
            "opening": ZERO,
            "rows": rows,
            "count": len(rows),
            "debit": ZERO,
            "credit": money(-running),
            "closing": running,
            "truncated": False,
        }
    where, outside = _filter(db, shop_id, key)
    base = (LedgerEntry.shop_id == shop_id, where)
    opening = money(
        outside
        + (
            db.scalar(
                select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
                    *base, local_day(LedgerEntry.at) < d_from
                )
            )
            or 0
        )
    )
    found = db.execute(
        select(LedgerEntry, LedgerGroup)
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(*base, local_day(LedgerEntry.at) >= d_from, local_day(LedgerEntry.at) <= d_to)
        .order_by(LedgerEntry.at, LedgerGroup.id, LedgerEntry.seq)
        .limit(MAX_ROWS + 1)
    ).all()
    truncated = len(found) > MAX_ROWS
    found = found[:MAX_ROWS]
    from app.modules.exports.statements import _doc_details

    details = _doc_details(db, shop_id, list({g.id: g for _e, g in found}.values()))
    party_ids = {e.party_id for e, _g in found if e.party_id}
    names = (
        {p.id: p.name for p in db.scalars(select(Party).where(Party.id.in_(party_ids))).all()}
        if party_ids
        else {}
    )
    running = opening
    tot_debit = tot_credit = ZERO
    rows = []
    for entry, group in found:
        running = money(running + entry.debit - entry.credit)
        tot_debit += entry.debit
        tot_credit += entry.credit
        no, _items = details.get(group.id, ("", []))
        rows.append(
            {
                "date": local_date(entry.at),
                "at": entry.at,
                "type": group.document_type,
                "no": no,
                "memo": entry.memo or group.memo or "",
                "party_name": names.get(entry.party_id),
                "debit": money(entry.debit),
                "credit": money(entry.credit),
                "balance": running,
                # a deleted entry, or the entry that reversed it
                "reversed": group.reversed_by_group_id is not None
                or group.reverses_group_id is not None,
                "group_id": group.id,
            }
        )
    return {
        "account": line or {"key": key, "kind": chart.KIND.get(key, "other"), "group": "system"},
        "date_from": d_from,
        "date_to": d_to,
        "opening": opening,
        "rows": rows[offset : offset + limit],
        "count": len(rows),
        "debit": money(tot_debit),
        "credit": money(tot_credit),
        "closing": running,
        "truncated": truncated,
    }


def flat(g: dict) -> tuple[list[str], list[list]]:
    """for Excel / CSV / the printed page"""
    head = ["Date", "Type", "No.", "Details", "Person", "Debit", "Credit", "Balance"]
    rows: list[list] = [["", "Opening balance", "", "", "", "", "", g["opening"]]]
    for r in g["rows"]:
        rows.append(
            [
                r["date"].isoformat() if r["date"] else "",
                r["type"].replace("_", " ").capitalize() + (" (deleted)" if r["reversed"] else ""),
                r["no"],
                r["memo"],
                r["party_name"] or "",
                r["debit"] or "",
                r["credit"] or "",
                r["balance"],
            ]
        )
    rows.append(["", "Total", "", "", "", g["debit"], g["credit"], ""])
    rows.append(["", "Closing balance", "", "", "", "", "", g["closing"]])
    return head, rows


__all__ = ["Decimal", "accounts", "flat", "ledger"]
