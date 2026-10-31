"""Barcode settings, lookup (scanner), stock count, backfill, a test label, rendering."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from app.core.errors import ValidationFailed
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.barcodes import codes, service

router = APIRouter(prefix="/api/v1/barcodes", tags=["barcodes"])
Owner = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))]


class PrefsIn(BaseModel):
    type: str | None = None
    prefix: str | None = Field(default=None, max_length=6)
    value_mode: str | None = None
    pad: int | None = Field(default=None, ge=4, le=10)
    start_number: int | None = Field(default=None, ge=1)


class CountIn(BaseModel):
    codes: list[str] = Field(min_length=0, max_length=5000)


class CheckIn(BaseModel):
    value: str = Field(min_length=1, max_length=200)
    type: str | None = None


@router.get("/settings")
def get_settings(ctx: Owner, db: DB):
    shop = ctx.shop
    value, kind = service.preview_value(shop)
    return {
        **service.prefs_for(shop),
        "next_value": value,
        "next_type": kind,
        "seq": shop.barcode_seq or 0,
        "types": [{"key": k, "label": codes.LABELS[k]} for k in codes.TYPES],
    }


@router.patch("/settings")
def patch_settings(data: PrefsIn, ctx: Owner, db: DB):
    service.set_prefs(db, ctx.shop, ctx.user.id, data.model_dump(exclude_none=True))
    return get_settings(ctx, db)


@router.post("/check")
def check(data: CheckIn, ctx: Ctx, db: DB):
    """Can this value be a barcode of this type, and is it free? (the purchase form asks)"""
    kind = data.type or service.prefs_for(ctx.shop)["type"]
    try:
        value = codes.normalise(kind, service.clean(data.value))
    except ValueError as exc:
        en, ur = codes.REASONS.get(str(exc), codes.REASONS["type"])
        return {
            "ok": False,
            "value": service.clean(data.value),
            "type": kind,
            "reason": str(exc),
            "message_en": en,
            "message_ur": ur,
        }
    who = service.taken(db, ctx.shop_id, value)
    return {"ok": who is None, "value": value, "type": kind, "taken_by": who}


@router.get("/lookup")
def lookup(ctx: Ctx, db: DB, code: str = Query(min_length=1, max_length=200)):
    """What a scanner read: our barcode, IMEI 1 / 2, SKU or a manufacturer code."""
    return service.lookup_out(db, ctx.shop_id, code, ctx.can(Cap.VIEW_COST))


@router.post("/count")
def count(data: CountIn, ctx: Ctx, db: DB):
    return service.stock_count(db, ctx.shop_id, data.codes)


@router.post("/backfill")
def backfill(ctx: Owner, db: DB):
    return service.backfill(db, ctx.shop, ctx.user.id)


@router.get("/render/{kind}", response_class=Response)
def render(
    kind: str,
    value: str = Query(min_length=1, max_length=200),
    fmt: str = Query(default="svg", pattern="^(svg|png)$"),
):
    """One barcode as SVG or PNG (public: it only encodes the value you pass)."""
    if kind not in codes.TYPES:
        raise ValidationFailed(code="barcode_type")
    try:
        v = codes.normalise(kind, value)
    except ValueError as exc:
        en, ur = codes.REASONS.get(str(exc), codes.REASONS["type"])
        raise ValidationFailed(code="barcode_value", message_en=en, message_ur=ur) from exc
    if fmt == "png":
        return Response(content=codes.png(kind, v), media_type="image/png")
    return Response(content=codes.svg(kind, v), media_type="image/svg+xml")


@router.get("/test-label", response_class=HTMLResponse)
def test_label(
    ctx: Ctx,
    db: DB,
    size: str = Query(default="50x30"),
    w: float | None = None,
    h: float | None = None,
    type: str | None = None,
    lang: str | None = Query(default=None, pattern="^(en|ur)$"),
):
    """A sample label with the next value the shop would get (no number is used up): print it,
    then scan it into the Test scan box."""
    from app.modules.labels import service as labels

    shop = ctx.shop
    value, kind = service.preview_value(shop)
    if type in codes.TYPES and codes.can_encode(type, value):
        kind = type
    ur = (lang or shop.default_locale) == "ur"
    lw, lh, sheet = labels._size(size, w, h)
    parts = {
        "shop": shop.name_ur if ur and shop.name_ur else shop.name,
        "shop_ur": bool(ur and shop.name_ur),
        "name": "Test label" if not ur else "ٹیسٹ لیبل",
        "specs": codes.LABELS[kind],
        "price": "Rs. 1,000",
        "code": "",
        "barcode": value,
        "barcode_type": kind,
        "condition": "",
        "pta": "",
        "date": "",
        "last4": value[-4:],
    }
    lab = labels._label(parts, set(labels.DEFAULT_FIELDS) | {"barcode", "imei"}, ur)
    return labels._page([lab], lw, lh, sheet, ur, "test-label")


def _ids(ids: str) -> list[uuid.UUID]:
    try:
        return [uuid.UUID(x) for x in ids.split(",") if x.strip()]
    except ValueError as err:
        raise ValidationFailed(code="bad_ids") from err
