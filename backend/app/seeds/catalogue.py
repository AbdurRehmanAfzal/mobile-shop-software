"""Global catalogue seed (idempotent). Ported from legacy/backend/app/utils/seed_data.py and extended
with Urdu names, Pakistani budget brands and the feature phones that used-mobile shops trade daily.

Run: `python -m app.seeds.catalogue` or automatically at app startup (see app.main).
"""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.catalogue.models import Brand, Colour, Model, Storage

# (name, name_ur, sort_order)
BRANDS: list[tuple[str, str, int]] = [
    ("Apple", "ایپل", 10),
    ("Samsung", "سام سنگ", 20),
    ("Xiaomi", "شاؤمی", 30),
    ("Oppo", "اوپو", 40),
    ("Vivo", "ویوو", 50),
    ("Realme", "ریئل می", 60),
    ("Infinix", "انفینکس", 70),
    ("Tecno", "ٹیکنو", 80),
    ("OnePlus", "ون پلس", 90),
    ("Google Pixel", "گوگل پکسل", 100),
    ("Motorola", "موٹرولا", 110),
    ("Huawei", "ہواوے", 120),
    ("Nokia", "نوکیا", 130),
    ("Itel", "آئی ٹیل", 140),
    ("Sparx", "اسپارکس", 150),
    ("QMobile", "کیو موبائل", 160),
    ("Honor", "آنر", 170),
]

# (brand, model, reference_price or None, is_feature_phone)
MODELS: list[tuple[str, str, int | None, bool]] = [
    # Apple
    ("Apple", "iPhone 15", 170000, False),
    ("Apple", "iPhone 15 Plus", 190000, False),
    ("Apple", "iPhone 15 Pro", 235000, False),
    ("Apple", "iPhone 15 Pro Max", 270000, False),
    ("Apple", "iPhone 14", 155000, False),
    ("Apple", "iPhone 14 Plus", 175000, False),
    ("Apple", "iPhone 14 Pro", 215000, False),
    ("Apple", "iPhone 14 Pro Max", 240000, False),
    ("Apple", "iPhone 13", 135000, False),
    ("Apple", "iPhone 13 Pro", 195000, False),
    ("Apple", "iPhone 13 Pro Max", 210000, False),
    ("Apple", "iPhone 12", 110000, False),
    ("Apple", "iPhone 12 Pro Max", 160000, False),
    ("Apple", "iPhone 11", 85000, False),
    ("Apple", "iPhone XR", 60000, False),
    ("Apple", "iPhone X", 50000, False),
    ("Apple", "iPhone 8 Plus", 40000, False),
    ("Apple", "iPhone 7 Plus", 30000, False),
    # Samsung
    ("Samsung", "Galaxy S24", 190000, False),
    ("Samsung", "Galaxy S24+", 225000, False),
    ("Samsung", "Galaxy S24 Ultra", 300000, False),
    ("Samsung", "Galaxy S23", 160000, False),
    ("Samsung", "Galaxy S23 Ultra", 250000, False),
    ("Samsung", "Galaxy S22 Ultra", 180000, False),
    ("Samsung", "Galaxy A54", 58000, False),
    ("Samsung", "Galaxy A74", 75000, False),
    ("Samsung", "Galaxy A34", 48000, False),
    ("Samsung", "Galaxy A24", 38000, False),
    ("Samsung", "Galaxy A14", 30000, False),
    ("Samsung", "Galaxy A05", 24000, False),
    ("Samsung", "Galaxy Z Fold 5", 300000, False),
    ("Samsung", "Galaxy Z Flip 5", 200000, False),
    # Xiaomi
    ("Xiaomi", "Xiaomi 14", 138000, False),
    ("Xiaomi", "Xiaomi 14 Ultra", 205000, False),
    ("Xiaomi", "Xiaomi 13", 115000, False),
    ("Xiaomi", "Redmi Note 13", 42000, False),
    ("Xiaomi", "Redmi Note 13 Pro", 65000, False),
    ("Xiaomi", "Redmi Note 12", 38000, False),
    ("Xiaomi", "Redmi 13", 37000, False),
    ("Xiaomi", "Redmi 12", 32000, False),
    ("Xiaomi", "Redmi A3", 20000, False),
    ("Xiaomi", "Poco X6 Pro", 75000, False),
    # Oppo
    ("Oppo", "Find X6 Pro", 170000, False),
    ("Oppo", "Find X6", 128000, False),
    ("Oppo", "Reno 11", 95000, False),
    ("Oppo", "A78", 42000, False),
    ("Oppo", "A98", 65000, False),
    ("Oppo", "A58", 36000, False),
    ("Oppo", "A18", 25000, False),
    # Vivo
    ("Vivo", "X90 Pro", 150000, False),
    ("Vivo", "X90", 120000, False),
    ("Vivo", "V27 Pro", 95000, False),
    ("Vivo", "V27", 75000, False),
    ("Vivo", "V25", 65000, False),
    ("Vivo", "Y36", 42000, False),
    ("Vivo", "Y27", 36000, False),
    ("Vivo", "Y17s", 28000, False),
    # Realme
    ("Realme", "GT 5 Pro", 112000, False),
    ("Realme", "GT 5", 88000, False),
    ("Realme", "12 Pro Plus", 78000, False),
    ("Realme", "12 Pro", 60000, False),
    ("Realme", "C67", 38000, False),
    ("Realme", "C53", 32000, False),
    ("Realme", "Note 50", 22000, False),
    # Infinix
    ("Infinix", "Note 30 Pro", 49000, False),
    ("Infinix", "GT 10 Pro", 60000, False),
    ("Infinix", "Hot 40", 34000, False),
    ("Infinix", "Smart 8", 22000, False),
    ("Infinix", "Zero 30", 70000, False),
    # Tecno
    ("Tecno", "Camon 20 Pro", 42000, False),
    ("Tecno", "Spark 10 Pro", 31000, False),
    ("Tecno", "Spark 20", 30000, False),
    ("Tecno", "Pova 5", 45000, False),
    # OnePlus
    ("OnePlus", "12", 138000, False),
    ("OnePlus", "12R", 100000, False),
    ("OnePlus", "Nord 3", 72000, False),
    ("OnePlus", "Nord 2", 54000, False),
    ("OnePlus", "9 Pro", 90000, False),
    # Google
    ("Google Pixel", "Pixel 8 Pro", 205000, False),
    ("Google Pixel", "Pixel 8", 140000, False),
    ("Google Pixel", "Pixel 7a", 85000, False),
    ("Google Pixel", "Pixel 7 Pro", 120000, False),
    ("Google Pixel", "Pixel 6a", 60000, False),
    # Motorola
    ("Motorola", "Moto Edge 40 Pro", 118000, False),
    ("Motorola", "Moto G84", 42000, False),
    ("Motorola", "Moto G54", 31000, False),
    # Huawei
    ("Huawei", "P60 Pro", 130000, False),
    ("Huawei", "Mate 50 Pro", 165000, False),
    ("Huawei", "Nova 11", 90000, False),
    # Nokia (feature phones dominate the used market)
    ("Nokia", "105 (2023)", 4200, True),
    ("Nokia", "106 (2023)", 5200, True),
    ("Nokia", "110 (2023)", 5800, True),
    ("Nokia", "130", 6500, True),
    ("Nokia", "150", 7500, True),
    ("Nokia", "210", 8500, True),
    ("Nokia", "225 4G", 12000, True),
    ("Nokia", "3310", 9000, True),
    ("Nokia", "G50", 37000, False),
    ("Nokia", "X100", 54000, False),
    # Itel / Sparx / QMobile
    ("Itel", "it2163", 3300, True),
    ("Itel", "it5262", 3900, True),
    ("Itel", "A70", 22000, False),
    ("Sparx", "Neo 7", 20000, False),
    ("Sparx", "Neo 7 Plus", 24000, False),
    ("QMobile", "Power 300", 3500, True),
    ("QMobile", "L10", 4200, True),
    # Honor
    ("Honor", "X9b", 70000, False),
    ("Honor", "X7b", 45000, False),
]

# (name, name_ur, gigabytes, sort)
STORAGES: list[tuple[str, str, int, int]] = [
    ("4MB", "4 ایم بی", 0, 1),
    ("32GB", "32 جی بی", 32, 10),
    ("64GB", "64 جی بی", 64, 20),
    ("128GB", "128 جی بی", 128, 30),
    ("256GB", "256 جی بی", 256, 40),
    ("512GB", "512 جی بی", 512, 50),
    ("1TB", "1 ٹی بی", 1024, 60),
]

# (name, name_ur, hex, sort)
COLOURS: list[tuple[str, str, str, int]] = [
    ("Black", "سیاہ", "#111111", 10),
    ("White", "سفید", "#F5F5F5", 20),
    ("Silver", "سلور", "#C0C0C0", 30),
    ("Gold", "سنہری", "#D4AF37", 40),
    ("Blue", "نیلا", "#1E50A2", 50),
    ("Green", "سبز", "#2E7D5B", 60),
    ("Red", "سرخ", "#C0392B", 70),
    ("Purple", "جامنی", "#6D4C9F", 80),
    ("Midnight", "مڈنائٹ", "#1B1F2A", 90),
    ("Starlight", "اسٹار لائٹ", "#F0E9DD", 100),
    ("Sierra Blue", "سیرا بلیو", "#9BB5CE", 110),
    ("Graphite", "گریفائٹ", "#4A4A4A", 120),
    ("Rose Gold", "روز گولڈ", "#E8B4B8", 130),
    ("Space Gray", "اسپیس گرے", "#595959", 140),
    ("Natural Titanium", "نیچرل ٹائٹینیم", "#B8B2A7", 150),
    ("Other", "دیگر", None, 999),
]


def seed_catalogue(db: Session) -> dict[str, int]:
    """Insert any missing global rows. Safe to run on every startup."""
    added = {"brands": 0, "models": 0, "storages": 0, "colours": 0}

    existing_brands = {
        b.name.lower(): b for b in db.scalars(select(Brand).where(Brand.shop_id.is_(None))).all()
    }
    for name, name_ur, order in BRANDS:
        if name.lower() not in existing_brands:
            b = Brand(shop_id=None, name=name, name_ur=name_ur, sort_order=order)
            db.add(b)
            existing_brands[name.lower()] = b
            added["brands"] += 1
    db.flush()

    existing_models = {
        (m.brand_id, m.name.lower())
        for m in db.scalars(select(Model).where(Model.shop_id.is_(None))).all()
    }
    for brand_name, model_name, price, feature in MODELS:
        brand = existing_brands[brand_name.lower()]
        if (brand.id, model_name.lower()) in existing_models:
            continue
        db.add(
            Model(
                shop_id=None,
                brand_id=brand.id,
                name=model_name,
                reference_price=Decimal(price) if price is not None else None,
                is_feature_phone=feature,
            )
        )
        added["models"] += 1

    have = {
        s.lower() for s in db.scalars(select(Storage.name).where(Storage.shop_id.is_(None))).all()
    }
    for name, name_ur, gb, order in STORAGES:
        if name.lower() not in have:
            db.add(
                Storage(shop_id=None, name=name, name_ur=name_ur, gigabytes=gb, sort_order=order)
            )
            added["storages"] += 1

    have = {
        c.lower() for c in db.scalars(select(Colour.name).where(Colour.shop_id.is_(None))).all()
    }
    for name, name_ur, hx, order in COLOURS:
        if name.lower() not in have:
            db.add(Colour(shop_id=None, name=name, name_ur=name_ur, hex=hx, sort_order=order))
            added["colours"] += 1

    db.commit()
    return added


def catalogue_is_empty(db: Session) -> bool:
    return (db.scalar(select(func.count(Brand.id)).where(Brand.shop_id.is_(None))) or 0) == 0


if __name__ == "__main__":  # pragma: no cover
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        print(seed_catalogue(session))
