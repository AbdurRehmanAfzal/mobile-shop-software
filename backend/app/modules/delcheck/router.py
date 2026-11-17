import logging
import uuid
from typing import Literal

from fastapi import APIRouter

from app.core.tenancy import DB, Ctx
from app.modules.delcheck import service
from app.modules.shopaudit.router import plain

router = APIRouter(prefix="/api/v1/delete-check", tags=["delete-check"])
log = logging.getLogger(__name__)
Kind = Literal[
    "sale",
    "purchase",
    "repair",
    "payment",
    "lending",
    "expense",
    "exchange",
    "saleReturn",
    "purchaseReturn",
]


@router.get("/{kind}/{doc_id}")
def delete_check(kind: Kind, doc_id: uuid.UUID, ctx: Ctx, db: DB):
    """owner 2026-11-19 (ADR-100): what must be undone before this entry can be deleted, each
    with the screen for it. Read-only. If the check itself fails it answers "nothing known" —
    the delete's own checks still stand, so a fault here can never let a wrong delete through
    nor stop a right one."""
    try:
        return plain(service.check(db, ctx.shop_id, kind, doc_id))
    except Exception:  # a helper for the screen: never an error of its own
        log.exception("delete-check failed for %s %s", kind, doc_id)
        db.rollback()
        return {"ok": True, "blockers": []}
