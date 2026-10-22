import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.ledger import service
from app.modules.ledger.schemas import (
    CashAccountCreate,
    CashAccountOut,
    CashBookOut,
    CashBookRow,
    EntryOut,
    GroupOut,
    OpeningBalanceRequest,
    ReverseRequest,
    StatementOut,
)

router = APIRouter(prefix="/api/v1/ledger", tags=["ledger"])

Settings = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))]
Void = Annotated[Ctx, Depends(require_cap(Cap.VOID))]
Cost = Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))]


def _group_out(g) -> GroupOut:
    return GroupOut(
        id=g.id,
        document_type=g.document_type,
        document_id=g.document_id,
        memo=g.memo,
        posted_by=g.posted_by,
        at=g.at,
        reverses_group_id=g.reverses_group_id,
        reversed_by_group_id=g.reversed_by_group_id,
        entries=[
            EntryOut(
                id=e.id,
                seq=e.seq,
                account=e.account,
                party_id=e.party_id,
                cash_account_id=e.cash_account_id,
                device_id=e.device_id,
                debit=e.debit,
                credit=e.credit,
                memo=e.memo,
            )
            for e in g.entries
        ],
    )


@router.get("/accounts", response_model=list[CashAccountOut])
def accounts(ctx: Ctx, db: DB):
    service.ensure_default_cash_account(db, ctx.shop_id)
    db.commit()
    return service.list_cash_accounts(db, ctx.shop_id)


@router.post("/accounts", response_model=CashAccountOut, status_code=201)
def create_account(data: CashAccountCreate, ctx: Settings, db: DB):
    return service.create_cash_account(db, ctx.shop_id, ctx.id, data)


@router.get("/accounts/{account_id}/book", response_model=CashBookOut)
def cash_book(
    account_id: uuid.UUID,
    ctx: Cost,
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
):
    book = service.cash_book(db, ctx.shop_id, account_id, date_from, date_to)
    book["rows"] = [CashBookRow(**{**r, "in": r.pop("in_")}) for r in book["rows"]]
    return book


@router.get("/parties/{party_id}/statement", response_model=StatementOut)
def statement(
    party_id: uuid.UUID,
    ctx: Ctx,
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
):
    return service.party_statement(db, ctx.shop_id, party_id, date_from, date_to)


@router.post("/parties/{party_id}/opening-balance", response_model=GroupOut, status_code=201)
def opening_balance(party_id: uuid.UUID, data: OpeningBalanceRequest, ctx: Void, db: DB):
    g = service.post_party_opening_balance(
        db, ctx.shop_id, ctx.id, party_id, data.amount, data.party_owes, data.memo
    )
    return _group_out(g)


@router.get("/groups/{group_id}", response_model=GroupOut)
def group(group_id: uuid.UUID, ctx: Cost, db: DB):
    return _group_out(service.get_group(db, ctx.shop_id, group_id))


@router.post("/groups/{group_id}/reverse", response_model=GroupOut, status_code=201)
def reverse(group_id: uuid.UUID, data: ReverseRequest, ctx: Void, db: DB):
    g = service.reverse(db, ctx.shop_id, ctx.id, group_id, data.reason)
    db.commit()
    return _group_out(g)
