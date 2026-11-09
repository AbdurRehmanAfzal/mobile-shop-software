"""The super admin's bin (owner 2026-11-09, ADR-054): a customer is never really deleted. Moving it
to the bin switches its organisation off (`is_active`), so nobody of theirs can sign in, and it
leaves the shop lists, the provider's figures and the night jobs. Every bill, ledger row and device
event stays as it was; a restore brings the customer back exactly as it was."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Forbidden, ValidationFailed
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.auth import service
from app.modules.auth.models import Shop, User


def _home(db: Session, shop: Shop) -> Shop:
    return (
        db.scalar(
            select(Shop)
            .where(Shop.organisation_id == shop.organisation_id)
            .order_by(Shop.created_at)
        )
        or shop
    )


def _same(a: str, b: str) -> bool:
    return " ".join(a.split()).casefold() == " ".join(b.split()).casefold()


def delete(db: Session, admin: User, shop: Shop, *, confirm_name: str, reason: str | None) -> None:
    org = shop.organisation
    home = _home(db, shop)
    if org.id == admin.organisation_id or any(
        service.is_superuser(u)
        for u in db.scalars(select(User).where(User.organisation_id == org.id))
    ):
        raise Forbidden(
            code="own_shop",
            message_en="Your own shop cannot be deleted",
            message_ur="آپ اپنی دکان ڈیلیٹ نہیں کر سکتے",
        )
    if not org.is_active:
        raise Conflict(
            code="already_deleted",
            message_en="This shop is already in the bin",
            message_ur="یہ دکان پہلے ہی ڈیلیٹ شدہ میں ہے",
        )
    if not (_same(confirm_name, shop.name) or _same(confirm_name, home.name)):
        raise ValidationFailed(
            code="confirm_name",
            message_en="Type the shop's name exactly to delete it",
            message_ur="ڈیلیٹ کرنے کے لیے دکان کا نام بالکل ویسا ہی لکھیں",
        )
    org.is_active = False
    org.deleted_at = utcnow()
    org.deleted_by = admin.id
    org.deleted_reason = (reason or "").strip() or None
    record_audit(
        db,
        shop_id=home.id,
        user_id=admin.id,
        entity="organisation",
        entity_id=org.id,
        action="moved_to_bin",
        after={"reason": org.deleted_reason},
    )
    db.commit()


def restore(db: Session, admin: User, shop: Shop) -> None:
    org = shop.organisation
    if org.is_active:
        raise Conflict(
            code="not_deleted",
            message_en="This shop is not in the bin",
            message_ur="یہ دکان ڈیلیٹ شدہ میں نہیں ہے",
        )
    before = {
        "deleted_at": org.deleted_at.isoformat() if org.deleted_at else None,
        "reason": org.deleted_reason,
    }
    org.is_active = True
    org.deleted_at = None
    org.deleted_by = None
    org.deleted_reason = None
    record_audit(
        db,
        shop_id=_home(db, shop).id,
        user_id=admin.id,
        entity="organisation",
        entity_id=org.id,
        action="restored_from_bin",
        before=before,
    )
    db.commit()
