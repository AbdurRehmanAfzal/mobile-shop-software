"""Sample data for database seeding"""

from app.models import MobileBrand, MobileModel, MobileStorage, MobileColor
from app.database import SessionLocal

INITIAL_BRANDS = [
    # Premium Brands
    {"name": "Apple"},
    {"name": "Samsung"},

    # Chinese Brands (Popular in Pakistan)
    {"name": "Xiaomi"},
    {"name": "Oppo"},
    {"name": "Vivo"},
    {"name": "Realme"},
    {"name": "OnePlus"},

    # Google
    {"name": "Google Pixel"},

    # Other Popular Brands
    {"name": "Motorola"},
    {"name": "Huawei"},
    {"name": "Nokia"},
    {"name": "Infinix"},
    {"name": "Tecno"},
]

INITIAL_MODELS = [
    # ============ APPLE MODELS ============
    # iPhone 15 Series
    {"brand": "Apple", "model_name": "iPhone 15", "original_price": 160000, "sale_price": 170000},
    {"brand": "Apple", "model_name": "iPhone 15 Plus", "original_price": 180000, "sale_price": 190000},
    {"brand": "Apple", "model_name": "iPhone 15 Pro", "original_price": 220000, "sale_price": 235000},
    {"brand": "Apple", "model_name": "iPhone 15 Pro Max", "original_price": 250000, "sale_price": 270000},

    # iPhone 14 Series
    {"brand": "Apple", "model_name": "iPhone 14", "original_price": 140000, "sale_price": 155000},
    {"brand": "Apple", "model_name": "iPhone 14 Plus", "original_price": 160000, "sale_price": 175000},
    {"brand": "Apple", "model_name": "iPhone 14 Pro", "original_price": 200000, "sale_price": 215000},

    # iPhone 13 Series
    {"brand": "Apple", "model_name": "iPhone 13", "original_price": 120000, "sale_price": 135000},
    {"brand": "Apple", "model_name": "iPhone 13 Pro", "original_price": 180000, "sale_price": 195000},

    # ============ SAMSUNG MODELS ============
    # Galaxy S24 Series
    {"brand": "Samsung", "model_name": "Galaxy S24", "original_price": 175000, "sale_price": 190000},
    {"brand": "Samsung", "model_name": "Galaxy S24+", "original_price": 210000, "sale_price": 225000},
    {"brand": "Samsung", "model_name": "Galaxy S24 Ultra", "original_price": 280000, "sale_price": 300000},

    # Galaxy S23 Series
    {"brand": "Samsung", "model_name": "Galaxy S23", "original_price": 145000, "sale_price": 160000},
    {"brand": "Samsung", "model_name": "Galaxy S23 Ultra", "original_price": 230000, "sale_price": 250000},

    # Galaxy A Series
    {"brand": "Samsung", "model_name": "Galaxy A54", "original_price": 50000, "sale_price": 58000},
    {"brand": "Samsung", "model_name": "Galaxy A74", "original_price": 65000, "sale_price": 75000},
    {"brand": "Samsung", "model_name": "Galaxy A34", "original_price": 40000, "sale_price": 48000},

    # Galaxy Z Series
    {"brand": "Samsung", "model_name": "Galaxy Z Fold 5", "original_price": 280000, "sale_price": 300000},
    {"brand": "Samsung", "model_name": "Galaxy Z Flip 5", "original_price": 180000, "sale_price": 200000},

    # ============ XIAOMI MODELS ============
    # Xiaomi 14 Series
    {"brand": "Xiaomi", "model_name": "Xiaomi 14", "original_price": 120000, "sale_price": 138000},
    {"brand": "Xiaomi", "model_name": "Xiaomi 14 Ultra", "original_price": 180000, "sale_price": 205000},

    # Xiaomi 13 Series
    {"brand": "Xiaomi", "model_name": "Xiaomi 13", "original_price": 100000, "sale_price": 115000},

    # Redmi Series
    {"brand": "Xiaomi", "model_name": "Redmi Note 13", "original_price": 35000, "sale_price": 42000},
    {"brand": "Xiaomi", "model_name": "Redmi Note 13 Pro", "original_price": 55000, "sale_price": 65000},
    {"brand": "Xiaomi", "model_name": "Redmi 13", "original_price": 30000, "sale_price": 37000},

    # ============ OPPO MODELS ============
    # Oppo Find X Series
    {"brand": "Oppo", "model_name": "Find X6 Pro", "original_price": 150000, "sale_price": 170000},
    {"brand": "Oppo", "model_name": "Find X6", "original_price": 110000, "sale_price": 128000},

    # Oppo A Series
    {"brand": "Oppo", "model_name": "A78", "original_price": 35000, "sale_price": 42000},
    {"brand": "Oppo", "model_name": "A98", "original_price": 55000, "sale_price": 65000},

    # ============ VIVO MODELS ============
    # Vivo X Series
    {"brand": "Vivo", "model_name": "X90 Pro", "original_price": 130000, "sale_price": 150000},
    {"brand": "Vivo", "model_name": "X90", "original_price": 100000, "sale_price": 120000},

    # Vivo V Series
    {"brand": "Vivo", "model_name": "V27 Pro", "original_price": 80000, "sale_price": 95000},
    {"brand": "Vivo", "model_name": "V27", "original_price": 65000, "sale_price": 75000},
    {"brand": "Vivo", "model_name": "V25", "original_price": 55000, "sale_price": 65000},

    # ============ REALME MODELS ============
    # Realme GT Series
    {"brand": "Realme", "model_name": "GT 5 Pro", "original_price": 95000, "sale_price": 112000},
    {"brand": "Realme", "model_name": "GT 5", "original_price": 75000, "sale_price": 88000},

    # Realme 12 Series
    {"brand": "Realme", "model_name": "12 Pro Plus", "original_price": 65000, "sale_price": 78000},
    {"brand": "Realme", "model_name": "12 Pro", "original_price": 50000, "sale_price": 60000},

    # ============ ONEPLUS MODELS ============
    # OnePlus 12 Series
    {"brand": "OnePlus", "model_name": "12", "original_price": 120000, "sale_price": 138000},
    {"brand": "OnePlus", "model_name": "12R", "original_price": 85000, "sale_price": 100000},

    # OnePlus Nord Series
    {"brand": "OnePlus", "model_name": "Nord 3", "original_price": 60000, "sale_price": 72000},
    {"brand": "OnePlus", "model_name": "Nord 2", "original_price": 45000, "sale_price": 54000},

    # ============ GOOGLE PIXEL MODELS ============
    {"brand": "Google Pixel", "model_name": "Pixel 8 Pro", "original_price": 180000, "sale_price": 205000},
    {"brand": "Google Pixel", "model_name": "Pixel 8", "original_price": 120000, "sale_price": 140000},
    {"brand": "Google Pixel", "model_name": "Pixel 7a", "original_price": 70000, "sale_price": 85000},

    # ============ MOTOROLA MODELS ============
    {"brand": "Motorola", "model_name": "Moto Edge 40 Pro", "original_price": 100000, "sale_price": 118000},
    {"brand": "Motorola", "model_name": "Moto G84", "original_price": 35000, "sale_price": 42000},
    {"brand": "Motorola", "model_name": "Moto G54", "original_price": 25000, "sale_price": 31000},

    # ============ HUAWEI MODELS ============
    {"brand": "Huawei", "model_name": "P60 Pro", "original_price": 110000, "sale_price": 130000},
    {"brand": "Huawei", "model_name": "Mate 50 Pro", "original_price": 140000, "sale_price": 165000},

    # ============ NOKIA MODELS ============
    {"brand": "Nokia", "model_name": "G50", "original_price": 30000, "sale_price": 37000},
    {"brand": "Nokia", "model_name": "X100", "original_price": 45000, "sale_price": 54000},

    # ============ INFINIX MODELS ============
    {"brand": "Infinix", "model_name": "Note 30 Pro", "original_price": 40000, "sale_price": 49000},
    {"brand": "Infinix", "model_name": "GT 10 Pro", "original_price": 50000, "sale_price": 60000},

    # ============ TECNO MODELS ============
    {"brand": "Tecno", "model_name": "Camon 20 Pro", "original_price": 35000, "sale_price": 42000},
    {"brand": "Tecno", "model_name": "Spark 10 Pro", "original_price": 25000, "sale_price": 31000},
]

# Storage variants for models (informational)
STORAGE_OPTIONS = [
    "64GB", "128GB", "256GB", "512GB", "1TB"
]

# Color variants
COLOR_OPTIONS = [
    "Black", "Silver", "Gold", "Blue", "White",
    "Green", "Red", "Purple", "Midnight", "Starlight",
    "Sierra Blue", "Graphite", "Rose Gold", "Space Gray"
]

def seed_brands_and_models():
    """Seed initial brands and models"""
    db = SessionLocal()
    try:
        # Check if brands already exist
        existing_brands = db.query(MobileBrand).count()
        if existing_brands > 0:  # Only seed if database is empty
            print("✓ Brands already exist. Skipping seed.")
            return

        # Add brands
        brands_dict = {}
        for brand_data in INITIAL_BRANDS:
            # Check if brand already exists
            existing = db.query(MobileBrand).filter(MobileBrand.name == brand_data["name"]).first()
            if existing:
                brands_dict[existing.name] = existing.id
            else:
                brand = MobileBrand(**brand_data)
                db.add(brand)
                db.flush()  # Get the ID
                brands_dict[brand.name] = brand.id

        db.commit()
        print(f"✓ Added {len(INITIAL_BRANDS)} brands")
        print(f"  📱 Brands: {', '.join([b['name'] for b in INITIAL_BRANDS])}")

        # Add models
        models_added = 0
        for model_data in INITIAL_MODELS:
            brand_name = model_data.pop("brand")
            brand_id = brands_dict[brand_name]

            # Check if model already exists
            existing = db.query(MobileModel).filter(
                MobileModel.brand_id == brand_id,
                MobileModel.model_name == model_data["model_name"]
            ).first()

            if not existing:
                model = MobileModel(
                    brand_id=brand_id,
                    **model_data
                )
                db.add(model)
                models_added += 1

        db.commit()
        print(f"✓ Added {models_added} new models (total in database: {db.query(MobileModel).count()})")

        # Display storage and color options info
        print(f"\n📦 Available Storage Options: {', '.join(STORAGE_OPTIONS)}")
        print(f"🎨 Available Colors: {', '.join(COLOR_OPTIONS)}")

        # Show brands with model counts
        print("\n📊 Brand Summary:")
        for brand_name in sorted(brands_dict.keys()):
            brand_id = brands_dict[brand_name]
            model_count = db.query(MobileModel).filter(MobileModel.brand_id == brand_id).count()
            print(f"  • {brand_name}: {model_count} models")

    except Exception as e:
        db.rollback()
        print(f"✗ Error seeding data: {e}")
    finally:
        db.close()


def seed_storages_and_colors():
    """Seed storage options and colors"""
    db = SessionLocal()
    try:
        # Check if already seeded
        existing_storages = db.query(MobileStorage).count()
        existing_colors = db.query(MobileColor).count()

        if existing_storages > 0 and existing_colors > 0:
            print("✓ Storage and color options already exist. Skipping seed.")
            return

        # Seed Storages
        if existing_storages == 0:
            storage_data = [
                {"name": "64GB", "name_urdu": "64 گیگا بائٹ"},
                {"name": "128GB", "name_urdu": "128 گیگا بائٹ"},
                {"name": "256GB", "name_urdu": "256 گیگا بائٹ"},
                {"name": "512GB", "name_urdu": "512 گیگا بائٹ"},
                {"name": "1TB", "name_urdu": "1 ٹی بی"},
            ]
            for storage in storage_data:
                db.add(MobileStorage(**storage))
            db.commit()
            print(f"✓ Added {len(storage_data)} storage options")

        # Seed Colors
        if existing_colors == 0:
            color_data = [
                {"name": "Black", "name_urdu": "سیاہ", "hex_code": "#000000"},
                {"name": "White", "name_urdu": "سفید", "hex_code": "#FFFFFF"},
                {"name": "Silver", "name_urdu": "چاندی", "hex_code": "#C0C0C0"},
                {"name": "Gold", "name_urdu": "سونا", "hex_code": "#FFD700"},
                {"name": "Blue", "name_urdu": "نیلا", "hex_code": "#0000FF"},
                {"name": "Red", "name_urdu": "سرخ", "hex_code": "#FF0000"},
                {"name": "Green", "name_urdu": "سبز", "hex_code": "#00AA00"},
                {"name": "Purple", "name_urdu": "بنفشی", "hex_code": "#800080"},
                {"name": "Pink", "name_urdu": "گلابی", "hex_code": "#FFC0CB"},
                {"name": "Midnight", "name_urdu": "آدھی رات", "hex_code": "#191970"},
                {"name": "Starlight", "name_urdu": "ستاروں کی روشنی", "hex_code": "#E8E8E8"},
                {"name": "Sierra Blue", "name_urdu": "سیرا نیلا", "hex_code": "#0066FF"},
                {"name": "Graphite", "name_urdu": "گریفائٹ", "hex_code": "#383838"},
                {"name": "Rose Gold", "name_urdu": "گلاب کا سونا", "hex_code": "#B7656F"},
                {"name": "Space Gray", "name_urdu": "خلائی سرمائی", "hex_code": "#545458"},
            ]
            for color in color_data:
                db.add(MobileColor(**color))
            db.commit()
            print(f"✓ Added {len(color_data)} color options")

    except Exception as e:
        db.rollback()
        print(f"✗ Error seeding storage and colors: {e}")
    finally:
        db.close()
