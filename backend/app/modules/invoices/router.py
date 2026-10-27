import datetime as dt

from fastapi import APIRouter, Query

from app.core.errors import ValidationFailed
from app.core.tenancy import DB, Ctx
from app.modules.invoices import service
from app.modules.invoices.schemas import DocumentList, Kind, State

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


@router.get("", response_model=DocumentList)
def list_documents(
    ctx: Ctx,
    db: DB,
    kind: Kind | None = None,
    q: str | None = Query(default=None, max_length=60),
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    state: State | None = None,
    limit: int = Query(default=100, ge=1, le=300),
):
    """All bills (sales, purchases, returns, repairs) in one list, newest first."""
    if date_from and date_to and date_from > date_to:
        raise ValidationFailed(
            code="bad_date_range",
            message_en="The 'from' date must be on or before the 'to' date",
            message_ur="شروع کی تاریخ آخری تاریخ سے پہلے ہونی چاہیے",
        )
    rows = service.list_documents(
        db,
        ctx.shop_id,
        ctx,
        kind=kind,
        q=q,
        date_from=date_from,
        date_to=date_to,
        state=state,
        limit=limit,
    )
    return {"rows": rows, **service.totals(rows)}
