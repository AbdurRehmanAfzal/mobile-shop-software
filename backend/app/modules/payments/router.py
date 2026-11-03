import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.idempotency import IdemKey
from app.core.idempotency import run as idempotent
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.notifications import jobs
from app.modules.notifications.models import Message
from app.modules.notifications.schemas import MessageOut
from app.modules.payments import lending_due as lending_due_mod
from app.modules.payments import service
from app.modules.payments.models import PaymentDirection, PaymentPurpose
from app.modules.payments.schemas import (
    DueDateIn,
    LendingDueRow,
    PartyLendingOut,
    PaymentCreate,
    PaymentOut,
    SettleOut,
    VoidIn,
)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=PaymentOut, status_code=201)
def create(data: PaymentCreate, ctx: Transact, db: DB, idem: IdemKey = None):
    return idempotent(
        db,
        ctx.shop_id,
        idem,
        "payments",
        lambda: service.to_out(db, service.create_payment(db, ctx.shop_id, ctx.id, data)),
    )


@router.get("", response_model=list[PaymentOut])
def list_payments(
    ctx: Transact,
    db: DB,
    party_id: uuid.UUID | None = None,
    direction: PaymentDirection | None = None,
    purpose: PaymentPurpose | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    limit: int = Query(default=100, le=500),
):
    rows = service.list_payments(
        db,
        ctx.shop_id,
        party_id=party_id,
        direction=direction,
        purpose=purpose,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    return [service.to_out(db, p) for p in rows]


@router.get("/lending/{party_id}", response_model=PartyLendingOut)
def party_lending(party_id: uuid.UUID, ctx: Transact, db: DB):
    """A person's len-den (docs/32): what is still open, the part of the khata from bills, the
    entries, and what could be adjusted against their open bills."""
    return service.party_lending(db, ctx.shop_id, party_id)


@router.get("/lending-due", response_model=list[LendingDueRow])
def lending_due(ctx: Transact, db: DB):
    """Everyone whose open len-den has a return date, earliest first (docs/32 §7)."""
    return lending_due_mod.due_rows(db, ctx.shop_id)


@router.post("/lending/{party_id}/remind", response_model=MessageOut)
def lending_remind(party_id: uuid.UUID, ctx: Transact, db: DB):
    """A WhatsApp reminder to a person who owes len-den; sent at once with the Cloud API, otherwise
    it carries its wa.me link."""
    msg = lending_due_mod.remind(db, ctx.shop, ctx.id, party_id)
    mid = msg.id
    jobs.dispatch(db)
    return db.get(Message, mid)


@router.patch("/{payment_id}/due-date", response_model=PaymentOut)
def set_due_date(payment_id: uuid.UUID, data: DueDateIn, ctx: Transact, db: DB):
    p = lending_due_mod.set_due_date(db, ctx.shop_id, ctx.id, payment_id, data.due_date)
    return service.to_out(db, p)


@router.post("/settle/{party_id}", response_model=SettleOut)
def settle(party_id: uuid.UUID, ctx: Transact, db: DB):
    return service.settle(db, ctx.shop_id, ctx.id, party_id)


@router.get("/{payment_id}", response_model=PaymentOut)
def get(payment_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(db, service.get_payment(db, ctx.shop_id, payment_id))


@router.post("/{payment_id}/void", response_model=PaymentOut)
def void(payment_id: uuid.UUID, data: VoidIn, ctx: Ctx, db: DB):
    return service.to_out(db, service.void_payment(db, ctx.shop_id, ctx, payment_id, data.reason))
