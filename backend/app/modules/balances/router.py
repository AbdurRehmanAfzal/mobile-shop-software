from typing import Annotated, Literal

from fastapi import APIRouter, Depends

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.balances import service
from app.modules.units.router import _plain

router = APIRouter(prefix="/api/v1/balances", tags=["balances"])
# what the shop owes dealers is the cost of its stock: owner / manager only (ADR-058)
Owner = Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))]


@router.get("")
def open_balances(
    ctx: Owner,
    db: DB,
    view: Literal["imei", "customer", "dealer", "technician"] = "imei",
    q: str | None = None,
    direction: Literal["get", "give"] | None = None,
):
    """Lena hai / dena hai by phone, customer, dealer or technician, with the bills behind it"""
    return _plain(
        service.grouped(db, ctx.shop_id, view=view, q=q, direction=direction, can_cost=True)
    )
