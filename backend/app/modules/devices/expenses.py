"""Money spent on one unit after it was bought (owner 2026-11-25, mock-ups 17 / 20 "Added expenses"):
a screen guard, a part, a cleaning, a courier — paid from a cash account and added to that unit's
cost, so its true net cost and its profit at sale are right.

The posting is the one a repair of the shop's own phone already makes (`repair_cost`): the stock
(inventory, on this unit) up, the cash account down, and the unit's `cost_price` up by the same.
A sale then books it as cost of goods sold with the rest of the unit's cost (ADR-048: every cost
reaches a profit report). An expense is undone by a reversing entry with a reason, while the unit
is still the shop's (ADR-099: a delete undoes only its own effect) — never edited in place.

`unit_costs` lists what was added to a unit from the ledger itself: these expenses and the repair
costs (`repair_cost`, `repair_lab`), each with whether it was undone."""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import ZERO
from app.modules.audit.service import record_audit
from app.modules.devices.models import DeviceEvent
from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import EventType
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount, LedgerEntry, LedgerGroup
from app.modules.ledger.service import Posting, default_cash_account, money, post, reverse

KINDS = ("parts", "screen_guard", "cleaning", "transport", "software", "other")
# a unit is the shop's while it is in one of these; an expense is added or undone only then
OWNED = ("in_stock", "faulty", "in_repair", "on_loan", "with_customer_for_approval")
ADDED_DOCS = ("unit_expense", "repair_cost", "repair_lab")


def _owned(device) -> None:
    if device.status not in OWNED:
        raise Conflict(
            code="unit_not_owned",
            message_en="This unit is no longer in the shop",
            message_ur="یہ سیٹ اب دکان میں نہیں",
        )


def add_expense(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    device_id: uuid.UUID,
    *,
    amount: Decimal,
    kind: str,
    note: str | None = None,
    cash_account_id: uuid.UUID | None = None,
) -> dict:
    device = get_device(db, shop_id, device_id)
    _owned(device)
    amount = money(amount)
    if amount <= ZERO:
        raise ValidationFailed(
            code="amount_required", message_en="Enter the amount", message_ur="رقم لکھیں"
        )
    if kind not in KINDS:
        raise ValidationFailed(code="kind_invalid")
    cash = (
        db.get(CashAccount, cash_account_id)
        if cash_account_id
        else default_cash_account(db, shop_id)
    )
    if cash is None or cash.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")
    memo = f"{device.imei1}: {kind}" + (f" — {note}" if note else "")
    posting = Posting(document_type="unit_expense", document_id=device.id, memo=memo)
    posting.debit(acc.SysAccount.INVENTORY, amount, device_id=device.id, memo=memo).credit(
        acc.cash_account(cash.id), amount, memo=memo
    )
    group = post(db, shop_id, user_id, posting)
    before = money(device.cost_price or ZERO)
    device.cost_price = money(before + amount)
    apply_event(
        db,
        shop_id,
        user_id,
        device,
        EventType.COST_ADDED,
        amount=amount,
        ledger_group_id=group.id,
        document_type="unit_expense",
        document_id=group.id,
        data={"kind": kind, "note": note, "from": str(before), "to": str(device.cost_price)},
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="device",
        entity_id=device.id,
        action="expense_add",
        after={"amount": str(amount), "kind": kind, "group": str(group.id)},
    )
    db.commit()
    return {"group_id": group.id, "amount": amount, "cost_price": device.cost_price}


def undo_expense(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    device_id: uuid.UUID,
    group_id: uuid.UUID,
    reason: str,
) -> dict:
    device = get_device(db, shop_id, device_id)
    _owned(device)
    group = db.get(LedgerGroup, group_id)
    if group is None or group.shop_id != shop_id or group.document_type != "unit_expense":
        raise NotFound(code="expense_not_found")
    if group.document_id != device.id:
        raise NotFound(code="expense_not_found")
    if len((reason or "").strip()) < 3:
        raise ValidationFailed(
            code="reason_required", message_en="Write why", message_ur="وجہ لکھیں"
        )
    amount = money(
        sum(
            (
                e.debit
                for e in group.entries
                if e.account == acc.SysAccount.INVENTORY and e.device_id == device.id
            ),
            ZERO,
        )
    )
    rev = reverse(db, shop_id, user_id, group.id, reason.strip())
    before = money(device.cost_price or ZERO)
    device.cost_price = money(before - amount)
    apply_event(
        db,
        shop_id,
        user_id,
        device,
        EventType.CORRECTED,
        amount=device.cost_price,
        ledger_group_id=rev.id,
        document_type="unit_expense",
        document_id=group.id,
        data={
            "field": "expense",
            "from": str(before),
            "to": str(device.cost_price),
            "reason": reason.strip(),
        },
    )
    db.commit()
    return {"group_id": rev.id, "cost_price": device.cost_price}


def unit_costs(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID) -> list[dict]:
    """everything added to this unit's cost after its purchase, from the ledger (oldest first)"""
    rows = db.execute(
        select(LedgerEntry, LedgerGroup)
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(
            LedgerEntry.shop_id == shop_id,
            LedgerEntry.device_id == device_id,
            LedgerEntry.account == acc.SysAccount.INVENTORY,
            LedgerEntry.debit > 0,
            LedgerGroup.document_type.in_(ADDED_DOCS),
        )
        .order_by(LedgerGroup.at)
    ).all()
    kinds = {
        ev.ledger_group_id: (ev.data or {})
        for ev in db.scalars(
            select(DeviceEvent).where(
                DeviceEvent.device_id == device_id, DeviceEvent.type == EventType.COST_ADDED
            )
        ).all()
    }
    out = []
    for e, g in rows:
        data = kinds.get(g.id, {})
        out.append(
            {
                "group_id": g.id,
                "at": g.at,
                "source": g.document_type,  # unit_expense | repair_cost | repair_lab
                "document_id": g.document_id,
                "kind": data.get("kind"),
                "note": data.get("note") or (g.memo if g.document_type != "unit_expense" else None),
                "amount": money(e.debit),
                "undone": g.reversed_by_group_id is not None,
            }
        )
    return out
