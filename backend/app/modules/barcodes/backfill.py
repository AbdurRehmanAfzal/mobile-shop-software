"""Give every existing phone and item a barcode (docs/22 §E). Idempotent: rows that already have
one are left alone. Run on the server after deploying:  python -m app.modules.barcodes.backfill"""

from sqlalchemy import select

from app.db.session import SessionLocal
from app.modules.auth.models import Shop
from app.modules.barcodes.service import backfill


def main() -> None:
    with SessionLocal() as db:
        total = {"devices": 0, "items": 0}
        for shop in db.scalars(select(Shop).order_by(Shop.created_at)).all():
            done = backfill(db, shop, None)
            if done["devices"] or done["items"]:
                print(f"{shop.name}: {done['devices']} phones, {done['items']} items")
            total["devices"] += done["devices"]
            total["items"] += done["items"]
        print(f"done: {total['devices']} phones, {total['items']} items")


if __name__ == "__main__":
    main()
