import uuid

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from app.core.errors import ValidationFailed
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx
from app.modules.labels import service
from app.modules.labels.service import DEFAULT_FIELDS, FIELDS, SIZES

router = APIRouter(prefix="/api/v1/labels", tags=["labels"])


def _ids(ids: str) -> list[uuid.UUID]:
    try:
        out = [uuid.UUID(x) for x in ids.split(",") if x.strip()]
    except ValueError as err:
        raise ValidationFailed(code="bad_ids") from err
    if not out or len(out) > 200:
        raise ValidationFailed(code="bad_ids")
    return out


@router.get("/options")
def options():
    return {"sizes": list(SIZES), "fields": list(FIELDS), "default_fields": list(DEFAULT_FIELDS)}


@router.get("/devices", response_class=HTMLResponse)
def device_labels(
    ctx: Ctx,
    db: DB,
    ids: str = Query(min_length=36),
    size: str = Query(default="50x30"),
    w: float | None = None,
    h: float | None = None,
    fields: str | None = None,
    copies: int = Query(default=1, ge=1, le=50),
    lang: str | None = Query(default=None, pattern="^(en|ur)$"),
):
    return service.devices_html(
        db,
        ctx.shop_id,
        _ids(ids),
        size=size,
        w=w,
        h=h,
        fields=fields,
        copies=copies,
        lang=lang,
        can_cost=ctx.can(Cap.VIEW_COST),
    )


@router.get("/items", response_class=HTMLResponse)
def item_labels(
    ctx: Ctx,
    db: DB,
    ids: str = Query(min_length=36),
    size: str = Query(default="38x25"),
    w: float | None = None,
    h: float | None = None,
    fields: str | None = None,
    copies: int = Query(default=1, ge=1, le=100),
    lang: str | None = Query(default=None, pattern="^(en|ur)$"),
):
    return service.items_html(
        db,
        ctx.shop_id,
        _ids(ids),
        size=size,
        w=w,
        h=h,
        fields=fields,
        copies=copies,
        lang=lang,
        can_cost=ctx.can(Cap.VIEW_COST),
    )
