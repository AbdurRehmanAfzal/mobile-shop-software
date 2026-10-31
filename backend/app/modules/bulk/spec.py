"""What each sheet looks like: columns (key, header in English and Urdu, required, type, help),
sample rows in shopkeeper words, and the synonyms we accept for words like condition and PTA."""

from dataclasses import dataclass

KINDS = ("stock", "people", "items", "sales", "expenses")

# IMEIs / phones used only by the sample rows: an upload that still carries them skips them
SAMPLE_IMEIS = {"490154203237518", "356938035643809", "352099001761481"}
SAMPLE_PHONES = {"03001234567", "03211234567", "03451234567"}


@dataclass(frozen=True)
class Col:
    key: str
    en: str
    ur: str
    required: bool = False
    kind: str = "text"  # text | int | money | date | imei | phone | enum | list
    help_en: str = ""
    help_ur: str = ""
    enum: str | None = None  # name of the list in Lists / synonyms


COLUMNS: dict[str, list[Col]] = {
    "stock": [
        Col(
            "imei1",
            "IMEI 1",
            "IMEI 1",
            True,
            "imei",
            "15 digits (dial *#06#)",
            "15 ہندسے (*#06# ملائیں)",
        ),
        Col("imei2", "IMEI 2", "IMEI 2", False, "imei", "second SIM, if any", "دوسری سم ہو تو"),
        Col(
            "brand",
            "Brand",
            "برانڈ",
            True,
            "list",
            "e.g. Vivo, Samsung — from the Lists sheet or a new one",
            "مثلاً Vivo, Samsung — فہرست سے یا نیا",
        ),
        Col("model", "Model", "ماڈل", True, "list", "e.g. Y21, Galaxy A54", "مثلاً Y21, Galaxy A54"),
        Col("storage", "Storage", "میموری", False, "list", "e.g. 128 GB", "مثلاً 128 GB"),
        Col("colour", "Colour", "رنگ", False, "list", "e.g. Black", "مثلاً Black"),
        Col(
            "condition",
            "Condition",
            "حالت",
            True,
            "enum",
            "New / Used / Open box / Patched",
            "نیا / استعمال شدہ / کھلا ڈبہ / پیچ",
            "condition",
        ),
        Col(
            "pta",
            "PTA",
            "PTA",
            True,
            "enum",
            "PTA approved / Non-PTA / JV / Unknown",
            "PTA منظور / Non-PTA / JV / معلوم نہیں",
            "pta",
        ),
        Col(
            "sim_time",
            "SIM time (months)",
            "سم ٹائم (مہینے)",
            False,
            "int",
            "needed for Non-PTA / JV",
            "Non-PTA / JV کے لیے ضروری",
        ),
        Col("cost", "Cost (Rs.)", "لاگت (روپے)", True, "money", "what you paid", "جو آپ نے دیے"),
        Col(
            "asking",
            "Asking price (Rs.)",
            "طے قیمت (روپے)",
            False,
            "money",
            "what you will sell at",
            "جس پر بیچیں گے",
        ),
        Col(
            "supplier_phone",
            "Supplier phone",
            "سپلائر کا فون",
            False,
            "phone",
            "leave empty for your own old stock",
            "اپنا پرانا سٹاک ہو تو خالی چھوڑیں",
        ),
        Col(
            "supplier_name",
            "Supplier name",
            "سپلائر کا نام",
            False,
            "text",
            "used when the phone is new to the app",
            "جب نمبر ایپ میں نہ ہو",
        ),
        Col(
            "date",
            "Date",
            "تاریخ",
            False,
            "date",
            "dd-mm-yyyy; empty = today",
            "دن-مہینہ-سال؛ خالی = آج",
        ),
        Col(
            "paid",
            "Paid now (Rs.)",
            "ابھی ادا (روپے)",
            False,
            "money",
            "for supplier rows; empty = nothing paid yet",
            "سپلائر والی قطاروں کے لیے؛ خالی = ابھی کچھ نہیں دیا",
        ),
        Col("notes", "Notes", "نوٹ", False, "text"),
    ],
    "people": [
        Col("name", "Name", "نام", True, "text"),
        Col("phone", "Phone", "فون", True, "phone", "03XXXXXXXXX", "03XXXXXXXXX"),
        Col(
            "type",
            "Type",
            "قسم",
            True,
            "enum",
            "Customer / Supplier / Shop / Customer & supplier",
            "گاہک / سپلائر / دکان / گاہک اور سپلائر",
            "party_type",
        ),
        Col("city", "City", "شہر", False, "text"),
        Col("cnic", "CNIC", "شناختی کارڈ", False, "text", "33100-1234567-1", "33100-1234567-1"),
        Col(
            "opening",
            "Opening balance (Rs.)",
            "ابتدائی بیلنس (روپے)",
            False,
            "money",
            "what is owed today, either way",
            "آج جو باقی ہے، کسی بھی طرف",
        ),
        Col(
            "direction",
            "Who owes",
            "کون دے گا",
            False,
            "enum",
            "They owe us / We owe them",
            "ان پر باقی / ہم نے دینا",
            "direction",
        ),
        Col("notes", "Notes", "نوٹ", False, "text"),
    ],
    "items": [
        Col(
            "name",
            "Name",
            "نام",
            True,
            "text",
            "e.g. Type-C charger 25W",
            "مثلاً Type-C charger 25W",
        ),
        Col(
            "category",
            "Category",
            "قسم",
            False,
            "enum",
            "charger / cable / cover / glass / …",
            "charger / cable / cover / glass / …",
            "item_category",
        ),
        Col(
            "sku",
            "SKU",
            "SKU",
            False,
            "text",
            "your own code; empty = made for you",
            "اپنا کوڈ؛ خالی = خود بنے گا",
        ),
        Col("qty", "Quantity", "تعداد", True, "int"),
        Col("cost", "Unit cost (Rs.)", "فی عدد لاگت (روپے)", True, "money"),
        Col("price", "Sale price (Rs.)", "فروخت قیمت (روپے)", True, "money"),
        Col(
            "reorder",
            "Reorder at",
            "دوبارہ منگوائیں جب",
            False,
            "int",
            "alert when stock falls to this",
            "اتنے رہ جائیں تو یاد دہانی",
        ),
        # owner addendum 5 (docs/24): the optional product card
        Col("brand", "Brand", "برانڈ", False, "text"),
        Col("grade", "Quality", "کوالٹی", False, "text", "original / oem / a_grade / copy / used", "original / oem / a_grade / copy / used"),
        Col("color", "Colour", "رنگ", False, "text"),
        Col("compatible", "Fits (phone / model)", "کس فون کے لیے", False, "text", "e.g. iPhone 14/15", "مثلاً iPhone 14/15"),
        Col("wholesale_price", "Wholesale price (Rs.)", "ہول سیل قیمت (روپے)", False, "money"),
        Col("min_price", "Minimum sale price (Rs.)", "کم سے کم فروخت قیمت (روپے)", False, "money"),
        Col("warranty_days", "Warranty (days)", "وارنٹی (دن)", False, "int"),
        Col("location", "Shelf / rack", "شیلف / ریک", False, "text"),
    ],
    "sales": [
        Col(
            "imei1",
            "IMEI",
            "IMEI",
            True,
            "imei",
            "a phone that is in your stock in the app",
            "جو موبائل ایپ کے سٹاک میں ہے",
        ),
        Col("price", "Sold for (Rs.)", "بکا (روپے)", True, "money"),
        Col(
            "paid",
            "Paid now (Rs.)",
            "وصول (روپے)",
            True,
            "money",
            "the rest goes on the customer's khata",
            "باقی گاہک کے کھاتے میں",
        ),
        Col(
            "customer_phone",
            "Customer phone",
            "گاہک کا فون",
            False,
            "phone",
            "needed when something is left on khata",
            "جب کھاتے میں کچھ باقی ہو تو ضروری",
        ),
        Col("customer_name", "Customer name", "گاہک کا نام", False, "text"),
        Col(
            "date",
            "Date",
            "تاریخ",
            False,
            "date",
            "dd-mm-yyyy; empty = today",
            "دن-مہینہ-سال؛ خالی = آج",
        ),
        Col("notes", "Notes", "نوٹ", False, "text"),
    ],
    "expenses": [
        Col("date", "Date", "تاریخ", True, "date", "dd-mm-yyyy", "دن-مہینہ-سال"),
        Col(
            "category",
            "Category",
            "قسم",
            True,
            "enum",
            "from the Lists sheet",
            "فہرست سے",
            "expense_category",
        ),
        Col("amount", "Amount (Rs.)", "رقم (روپے)", True, "money"),
        Col("description", "Description", "تفصیل", False, "text"),
        Col(
            "account",
            "Account",
            "اکاؤنٹ",
            False,
            "list",
            "Cash or a bank / wallet name; empty = cash",
            "نقد یا بینک / والٹ کا نام؛ خالی = نقد",
        ),
    ],
}

SAMPLES: dict[str, list[dict]] = {
    "stock": [
        {
            "imei1": "490154203237518",
            "brand": "Vivo",
            "model": "Y21",
            "storage": "128GB",
            "colour": "Black",
            "condition": "Used",
            "pta": "PTA approved",
            "cost": 35000,
            "asking": 40000,
            "supplier_phone": "03001234567",
            "supplier_name": "Rehman Traders",
            "date": "15-10-2026",
            "paid": 35000,
            "notes": "box + charger",
        },
        {
            "imei1": "356938035643809",
            "brand": "Samsung",
            "model": "Galaxy A54",
            "storage": "256GB",
            "colour": "Awesome Violet",
            "condition": "New",
            "pta": "PTA approved",
            "cost": 118000,
            "asking": 125000,
            "supplier_phone": "03001234567",
            "supplier_name": "Rehman Traders",
            "date": "15-10-2026",
            "paid": 0,
        },
        {
            "imei1": "352099001761481",
            "brand": "Infinix",
            "model": "Hot 40",
            "storage": "128GB",
            "colour": "Blue",
            "condition": "Used",
            "pta": "Non-PTA",
            "sim_time": 4,
            "cost": 22000,
            "asking": 26000,
            "notes": "own old stock",
        },
    ],
    "people": [
        {
            "name": "Ahmed Khan",
            "phone": "03001234567",
            "type": "Customer",
            "city": "Lahore",
            "opening": 15000,
            "direction": "They owe us",
        },
        {
            "name": "Rehman Traders",
            "phone": "03211234567",
            "type": "Supplier",
            "city": "Karachi",
            "opening": 60000,
            "direction": "We owe them",
        },
        {"name": "Bilal Mobile Shop", "phone": "03451234567", "type": "Shop", "city": "Faisalabad"},
    ],
    "items": [
        {
            "name": "Type-C charger 25W",
            "category": "charger",
            "qty": 20,
            "cost": 450,
            "price": 800,
            "reorder": 5,
        },
        {
            "name": "Tempered glass (iPhone 13)",
            "category": "glass",
            "qty": 50,
            "cost": 60,
            "price": 250,
            "reorder": 10,
        },
        {
            "name": "Silicone cover (Galaxy A54)",
            "category": "cover",
            "qty": 12,
            "cost": 150,
            "price": 450,
            "reorder": 3,
        },
    ],
    "sales": [
        {"imei1": "490154203237518", "price": 40000, "paid": 40000, "date": "20-10-2026"},
        {
            "imei1": "356938035643809",
            "price": 125000,
            "paid": 100000,
            "customer_phone": "03001234567",
            "customer_name": "Ahmed Khan",
            "date": "22-10-2026",
            "notes": "25,000 on khata",
        },
        {"imei1": "352099001761481", "price": 26500, "paid": 26500, "date": "25-10-2026"},
    ],
    "expenses": [
        {"date": "01-10-2026", "category": "Shop rent", "amount": 25000, "description": "October"},
        {"date": "05-10-2026", "category": "Electricity", "amount": 6200},
        {"date": "10-10-2026", "category": "Tea & refreshments", "amount": 800, "account": "Cash"},
    ],
}

# typed words we understand (lower-cased, spaces and hyphens removed), per enum
SYNONYMS: dict[str, dict[str, set[str]]] = {
    "condition": {
        "box_pack": {
            "new",
            "brandnew",
            "boxpack",
            "box",
            "sealed",
            "نیا",
            "پیک",
            "باکس",
            "boxpacked",
        },
        "open_box": {"openbox", "open", "کھلاڈبہ", "کھلا"},
        "used": {"used", "second", "secondhand", "old", "استعمالشدہ", "پرانا", "استعمال"},
        "patched": {"patched", "patch", "پیچ"},
    },
    "pta": {
        "pta_approved": {"pta", "ptaapproved", "approved", "ptaمنظور", "منظور", "yes"},
        "non_pta": {"nonpta", "non", "notapproved", "نان", "نانپی", "no"},
        "jv": {"jv", "جےوی", "جی"},
        "unknown": {"unknown", "", "معلومنہیں", "نامعلوم"},
    },
    "party_type": {
        "customer": {"customer", "گاہک", "client", "buyer"},
        "supplier": {"supplier", "dealer", "سپلائر", "ڈیلر", "vendor"},
        "shop": {"shop", "دکان", "store"},
        "both": {
            "both",
            "customer&supplier",
            "customersupplier",
            "customerandsupplier",
            "گاہکاورسپلائر",
            "دونوں",
        },
    },
    "direction": {
        "they_owe": {
            "theyoweus",
            "theyowe",
            "receivable",
            "lena",
            "انپرباقی",
            "لینا",
            "ours",
            "customerowes",
        },
        "we_owe": {"weowethem", "weowe", "payable", "dena", "ہمنےدینا", "دینا", "theirs"},
    },
}
ENUM_LABELS: dict[str, dict[str, tuple[str, str]]] = {
    "condition": {
        "box_pack": ("New", "نیا"),
        "used": ("Used", "استعمال شدہ"),
        "open_box": ("Open box", "کھلا ڈبہ"),
        "patched": ("Patched", "پیچ"),
    },
    "pta": {
        "pta_approved": ("PTA approved", "PTA منظور"),
        "non_pta": ("Non-PTA", "Non-PTA"),
        "jv": ("JV", "JV"),
        "unknown": ("Unknown", "معلوم نہیں"),
    },
    "party_type": {
        "customer": ("Customer", "گاہک"),
        "supplier": ("Supplier", "سپلائر"),
        "shop": ("Shop", "دکان"),
        "both": ("Customer & supplier", "گاہک اور سپلائر"),
    },
    "direction": {
        "they_owe": ("They owe us", "ان پر باقی"),
        "we_owe": ("We owe them", "ہم نے دینا"),
    },
}

MESSAGES: dict[str, tuple[str, str]] = {
    "required": ("{col} is required", "{col} ضروری ہے"),
    "bad_imei": ("IMEI must be 15 digits with a valid check digit", "IMEI 15 درست ہندسے ہوں"),
    "imei_dup_file": ("This IMEI appears twice in the file", "یہ IMEI فائل میں دو بار ہے"),
    "imei_exists": ("This IMEI is already in your shop", "یہ IMEI پہلے سے دکان میں ہے"),
    "imei_not_in_stock": ("No phone with this IMEI is in stock", "اس IMEI کا موبائل سٹاک میں نہیں"),
    "bad_phone": (
        "Phone must be a Pakistani mobile number (03XXXXXXXXX)",
        "فون پاکستانی موبائل نمبر ہو (03XXXXXXXXX)",
    ),
    "phone_dup_file": ("This phone appears twice in the file", "یہ فون فائل میں دو بار ہے"),
    "bad_number": ("{col} must be a number", "{col} ہندسوں میں ہو"),
    "negative": ("{col} cannot be negative", "{col} منفی نہیں ہو سکتا"),
    "bad_date": ("{col}: write the date as dd-mm-yyyy", "{col}: تاریخ دن-مہینہ-سال لکھیں"),
    "future_date": ("{col} is in the future", "{col} آنے والی تاریخ ہے"),
    "bad_enum": ("{col}: write one of {options}", "{col}: ان میں سے ایک لکھیں {options}"),
    "unknown_brand": ("Brand '{v}' is new — it will be created", "برانڈ '{v}' نیا ہے — بن جائے گا"),
    "unknown_model": ("Model '{v}' is new — it will be created", "ماڈل '{v}' نیا ہے — بن جائے گا"),
    "unknown_brand_err": (
        "Brand '{v}' is not in your list (tick 'create new brands and models')",
        "برانڈ '{v}' فہرست میں نہیں ('نئے برانڈ اور ماڈل بنائیں' ٹک کریں)",
    ),
    "unknown_storage": (
        "Storage '{v}' not found — left empty",
        "میموری '{v}' نہیں ملی — خالی چھوڑی",
    ),
    "unknown_colour": ("Colour '{v}' not found — left empty", "رنگ '{v}' نہیں ملا — خالی چھوڑا"),
    "sim_time_needed": (
        "SIM time (months) is needed for Non-PTA / JV",
        "Non-PTA / JV کے لیے سم ٹائم ضروری ہے",
    ),
    "asking_below_cost": ("Asking price is below cost", "طے قیمت لاگت سے کم ہے"),
    "party_new": ("New person '{v}' will be created", "نیا بندہ '{v}' بنے گا"),
    "party_exists": ("Uses the existing person '{v}'", "موجودہ بندہ '{v}' استعمال ہوگا"),
    "party_name_needed": ("Name is needed for a new phone number", "نئے نمبر کے لیے نام ضروری ہے"),
    "opening_needs_direction": (
        "Say who owes (They owe us / We owe them)",
        "بتائیں کون دے گا (ان پر باقی / ہم نے دینا)",
    ),
    "paid_over": ("Paid now is more than the price", "وصول قیمت سے زیادہ ہے"),
    "khata_needs_customer": (
        "Something stays on khata: customer phone is needed",
        "کھاتے میں باقی ہے: گاہک کا فون ضروری ہے",
    ),
    "below_cost": (
        "Sold under cost ({cost}) — tick 'allow selling under cost'",
        "لاگت ({cost}) سے کم بکا — 'لاگت سے کم بیچنے دیں' ٹک کریں",
    ),
    "not_sellable": ("Phone is {status}, not in stock", "موبائل {status} ہے، سٹاک میں نہیں"),
    "sample_row": ("Sample row — skipped", "نمونہ قطار — چھوڑ دی"),
    "empty_row": ("Empty row — skipped", "خالی قطار — چھوڑ دی"),
    "unknown_category": ("Category '{v}' is not in your list", "قسم '{v}' فہرست میں نہیں"),
    "unknown_account": (
        "Account '{v}' not found — cash will be used",
        "اکاؤنٹ '{v}' نہیں ملا — نقد استعمال ہوگا",
    ),
    "sku_exists": ("An item with SKU '{v}' already exists", "SKU '{v}' والی چیز پہلے سے ہے"),
    "too_many_rows": ("At most {n} rows per file", "ایک فائل میں زیادہ سے زیادہ {n} قطاریں"),
    "already_imported": (
        "This same file was imported on {when}",
        "یہی فائل {when} کو درآمد ہو چکی ہے",
    ),
}


def msg(key: str, lang: str | None, **kw) -> str:
    en, ur = MESSAGES[key]
    return (ur if lang == "ur" else en).format(**kw)


_STRIP = " -_./" + "".join(
    chr(c) for c in (0x200C, 0x200F, 0x200E)
)  # spaces, joiners, direction marks


def norm(s) -> str:
    """lower-cased, no spaces / hyphens / underscores: how we match typed words and headers"""
    return "".join(ch for ch in str(s or "").strip().lower() if ch not in _STRIP)


def enum_value(name: str, raw) -> str | None:
    v = norm(raw)
    for value, words in SYNONYMS[name].items():
        if v == norm(value) or v in {norm(w) for w in words}:
            return value
    return None


def enum_options(name: str, lang: str | None) -> str:
    return " / ".join(lbl[1] if lang == "ur" else lbl[0] for lbl in ENUM_LABELS[name].values())
