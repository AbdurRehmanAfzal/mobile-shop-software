import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.expenses import service
from app.modules.expenses.schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    DayCloseIn,
    DayCloseOut,
    DayPreviewOut,
    ExpenseCreate,
    ExpenseOut,
    VoidIn,
)

router = APIRouter(prefix="/api/v1/expenses", tags=["expenses"])
Exp = Annotated[Ctx, Depends(require_cap(Cap.EXPENSES))]


@router.get("/categories", response_model=list[CategoryOut])
def categories(ctx: Ctx, db: DB):
    return service.list_categories(db, ctx.shop_id)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryCreate, ctx: Exp, db: DB):
    return service.create_category(db, ctx.shop_id, ctx.id, data)


@router.get("", response_model=list[ExpenseOut])
def list_expenses(
    ctx: Exp,
    db: DB,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    category_id: uuid.UUID | None = None,
    limit: int = Query(default=100, le=500),
):
    return [
        service.to_out(db, e)
        for e in service.list_expenses(
            db,
            ctx.shop_id,
            date_from=date_from,
            date_to=date_to,
            category_id=category_id,
            limit=limit,
        )
    ]


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(data: ExpenseCreate, ctx: Exp, db: DB):
    return service.to_out(db, service.create_expense(db, ctx.shop_id, ctx.id, data))


@router.get("/day-close/preview", response_model=DayPreviewOut)
def day_preview(
    ctx: Exp, db: DB, cash_account_id: uuid.UUID | None = None, date: dt.date | None = None
):
    return service.day_preview(db, ctx.shop_id, cash_account_id, date)


@router.post("/day-close", response_model=DayCloseOut, status_code=201)
def close_day(data: DayCloseIn, ctx: Exp, db: DB):
    return service.close_day(db, ctx.shop_id, ctx.id, data)


@router.get("/day-close", response_model=list[DayCloseOut])
def day_closes(ctx: Exp, db: DB, limit: int = Query(default=60, le=365)):
    return service.list_day_closes(db, ctx.shop_id, limit)


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: uuid.UUID, ctx: Exp, db: DB):
    return service.to_out(db, service.get_expense(db, ctx.shop_id, expense_id))


@router.post("/{expense_id}/void", response_model=ExpenseOut)
def void(expense_id: uuid.UUID, data: VoidIn, ctx: Exp, db: DB):
    return service.to_out(db, service.void_expense(db, ctx.shop_id, ctx, expense_id, data.reason))


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: uuid.UUID, data: CategoryUpdate, ctx: Exp, db: DB):
    return service.update_category(db, ctx.shop_id, ctx.id, category_id, data.name)


@router.delete("/categories/{category_id}")
def delete_category(category_id: uuid.UUID, ctx: Exp, db: DB):
    return {"result": service.delete_category(db, ctx.shop_id, ctx.id, category_id)}


@router.put("/{expense_id}", response_model=ExpenseOut)
def edit_expense(expense_id: uuid.UUID, data: ExpenseCreate, ctx: Exp, db: DB):
    return service.to_out(db, service.edit_expense(db, ctx.shop_id, ctx, expense_id, data))
