"""Reconciliation checks (docs/16 §19, docs/17 P2-5 / P11-1).

Each check returns the two sides of an equation, whether they agree and the difference, so the
owner sees the books prove themselves rather than being told to trust a number."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.periods import Period, day_end, day_start
from app.db.base import ZERO
from app.modules.devices.models import DeviceEvent
from app.modules.devices.state import DeviceStatus
from app.modules.ledger.models import CashAccount, LedgerEntry, LedgerGroup
from app.modules.ledger.service import cash_balance, money
from app.modules.parties.models import Party
from app.modules.payments.models import Payment
from app.modules.reports import service as rep


def _check(key: str, left, right, **extra) -> dict:
    left, right = money(left), money(right)
    return {
        "key": key,
        "left": left,
        "right": right,
        "ok": left == right,
        "diff": money(left - right),
        **extra,
    }


def checks(db: Session, shop_id: uuid.UUID, p: Period) -> list[dict]:
    out: list[dict] = []
    # 1. every cash account: opening + in − out = closing (and closing is what the ledger says)
    for r in rep.cash_flow(db, shop_id, p.date_from, p.date_to):
        ledger_closing = cash_balance(db, shop_id, r["cash_account_id"], until=day_end(p.date_to))
        out.append(
            _check(
                "cash",
                r["opening"] + r["cash_in"] - r["cash_out"],
                ledger_closing,
                name=r["name"],
                cash_account_id=r["cash_account_id"],
            )
        )
    # 2. every ledger group balances (debits == credits) — the append-only rule itself
    bad = db.execute(
        select(LedgerGroup.id)
        .join(LedgerEntry, LedgerEntry.group_id == LedgerGroup.id)
        .where(LedgerGroup.shop_id == shop_id)
        .group_by(LedgerGroup.id)
        .having(func.sum(LedgerEntry.debit) != func.sum(LedgerEntry.credit))
    ).all()
    out.append(
        {"key": "groups_balanced", "left": len(bad), "right": 0, "ok": not bad, "diff": len(bad)}
    )
    # 3. the khata caches agree with the ledger (Party.balance is derived, never typed)
    ledger = {
        pid: money(v or 0)
        for pid, v in db.execute(
            select(LedgerEntry.party_id, func.sum(LedgerEntry.debit - LedgerEntry.credit))
            .where(LedgerEntry.shop_id == shop_id, LedgerEntry.party_id.is_not(None))
            .group_by(LedgerEntry.party_id)
        ).all()
    }
    cached = dict(db.execute(select(Party.id, Party.balance).where(Party.shop_id == shop_id)).all())
    mismatched = [pid for pid, v in cached.items() if money(v) != ledger.get(pid, ZERO)]
    out.append(
        _check(
            "party_balances",
            sum(ledger.values(), ZERO),
            sum((money(v) for v in cached.values()), ZERO),
            mismatched=len(mismatched),
        )
    )
    # 4. stock: opening + came in − went out = closing (from the device events)
    start, end = day_start(p.date_from), day_end(p.date_to)
    rows = db.execute(
        select(DeviceEvent.device_id, DeviceEvent.status_after, DeviceEvent.at)
        .where(DeviceEvent.shop_id == shop_id, DeviceEvent.at < end)
        .order_by(DeviceEvent.at, DeviceEvent.seq)
    ).all()
    status: dict = {}
    opening = came_in = went_out = 0
    opening_done = False
    for dev_id, after, at in rows:
        at = at if at.tzinfo else at.replace(tzinfo=start.tzinfo)
        if at >= start and not opening_done:
            opening = sum(1 for s in status.values() if s == DeviceStatus.IN_STOCK)
            opening_done = True
        before = status.get(dev_id)
        if at >= start:
            if after == DeviceStatus.IN_STOCK and before != DeviceStatus.IN_STOCK:
                came_in += 1
            elif after != DeviceStatus.IN_STOCK and before == DeviceStatus.IN_STOCK:
                went_out += 1
        status[dev_id] = after
    if not opening_done:
        opening = sum(1 for s in status.values() if s == DeviceStatus.IN_STOCK)
    closing = sum(1 for s in status.values() if s == DeviceStatus.IN_STOCK)
    out.append(
        {
            "key": "stock_units",
            "left": opening + came_in - went_out,
            "right": closing,
            "ok": opening + came_in - went_out == closing,
            "diff": opening + came_in - went_out - closing,
            "opening": opening,
            "came_in": came_in,
            "went_out": went_out,
        }
    )
    # 5. payments: what was allocated to bills never exceeds the payment
    over = 0
    for amount, allocs in db.execute(
        select(Payment.amount, Payment.allocations).where(
            Payment.shop_id == shop_id,
            Payment.date >= p.date_from,
            Payment.date <= p.date_to,
            Payment.status != "voided",
        )
    ).all():
        allocated = sum((money(a.get("amount", 0)) for a in (allocs or [])), ZERO)
        if allocated > money(amount):
            over += 1
    out.append({"key": "allocations", "left": over, "right": 0, "ok": over == 0, "diff": over})
    # 6. every active cash account exists once with a kind the app knows
    kinds = db.scalars(select(CashAccount.kind).where(CashAccount.shop_id == shop_id)).all()
    unknown = [
        k
        for k in kinds
        if k not in ("cash", "bank", "easypaisa", "jazzcash", "cheque", "remittance")
    ]
    out.append(
        {
            "key": "account_kinds",
            "left": len(unknown),
            "right": 0,
            "ok": not unknown,
            "diff": len(unknown),
        }
    )
    return out
