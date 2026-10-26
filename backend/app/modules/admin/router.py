"""Super admin (the product owner): every customer shop, and opening a new one.

Owner (2026-10-26): shops are not self-service; only the product owner creates them. Super users are
the mobile numbers in SUPERUSER_PHONES.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.errors import Forbidden
from app.core.permissions import Role
from app.core.tenancy import DB, CurrentUser, get_current_user
from app.modules.auth import service
from app.modules.auth.models import Shop, User
from app.modules.auth.schemas import SignupRequest

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _super(current: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if not service.is_superuser(current.user):
        raise Forbidden(
            code="superuser_only",
            message_en="Only the product owner can do this",
            message_ur="یہ صرف پروڈکٹ کا مالک کر سکتا ہے",
        )
    return current


Super = Annotated[CurrentUser, Depends(_super)]


class AdminShopOut(BaseModel):
    id: str
    name: str
    city: str | None
    owner_name: str | None
    owner_phone: str | None
    users: int
    created_at: datetime


def _rows(db, shops: list[Shop]) -> list[AdminShopOut]:
    out = []
    for s in shops:
        owner = db.scalar(
            select(User)
            .where(User.organisation_id == s.organisation_id, User.role == Role.OWNER)
            .order_by(User.created_at)
        )
        users = db.scalar(
            select(func.count(User.id)).where(User.organisation_id == s.organisation_id)
        )
        out.append(
            AdminShopOut(
                id=str(s.id),
                name=s.name,
                city=s.city,
                owner_name=owner.name if owner else None,
                owner_phone=owner.phone if owner else None,
                users=users or 0,
                created_at=s.created_at,
            )
        )
    return out


@router.get("/shops", response_model=list[AdminShopOut])
def list_shops(_: Super, db: DB, q: str | None = None):
    stmt = select(Shop).order_by(Shop.created_at.desc())
    if q:
        stmt = stmt.where(Shop.name.ilike(f"%{q}%"))
    return _rows(db, list(db.scalars(stmt).all()))


@router.post("/shops", response_model=AdminShopOut, status_code=201)
def create_shop(data: SignupRequest, current: Super, db: DB):
    """Open a shop for a customer: their shop name and their own owner login (phone + password)."""
    user = service.create_shop_with_owner(db, data, created_by=current.id)
    shop = db.scalar(select(Shop).where(Shop.organisation_id == user.organisation_id))
    return _rows(db, [shop])[0]
