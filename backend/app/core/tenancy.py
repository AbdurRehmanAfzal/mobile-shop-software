"""Request context: current user, organisation and active shop.

Every tenant-scoped endpoint depends on `CurrentContext`. The shop comes from the
`X-Shop-Id` header; if absent and the user has exactly one shop, that shop is used.
A user can never act in a shop they are not assigned to.
"""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Forbidden, Unauthorized
from app.core.permissions import Cap, Role, role_has
from app.core.security import decode_token
from app.db.session import get_db
from app.modules.auth.models import Shop, User, UserShop

_bearer = HTTPBearer(auto_error=False)


@dataclass(slots=True)
class CurrentUser:
    user: User

    @property
    def id(self) -> uuid.UUID:
        return self.user.id

    @property
    def organisation_id(self) -> uuid.UUID:
        return self.user.organisation_id

    @property
    def role(self) -> Role:
        return Role(self.user.role)


@dataclass(slots=True)
class CurrentContext(CurrentUser):
    shop: Shop

    @property
    def shop_id(self) -> uuid.UUID:
        return self.shop.id

    def can(self, cap: Cap) -> bool:
        return role_has(self.role, cap)

    def require(self, cap: Cap) -> None:
        if not self.can(cap):
            raise Forbidden()


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> CurrentUser:
    if creds is None:
        raise Unauthorized()
    payload = decode_token(creds.credentials, "access")
    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise Unauthorized(code="user_inactive")
    return CurrentUser(user=user)


def get_current_context(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    x_shop_id: Annotated[str | None, Header(alias="X-Shop-Id")] = None,
) -> CurrentContext:
    assigned = db.scalars(
        select(Shop)
        .join(UserShop, UserShop.shop_id == Shop.id)
        .where(UserShop.user_id == current.id, Shop.is_active.is_(True))
        .order_by(Shop.created_at)
    ).all()
    if not assigned:
        raise Forbidden(
            code="no_shop", message_en="No shop assigned", message_ur="کوئی دکان منسلک نہیں"
        )

    if x_shop_id is None:
        if len(assigned) == 1:
            return CurrentContext(user=current.user, shop=assigned[0])
        raise Forbidden(
            code="shop_required",
            message_en="Select a shop (X-Shop-Id header)",
            message_ur="دکان منتخب کریں",
        )
    try:
        wanted = uuid.UUID(x_shop_id)
    except ValueError as exc:
        raise Forbidden(code="shop_invalid") from exc
    for shop in assigned:
        if shop.id == wanted:
            return CurrentContext(user=current.user, shop=shop)
    # Deliberately the same error whether the shop exists or not: no enumeration.
    raise Forbidden(
        code="shop_forbidden",
        message_en="Shop not accessible",
        message_ur="یہ دکان قابلِ رسائی نہیں",
    )


def require_cap(cap: Cap):
    def _dep(ctx: Annotated[CurrentContext, Depends(get_current_context)]) -> CurrentContext:
        ctx.require(cap)
        return ctx

    return _dep


Ctx = Annotated[CurrentContext, Depends(get_current_context)]
DB = Annotated[Session, Depends(get_db)]
