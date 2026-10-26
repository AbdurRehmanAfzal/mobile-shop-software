import uuid
from decimal import Decimal

from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.modules.audit.service import record_audit
from app.modules.parties.models import Party, PartyKind
from app.modules.parties.schemas import PartyCreate, PartyUpdate


def get_party(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> Party:
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(
            code="party_not_found", message_en="Party not found", message_ur="کھاتہ نہیں ملا"
        )
    return party


def by_phone(db: Session, shop_id: uuid.UUID, phone: str) -> Party | None:
    return db.scalar(select(Party).where(Party.shop_id == shop_id, Party.phone == phone))


def list_parties(
    db: Session,
    shop_id: uuid.UUID,
    *,
    kind: PartyKind | None = None,
    q: str | None = None,
    with_balance: bool = False,
    include_inactive: bool = False,
    limit: int = 100,
) -> list[Party]:
    stmt = select(Party).where(Party.shop_id == shop_id)
    if not include_inactive:
        stmt = stmt.where(Party.is_active.is_(True))
    if kind:
        # JSON array containment is dialect-specific; the kinds list is tiny, so match the text form.
        stmt = stmt.where(cast(Party.kinds, String).like(f'%"{kind.value}"%'))
    if q:
        q = q.strip()
        like = f"%{q}%"
        digits = "".join(ch for ch in q if ch.isdigit())
        conds = [Party.name.ilike(like), Party.name_ur.ilike(like)]
        if digits:
            conds += [Party.phone.like(f"%{digits}%"), Party.cnic.like(f"%{digits[:5]}%")]
        stmt = stmt.where(or_(*conds))
    if with_balance:
        stmt = stmt.where(Party.balance != Decimal(0))
    return list(db.scalars(stmt.order_by(Party.name).limit(limit)).all())


def create_party(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: PartyCreate) -> Party:
    existing = by_phone(db, shop_id, data.phone)
    if existing is not None and not existing.is_active:
        # same number as an archived party: bring it back with the new details
        for k, v in data.model_dump().items():
            setattr(existing, k, v)
        existing.is_active = True
        record_audit(
            db,
            shop_id=shop_id,
            user_id=user_id,
            entity="party",
            entity_id=existing.id,
            action="restore",
            after={"name": existing.name, "phone": existing.phone},
        )
        db.commit()
        return existing
    if existing is not None:
        raise Conflict(
            code="party_phone_exists",
            message_en="A party with this phone number already exists",
            message_ur="اس فون نمبر کا کھاتہ پہلے سے موجود ہے",
        )
    party = Party(shop_id=shop_id, **data.model_dump())
    db.add(party)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="party",
        entity_id=party.id,
        action="create",
        after={"name": party.name, "phone": party.phone, "kinds": party.kinds},
    )
    db.commit()
    return party


def update_party(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, party_id: uuid.UUID, data: PartyUpdate
) -> Party:
    party = get_party(db, shop_id, party_id)
    changes = data.model_dump(exclude_unset=True)
    if "phone" in changes and changes["phone"] != party.phone:
        other = by_phone(db, shop_id, changes["phone"])
        if other and other.id != party.id:
            raise Conflict(code="party_phone_exists")
    before = {k: _plain(getattr(party, k)) for k in changes}
    for k, v in changes.items():
        setattr(party, k, v)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="party",
        entity_id=party.id,
        action="update",
        before=before,
        after={k: _plain(v) for k, v in changes.items()},
    )
    db.commit()
    return party


def _plain(v):
    if isinstance(v, Decimal | uuid.UUID):
        return str(v)
    if isinstance(v, list):
        return [str(x) for x in v]
    return v


def delete_party(db: Session, shop_id: uuid.UUID, ctx, party_id: uuid.UUID) -> str:
    """Delete when nothing refers to the party, otherwise archive. Balance must be clear."""
    from app.core.errors import Forbidden
    from app.core.permissions import Cap
    from app.db.refs import count_references
    from app.modules.ledger.service import refresh_party_balance

    if not ctx.can(Cap.VOID):
        raise Forbidden()
    party = get_party(db, shop_id, party_id)
    if refresh_party_balance(db, shop_id, party.id) != 0:
        raise Conflict(
            code="party_has_balance",
            message_en="This account still has a balance. Clear it first.",
            message_ur="اس کھاتے میں ابھی رقم باقی ہے۔ پہلے حساب صاف کریں۔",
        )
    used = count_references(db, "parties", party.id)
    action = "archive" if used else "delete"
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="party",
        entity_id=party.id,
        action=action,
        before={"name": party.name, "phone": party.phone},
    )
    if used:
        party.is_active = False
    else:
        db.delete(party)
    db.commit()
    return action
