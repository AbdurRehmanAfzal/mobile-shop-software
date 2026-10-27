import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Forbidden, NotFound
from app.modules.audit.service import record_audit
from app.modules.catalogue.models import Brand, Colour, Model, Storage
from app.modules.catalogue.schemas import (
    BrandCreate,
    CatalogueUpdate,
    ColourCreate,
    ModelCreate,
    StorageCreate,
)


def _visible(col, shop_id: uuid.UUID):
    """Global rows plus the current shop's own rows."""
    return or_(col.is_(None), col == shop_id)


def _taken(
    db: Session, table, shop_id: uuid.UUID, name: str, exclude_id: uuid.UUID | None = None, **extra
) -> bool:
    stmt = select(table.id).where(
        _visible(table.shop_id, shop_id), func.lower(table.name) == name.strip().lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(table.id != exclude_id)
    for k, v in extra.items():
        stmt = stmt.where(getattr(table, k) == v)
    return db.scalar(stmt) is not None


# ---- brands & models -----------------------------------------------------------


def list_brands(db: Session, shop_id: uuid.UUID) -> list[dict]:
    count_sq = (
        select(Model.brand_id, func.count(Model.id).label("n"))
        .where(_visible(Model.shop_id, shop_id), Model.is_active.is_(True))
        .group_by(Model.brand_id)
        .subquery()
    )
    rows = db.execute(
        select(Brand, func.coalesce(count_sq.c.n, 0))
        .outerjoin(count_sq, count_sq.c.brand_id == Brand.id)
        .where(_visible(Brand.shop_id, shop_id), Brand.is_active.is_(True))
        .order_by(Brand.sort_order, Brand.name)
    ).all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "name_ur": b.name_ur,
            "is_global": b.shop_id is None,
            "model_count": n,
        }
        for b, n in rows
    ]


def create_brand(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: BrandCreate) -> dict:
    if _taken(db, Brand, shop_id, data.name):
        raise Conflict(
            code="brand_exists",
            message_en="Brand already exists",
            message_ur="یہ برانڈ پہلے سے موجود ہے",
        )
    brand = Brand(shop_id=shop_id, name=data.name.strip(), name_ur=data.name_ur)
    db.add(brand)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="brand",
        entity_id=brand.id,
        action="create",
        after={"name": brand.name},
    )
    db.commit()
    return {
        "id": brand.id,
        "name": brand.name,
        "name_ur": brand.name_ur,
        "is_global": False,
        "model_count": 0,
    }


def list_models(
    db: Session, shop_id: uuid.UUID, brand_id: uuid.UUID | None, q: str | None, limit: int
) -> list[dict]:
    stmt = select(Model).where(_visible(Model.shop_id, shop_id), Model.is_active.is_(True))
    if brand_id:
        stmt = stmt.where(Model.brand_id == brand_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.join(Brand, Brand.id == Model.brand_id).where(
            or_(Model.name.ilike(like), Brand.name.ilike(like), Model.name_ur.ilike(like))
        )
    stmt = stmt.order_by(Model.name).limit(limit)
    return [_model_out(m) for m in db.scalars(stmt).all()]


def create_model(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: ModelCreate) -> dict:
    brand = db.get(Brand, data.brand_id)
    if brand is None or (brand.shop_id is not None and brand.shop_id != shop_id):
        raise NotFound(code="brand_not_found")
    if _taken(db, Model, shop_id, data.name, brand_id=brand.id):
        raise Conflict(
            code="model_exists",
            message_en="Model already exists",
            message_ur="یہ ماڈل پہلے سے موجود ہے",
        )
    model = Model(
        shop_id=shop_id,
        brand_id=brand.id,
        name=data.name.strip(),
        name_ur=data.name_ur,
        reference_price=data.reference_price,
        is_feature_phone=data.is_feature_phone,
    )
    db.add(model)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="model",
        entity_id=model.id,
        action="create",
        after={"brand": brand.name, "name": model.name},
    )
    db.commit()
    return _model_out(model)


def _model_out(m: Model) -> dict:
    return {
        "id": m.id,
        "brand_id": m.brand_id,
        "name": m.name,
        "name_ur": m.name_ur,
        "reference_price": m.reference_price,
        "is_feature_phone": m.is_feature_phone,
        "is_global": m.shop_id is None,
    }


# ---- storages & colours --------------------------------------------------------


def list_storages(db: Session, shop_id: uuid.UUID) -> list[Storage]:
    return list(
        db.scalars(
            select(Storage)
            .where(_visible(Storage.shop_id, shop_id))
            .order_by(Storage.sort_order, Storage.gigabytes)
        ).all()
    )


def create_storage(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: StorageCreate
) -> Storage:
    if _taken(db, Storage, shop_id, data.name):
        raise Conflict(code="storage_exists")
    row = Storage(
        shop_id=shop_id, name=data.name.strip(), name_ur=data.name_ur, gigabytes=data.gigabytes
    )
    db.add(row)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="storage",
        entity_id=row.id,
        action="create",
        after={"name": row.name},
    )
    db.commit()
    return row


def list_colours(db: Session, shop_id: uuid.UUID) -> list[Colour]:
    return list(
        db.scalars(
            select(Colour)
            .where(_visible(Colour.shop_id, shop_id))
            .order_by(Colour.sort_order, Colour.name)
        ).all()
    )


def create_colour(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: ColourCreate
) -> Colour:
    if _taken(db, Colour, shop_id, data.name):
        raise Conflict(code="colour_exists")
    row = Colour(shop_id=shop_id, name=data.name.strip(), name_ur=data.name_ur, hex=data.hex)
    db.add(row)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="colour",
        entity_id=row.id,
        action="create",
        after={"name": row.name},
    )
    db.commit()
    return row


# ---- edit & delete (shop-own rows only) ------------------------------------------

_TABLES = {"brand": Brand, "model": Model, "storage": Storage, "colour": Colour}


def _own_row(db: Session, entity: str, shop_id: uuid.UUID, row_id: uuid.UUID):
    row = db.get(_TABLES[entity], row_id)
    if row is None or (row.shop_id is not None and row.shop_id != shop_id):
        raise NotFound(code=f"{entity}_not_found")
    if row.shop_id is None:
        raise Forbidden(
            code="catalogue_builtin",
            message_en="Built-in items cannot be changed. Add your own instead.",
            message_ur="پہلے سے موجود چیز تبدیل نہیں ہو سکتی۔ اپنی نئی شامل کریں۔",
        )
    return row


def _out(entity: str, row):
    if entity == "brand":
        return {
            "id": row.id,
            "name": row.name,
            "name_ur": row.name_ur,
            "is_global": False,
            "model_count": 0,
        }
    if entity == "model":
        return _model_out(row)
    return row


def update_item(
    db: Session,
    entity: str,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    row_id: uuid.UUID,
    data: CatalogueUpdate,
):
    row = _own_row(db, entity, shop_id, row_id)
    table = _TABLES[entity]
    extra = {"brand_id": row.brand_id} if entity == "model" else {}
    if _taken(db, table, shop_id, data.name, exclude_id=row.id, **extra):
        raise Conflict(
            code=f"{entity}_exists",
            message_en="This name already exists",
            message_ur="یہ نام پہلے سے موجود ہے",
        )
    before = {"name": row.name}
    row.name = data.name.strip()
    row.name_ur = None  # one name for both languages
    if entity == "storage" and data.gigabytes:
        row.gigabytes = data.gigabytes
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity=entity,
        entity_id=row.id,
        action="update",
        before=before,
        after={"name": row.name},
    )
    db.commit()
    return _out(entity, row)


def delete_item(
    db: Session, entity: str, shop_id: uuid.UUID, user_id: uuid.UUID, row_id: uuid.UUID
) -> None:
    from app.modules.devices.models import Device  # local import: devices depends on catalogue

    row = _own_row(db, entity, shop_id, row_id)
    used = db.scalar(select(func.count(Device.id)).where(getattr(Device, f"{entity}_id") == row.id))
    if entity == "brand":
        used += db.scalar(select(func.count(Model.id)).where(Model.brand_id == row.id))
    if used:
        raise Conflict(
            code="catalogue_in_use",
            message_en="It is used by phones or models, so it cannot be deleted. You can rename it.",
            message_ur="یہ موبائلوں یا ماڈلز میں استعمال ہو رہا ہے، اس لیے ختم نہیں ہو سکتا۔ نام بدل سکتے ہیں۔",
        )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity=entity,
        entity_id=row.id,
        action="delete",
        before={"name": row.name},
    )
    db.delete(row)
    db.commit()
