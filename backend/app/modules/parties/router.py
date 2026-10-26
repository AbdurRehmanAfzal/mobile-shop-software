import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.errors import Forbidden, NotFound
from app.core.permissions import Cap
from app.core.pk import normalise_phone
from app.core.tenancy import DB, Ctx, CurrentContext, get_current_context
from app.modules.parties import service
from app.modules.parties.models import PartyKind
from app.modules.parties.schemas import PartyCreate, PartyOut, PartyUpdate

router = APIRouter(prefix="/api/v1/parties", tags=["parties"])


def _can_write(ctx: Annotated[CurrentContext, Depends(get_current_context)]) -> CurrentContext:
    if not (ctx.can(Cap.TRANSACT) or ctx.can(Cap.REPAIR_CREATE)):
        raise Forbidden()
    return ctx


Writer = Annotated[CurrentContext, Depends(_can_write)]


@router.get("", response_model=list[PartyOut])
def list_parties(
    ctx: Ctx,
    db: DB,
    kind: PartyKind | None = None,
    q: str | None = Query(default=None, min_length=1, max_length=60),
    with_balance: bool = False,
    include_inactive: bool = False,
    limit: int = Query(default=100, le=500),
):
    return service.list_parties(
        db,
        ctx.shop_id,
        kind=kind,
        q=q,
        with_balance=with_balance,
        include_inactive=include_inactive,
        limit=limit,
    )


@router.post("", response_model=PartyOut, status_code=201)
def create_party(data: PartyCreate, ctx: Writer, db: DB):
    return service.create_party(db, ctx.shop_id, ctx.id, data)


@router.get("/by-phone/{phone}", response_model=PartyOut)
def party_by_phone(phone: str, ctx: Ctx, db: DB):
    try:
        normalised = normalise_phone(phone)
    except ValueError as exc:
        raise NotFound(code="party_not_found") from exc
    party = service.by_phone(db, ctx.shop_id, normalised)
    if party is None:
        raise NotFound(
            code="party_not_found", message_en="Party not found", message_ur="کھاتہ نہیں ملا"
        )
    return party


@router.get("/{party_id}", response_model=PartyOut)
def get_party(party_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.get_party(db, ctx.shop_id, party_id)


@router.patch("/{party_id}", response_model=PartyOut)
def update_party(party_id: uuid.UUID, data: PartyUpdate, ctx: Writer, db: DB):
    return service.update_party(db, ctx.shop_id, ctx.id, party_id, data)


class DeletedOut(BaseModel):
    result: str  # "delete" (gone) or "archive" (hidden, history kept)


@router.delete("/{party_id}", response_model=DeletedOut)
def delete_party(party_id: uuid.UUID, ctx: Writer, db: DB):
    return {"result": service.delete_party(db, ctx.shop_id, ctx, party_id)}
