"""Check every row, show the shopkeeper what will happen, then write it all in one transaction
through the same services the screens use (so ledger, events and audit rows come out the same)."""

import datetime as dt
import hashlib
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from decimal import Decimal

from pydantic import ValidationError as PydanticError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import AppError, ValidationFailed
from app.core.permissions import Cap
from app.core.pk import is_valid_imei, latin_digits, normalise_cnic, normalise_phone
from app.modules.accessories.models import CATEGORIES, Accessory
from app.modules.audit.service import record_audit
from app.modules.bulk.models import BulkImport
from app.modules.bulk.parse import cell_date, cell_int, cell_money, cell_text
from app.modules.bulk.spec import (
    COLUMNS,
    ENUM_LABELS,
    SAMPLE_IMEIS,
    SAMPLE_PHONES,
    SAMPLES,
    enum_options,
    enum_value,
    msg,
    norm,
)
from app.modules.catalogue.models import Brand, Colour, Model, Storage
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus, PtaStatus
from app.modules.expenses.models import ExpenseCategory
from app.modules.ledger.models import CashAccount
from app.modules.parties.models import Party

MAX_ROWS = 2000


@dataclass
class Options:
    create_catalogue: bool = True  # new brands / models are made on the fly
    skip_errors: bool = False  # import the good rows, leave the bad ones
    allow_below_cost: bool = False  # sales: a loss is confirmed by the manager / owner


@dataclass
class RowResult:
    row: int
    status: str = "ok"  # ok | warn | error | skip
    messages: list[str] = field(default_factory=list)
    values: dict = field(default_factory=dict)  # what we understood, for the preview table
    action: str | None = None
    plan: dict = field(default_factory=dict)  # what the import step needs

    def error(self, text: str):
        self.status = "error"
        self.messages.append(text)

    def warn(self, text: str):
        if self.status == "ok":
            self.status = "warn"
        self.messages.append(text)

    def skip(self, text: str):
        self.status = "skip"
        self.messages.append(text)

    def out(self) -> dict:
        return {
            "row": self.row,
            "status": self.status,
            "messages": self.messages,
            "values": {k: _plain(v) for k, v in self.values.items()},
            "action": self.action,
        }


def _plain(v):
    if isinstance(v, Decimal):
        return f"{v:.2f}" if v != v.to_integral_value() else str(int(v))
    if isinstance(v, dt.date | dt.datetime):
        return v.strftime("%d-%m-%Y")
    if isinstance(v, uuid.UUID):
        return str(v)
    return v


@contextmanager
def deferred_commits(db: Session):
    """The screens' services each commit; during a bulk run a commit is only a flush, and the real
    commit (or rollback) happens once here."""
    real = db.commit
    db.commit = db.flush  # type: ignore[method-assign]
    try:
        yield
    except Exception:
        db.commit = real  # type: ignore[method-assign]
        db.rollback()
        raise
    db.commit = real  # type: ignore[method-assign]


def _blank(rec: dict) -> bool:
    return all(cell_text(v) == "" for k, v in rec.items() if not k.startswith("_"))


def _is_sample(kind: str, rec: dict) -> bool:
    if rec.get("_sample"):
        return True
    if kind in ("stock", "sales"):
        return latin_digits(cell_text(rec.get("imei1"))) in SAMPLE_IMEIS
    if kind == "people":
        try:
            return normalise_phone(cell_text(rec.get("phone"))) in SAMPLE_PHONES
        except ValueError:
            return False
    if kind == "items":
        return any(
            norm(rec.get("name")) == norm(s["name"]) and cell_text(rec.get("qty")) == str(s["qty"])
            for s in SAMPLES["items"]
        )
    if kind == "expenses":
        return any(
            cell_text(rec.get("date")) == s["date"]
            and norm(rec.get("category")) == norm(s["category"])
            and cell_text(rec.get("amount")) == str(s["amount"])
            and norm(rec.get("description")) == norm(s.get("description", ""))
            and norm(rec.get("account")) == norm(s.get("account", ""))
            for s in SAMPLES["expenses"]
        )
    return False


class _Field:
    """Reads one typed cell into the row result, recording the error in the shopkeeper's words."""

    def __init__(self, kind: str, rec: dict, res: RowResult, lang: str | None):
        self.cols = {c.key: c for c in COLUMNS[kind]}
        self.rec, self.res, self.lang = rec, res, lang

    def label(self, key: str) -> str:
        c = self.cols[key]
        return c.ur if self.lang == "ur" else c.en

    def text(self, key: str, required: bool = False) -> str:
        v = cell_text(self.rec.get(key))
        if required and not v:
            self.res.error(msg("required", self.lang, col=self.label(key)))
        self.res.values[key] = v or None
        return v

    def money(self, key: str, required: bool = False) -> Decimal | None:
        try:
            v = cell_money(self.rec.get(key))
        except ValueError:
            self.res.error(msg("bad_number", self.lang, col=self.label(key)))
            self.res.values[key] = cell_text(self.rec.get(key))
            return None
        if v is None and required:
            self.res.error(msg("required", self.lang, col=self.label(key)))
        elif v is not None and v < 0:
            self.res.error(msg("negative", self.lang, col=self.label(key)))
        self.res.values[key] = v
        return v

    def int(self, key: str, required: bool = False) -> int | None:
        try:
            v = cell_int(self.rec.get(key))
        except ValueError:
            self.res.error(msg("bad_number", self.lang, col=self.label(key)))
            self.res.values[key] = cell_text(self.rec.get(key))
            return None
        if v is None and required:
            self.res.error(msg("required", self.lang, col=self.label(key)))
        elif v is not None and v < 0:
            self.res.error(msg("negative", self.lang, col=self.label(key)))
        self.res.values[key] = v
        return v

    def date(self, key: str, required: bool = False) -> dt.date | None:
        try:
            v = cell_date(self.rec.get(key))
        except ValueError:
            self.res.error(msg("bad_date", self.lang, col=self.label(key)))
            self.res.values[key] = cell_text(self.rec.get(key))
            return None
        if v is None and required:
            self.res.error(msg("required", self.lang, col=self.label(key)))
        elif v is not None and v > shop_today():
            self.res.error(msg("future_date", self.lang, col=self.label(key)))
        self.res.values[key] = v
        return v

    def imei(self, key: str, required: bool = False) -> str | None:
        v = latin_digits(cell_text(self.rec.get(key))).replace(" ", "").replace("-", "")
        self.res.values[key] = v or None
        if not v:
            if required:
                self.res.error(msg("required", self.lang, col=self.label(key)))
            return None
        if not is_valid_imei(v):
            self.res.error(msg("bad_imei", self.lang))
            return None
        return v

    def phone(self, key: str, required: bool = False) -> str | None:
        raw = cell_text(self.rec.get(key))
        if not raw:
            if required:
                self.res.error(msg("required", self.lang, col=self.label(key)))
            self.res.values[key] = None
            return None
        try:
            v = normalise_phone(raw)
        except ValueError:
            self.res.error(msg("bad_phone", self.lang))
            self.res.values[key] = raw
            return None
        self.res.values[key] = v
        return v

    def enum(
        self, key: str, name: str, required: bool = False, default: str | None = None
    ) -> str | None:
        raw = cell_text(self.rec.get(key))
        if not raw:
            if required:
                self.res.error(msg("required", self.lang, col=self.label(key)))
            self.res.values[key] = (
                default and ENUM_LABELS[name][default][1 if self.lang == "ur" else 0]
            )
            return default
        v = enum_value(name, raw)
        if v is None:
            self.res.error(
                msg(
                    "bad_enum",
                    self.lang,
                    col=self.label(key),
                    options=enum_options(name, self.lang),
                )
            )
            self.res.values[key] = raw
            return None
        self.res.values[key] = ENUM_LABELS[name][v][1 if self.lang == "ur" else 0]
        return v


# ---- lookups shared by the rows of one file ---------------------------------------------------


class _Lookups:
    def __init__(self, db: Session, shop_id: uuid.UUID):
        self.db, self.shop_id = db, shop_id
        vis = lambda col: or_(col.is_(None), col == shop_id)
        self.brands = {
            norm(b.name): b
            for b in db.scalars(
                select(Brand)
                .where(vis(Brand.shop_id), Brand.is_active.is_(True))
                .order_by(Brand.shop_id.is_(None))
            ).all()
        }
        self.models: dict[uuid.UUID, dict[str, Model]] = {}
        for m in db.scalars(
            select(Model).where(vis(Model.shop_id), Model.is_active.is_(True))
        ).all():
            self.models.setdefault(m.brand_id, {})[norm(m.name)] = m
        self.storages = {
            norm(s.name): s for s in db.scalars(select(Storage).where(vis(Storage.shop_id))).all()
        }
        self.colours = {
            norm(c.name): c for c in db.scalars(select(Colour).where(vis(Colour.shop_id))).all()
        }
        self.parties = {
            p.phone: p
            for p in db.scalars(
                select(Party).where(Party.shop_id == shop_id, Party.is_active.is_(True))
            ).all()
        }
        self.new_brands: dict[str, str] = {}  # norm → display name, created at import
        self.new_models: dict[tuple[str, str], str] = {}
        self.new_parties: dict[str, dict] = {}

    def storage(self, raw: str) -> Storage | None:
        if not raw:
            return None
        k = norm(raw)
        return (
            self.storages.get(k)
            or self.storages.get(k.replace("gb", "") + "gb")
            or self.storages.get(k + "gb")
        )

    def colour(self, raw: str) -> Colour | None:
        return self.colours.get(norm(raw)) if raw else None


# ---- per-kind checks --------------------------------------------------------------------------


def _check_stock(db, ctx, rows, lang, opts: Options) -> list[RowResult]:
    look = _Lookups(db, ctx.shop_id)
    seen: set[str] = set()
    out = []
    for rec in rows:
        res = RowResult(rec["_row"])
        out.append(res)
        if _blank(rec):
            res.skip(msg("empty_row", lang))
            continue
        if _is_sample("stock", rec):
            res.skip(msg("sample_row", lang))
            continue
        f = _Field("stock", rec, res, lang)
        imei = f.imei("imei1", required=True)
        if imei:
            if imei in seen:
                res.error(msg("imei_dup_file", lang))
            seen.add(imei)
            if db.scalar(
                select(Device.id).where(
                    Device.shop_id == ctx.shop_id, or_(Device.imei1 == imei, Device.imei2 == imei)
                )
            ):
                res.error(msg("imei_exists", lang))
        imei2 = f.imei("imei2")
        brand_raw = f.text("brand", required=True)
        model_raw = f.text("model", required=True)
        if model_raw and " · " in model_raw:  # picked from the dropdown: "Brand · Model"
            b2, model_raw = model_raw.split(" · ", 1)
            brand_raw = brand_raw or b2
            res.values["model"] = model_raw
        brand = look.brands.get(norm(brand_raw)) if brand_raw else None
        brand_key, model_key = norm(brand_raw), norm(model_raw)
        if brand_raw and brand is None:
            if opts.create_catalogue:
                if brand_key not in look.new_brands:
                    res.warn(msg("unknown_brand", lang, v=brand_raw))
                look.new_brands.setdefault(brand_key, brand_raw.strip())
            else:
                res.error(msg("unknown_brand_err", lang, v=brand_raw))
        model = look.models.get(brand.id, {}).get(model_key) if brand else None
        if model_raw and brand_raw and model is None and res.status != "error":
            if opts.create_catalogue:
                if (brand_key, model_key) not in look.new_models:
                    res.warn(msg("unknown_model", lang, v=model_raw))
                look.new_models.setdefault((brand_key, model_key), model_raw.strip())
            else:
                res.error(msg("unknown_brand_err", lang, v=model_raw))
        storage_raw = f.text("storage")
        storage = look.storage(storage_raw)
        if storage_raw and storage is None:
            res.warn(msg("unknown_storage", lang, v=storage_raw))
            res.values["storage"] = None
        colour_raw = f.text("colour")
        colour = look.colour(colour_raw)
        if colour_raw and colour is None:
            res.warn(msg("unknown_colour", lang, v=colour_raw))
            res.values["colour"] = None
        condition = f.enum("condition", "condition", required=True)
        pta = f.enum("pta", "pta", required=True)
        sim_time = f.int("sim_time")
        if pta in (PtaStatus.NON_PTA, PtaStatus.JV) and sim_time is None:
            res.error(msg("sim_time_needed", lang))  # the device schema insists on it
        cost = f.money("cost", required=True)
        asking = f.money("asking")
        if cost is not None and asking is not None and asking < cost:
            res.error(msg("asking_below_cost", lang))
        sup_phone = f.phone("supplier_phone")
        sup_name = f.text("supplier_name")
        party = look.parties.get(sup_phone) if sup_phone else None
        if sup_phone and party is None:
            if not sup_name and sup_phone not in look.new_parties:
                res.error(msg("party_name_needed", lang))
            elif sup_phone not in look.new_parties:
                look.new_parties[sup_phone] = {"name": sup_name, "kinds": ["supplier"]}
                res.warn(msg("party_new", lang, v=sup_name))
        elif party is not None:
            res.values["supplier_name"] = party.name
        date = f.date("date")
        paid = f.money("paid")
        notes = f.text("notes")
        res.action = "purchase" if sup_phone else "opening_stock"
        res.plan = {
            "imei1": imei,
            "imei2": imei2 or None,
            "brand_key": brand_key,
            "model_key": model_key,
            "brand_id": brand.id if brand else None,
            "model_id": model.id if model else None,
            "storage_id": storage.id if storage else None,
            "colour_id": colour.id if colour else None,
            "condition": condition,
            "pta": pta,
            "sim_time": sim_time,
            "cost": cost,
            "asking": asking,
            "supplier_phone": sup_phone,
            "party_id": party.id if party else None,
            "date": date,
            "paid": paid or Decimal(0),
            "notes": notes or None,
        }
    return out


def _check_people(db, ctx, rows, lang, opts: Options) -> list[RowResult]:
    look = _Lookups(db, ctx.shop_id)
    seen: set[str] = set()
    out = []
    for rec in rows:
        res = RowResult(rec["_row"])
        out.append(res)
        if _blank(rec):
            res.skip(msg("empty_row", lang))
            continue
        if _is_sample("people", rec):
            res.skip(msg("sample_row", lang))
            continue
        f = _Field("people", rec, res, lang)
        name = f.text("name", required=True)
        if name and len(name) < 2:
            res.error(msg("required", lang, col=f.label("name")))
        phone = f.phone("phone", required=True)
        if phone:
            if phone in seen:
                res.error(msg("phone_dup_file", lang))
            seen.add(phone)
            if phone in look.parties:
                res.skip(msg("party_exists", lang, v=look.parties[phone].name))
                f.text("type")
                f.text("city")
                f.money("opening")
                continue
        ptype = f.enum("type", "party_type", required=True)
        city = f.text("city")
        cnic_raw = f.text("cnic")
        cnic = None
        if cnic_raw:
            try:
                cnic = normalise_cnic(cnic_raw)
                res.values["cnic"] = cnic
            except ValueError:
                res.error(msg("bad_number", lang, col=f.label("cnic")))
        opening = f.money("opening")
        direction = f.enum("direction", "direction")
        if opening and opening > 0 and direction is None:
            res.error(msg("opening_needs_direction", lang))
        notes = f.text("notes")
        res.action = "create"
        kinds = {
            "customer": ["customer"],
            "supplier": ["supplier"],
            "shop": ["shop"],
            "both": ["customer", "supplier"],
        }.get(ptype or "", ["customer"])
        res.plan = {
            "name": name,
            "phone": phone,
            "kinds": kinds,
            "city": city or None,
            "cnic": cnic,
            "opening": opening or Decimal(0),
            "they_owe": direction == "they_owe",
            "notes": notes or None,
        }
    return out


def _check_items(db, ctx, rows, lang, opts: Options) -> list[RowResult]:
    skus = {
        s.upper()
        for s in db.scalars(select(Accessory.sku).where(Accessory.shop_id == ctx.shop_id)).all()
    }
    seen: set[str] = set()
    out = []
    for rec in rows:
        res = RowResult(rec["_row"])
        out.append(res)
        if _blank(rec):
            res.skip(msg("empty_row", lang))
            continue
        if _is_sample("items", rec):
            res.skip(msg("sample_row", lang))
            continue
        f = _Field("items", rec, res, lang)
        name = f.text("name", required=True)
        cat_raw = f.text("category")
        category = "other"
        if cat_raw:
            k = norm(cat_raw)
            match = next(
                (c for c in CATEGORIES if norm(c) == k or norm(c).rstrip("s") == k.rstrip("s")),
                None,
            )
            if match is None:
                res.warn(msg("unknown_category", lang, v=cat_raw))
            category = match or "other"
        res.values["category"] = category
        sku = f.text("sku").upper() or None
        if sku:
            if sku in skus or sku in seen:
                res.error(msg("sku_exists", lang, v=sku))
            seen.add(sku)
        qty = f.int("qty", required=True)
        cost = f.money("cost", required=True)
        price = f.money("price", required=True)
        reorder = f.int("reorder")
        res.action = "create"
        res.plan = {
            "name": name,
            "category": category,
            "sku": sku,
            "qty": qty or 0,
            "cost": cost or Decimal(0),
            "price": price or Decimal(0),
            "reorder": 5 if reorder is None else reorder,
        }
    return out


def _check_sales(db, ctx, rows, lang, opts: Options) -> list[RowResult]:
    look = _Lookups(db, ctx.shop_id)
    seen: set[str] = set()
    out = []
    for rec in rows:
        res = RowResult(rec["_row"])
        out.append(res)
        if _blank(rec):
            res.skip(msg("empty_row", lang))
            continue
        if _is_sample("sales", rec):
            res.skip(msg("sample_row", lang))
            continue
        f = _Field("sales", rec, res, lang)
        imei = f.imei("imei1", required=True)
        device = None
        if imei:
            if imei in seen:
                res.error(msg("imei_dup_file", lang))
            seen.add(imei)
            device = db.scalar(
                select(Device).where(
                    Device.shop_id == ctx.shop_id, or_(Device.imei1 == imei, Device.imei2 == imei)
                )
            )
            if device is None:
                res.error(msg("imei_not_in_stock", lang))
            elif device.status != DeviceStatus.IN_STOCK:
                res.error(msg("not_sellable", lang, status=device.status.replace("_", " ")))
        price = f.money("price", required=True)
        paid = f.money("paid", required=True)
        if price is not None and paid is not None and paid > price:
            res.error(msg("paid_over", lang))
        cus_phone = f.phone("customer_phone")
        cus_name = f.text("customer_name")
        party = look.parties.get(cus_phone) if cus_phone else None
        if cus_phone and party is None:
            if not cus_name and cus_phone not in look.new_parties:
                res.error(msg("party_name_needed", lang))
            elif cus_phone not in look.new_parties:
                look.new_parties[cus_phone] = {"name": cus_name, "kinds": ["customer"]}
                res.warn(msg("party_new", lang, v=cus_name))
        elif party is not None:
            res.values["customer_name"] = party.name
        if price is not None and paid is not None and price - paid > 0 and not cus_phone:
            res.error(msg("khata_needs_customer", lang))
        if (
            device is not None
            and price is not None
            and device.cost_price is not None
            and price < device.cost_price
        ):
            if opts.allow_below_cost and ctx.can(Cap.VIEW_COST):
                res.warn(msg("below_cost", lang, cost=_plain(device.cost_price)).split(" — ")[0])
            else:
                res.error(msg("below_cost", lang, cost=_plain(device.cost_price)))
        date = f.date("date")
        notes = f.text("notes")
        res.action = "sale"
        res.plan = {
            "device_id": device.id if device else None,
            "price": price,
            "paid": paid or Decimal(0),
            "customer_phone": cus_phone,
            "party_id": party.id if party else None,
            "date": date,
            "notes": notes or None,
        }
    return out


def _check_expenses(db, ctx, rows, lang, opts: Options) -> list[RowResult]:
    from app.modules.expenses.service import seed_categories

    seed_categories(db)
    cats = db.scalars(
        select(ExpenseCategory).where(
            or_(ExpenseCategory.shop_id.is_(None), ExpenseCategory.shop_id == ctx.shop_id),
            ExpenseCategory.is_active.is_(True),
        )
    ).all()
    cat_by: dict[str, ExpenseCategory] = {}
    for c in cats:
        for k in (c.key, c.name, c.name_ur or ""):
            if k:
                cat_by.setdefault(norm(k), c)
    accounts = db.scalars(
        select(CashAccount).where(
            CashAccount.shop_id == ctx.shop_id, CashAccount.is_active.is_(True)
        )
    ).all()
    acc_by = {}
    for a in accounts:
        for k in (a.name, a.name_ur or ""):
            if k:
                acc_by.setdefault(norm(k), a)
    out = []
    for rec in rows:
        res = RowResult(rec["_row"])
        out.append(res)
        if _blank(rec):
            res.skip(msg("empty_row", lang))
            continue
        if _is_sample("expenses", rec):
            res.skip(msg("sample_row", lang))
            continue
        f = _Field("expenses", rec, res, lang)
        date = f.date("date", required=True)
        cat_raw = f.text("category", required=True)
        cat = cat_by.get(norm(cat_raw)) if cat_raw else None
        if cat_raw and cat is None:
            # "Shop rent" vs "rent": accept a category whose name contains the word, or vice versa
            k = norm(cat_raw)
            cat = next((c for kk, c in cat_by.items() if k and (k in kk or kk in k)), None)
        if cat_raw and cat is None:
            res.error(msg("unknown_category", lang, v=cat_raw))
        elif cat is not None:
            res.values["category"] = cat.name_ur if lang == "ur" and cat.name_ur else cat.name
        amount = f.money("amount", required=True)
        if amount is not None and amount <= 0:
            res.error(msg("negative", lang, col=f.label("amount")))
        description = f.text("description")
        acc_raw = f.text("account")
        account = acc_by.get(norm(acc_raw)) if acc_raw else None
        if acc_raw and account is None and norm(acc_raw) not in ("cash", "نقد"):
            res.warn(msg("unknown_account", lang, v=acc_raw))
            res.values["account"] = None
        res.action = "create"
        res.plan = {
            "date": date,
            "category_id": cat.id if cat else None,
            "amount": amount,
            "description": description or None,
            "cash_account_id": account.id if account else None,
        }
    return out


CHECKS = {
    "stock": _check_stock,
    "people": _check_people,
    "items": _check_items,
    "sales": _check_sales,
    "expenses": _check_expenses,
}


# ---- preview ----------------------------------------------------------------------------------


def preview(
    db: Session,
    ctx,
    kind: str,
    rows: list[dict],
    lang: str | None,
    opts: Options,
    *,
    file_name: str | None,
    sha: str,
) -> dict:
    results = CHECKS[kind](db, ctx, rows, lang, opts)
    counts = {s: sum(1 for r in results if r.status == s) for s in ("ok", "warn", "error", "skip")}
    importable = counts["ok"] + counts["warn"]
    earlier = db.scalar(
        select(BulkImport)
        .where(BulkImport.shop_id == ctx.shop_id, BulkImport.file_sha256 == sha)
        .order_by(BulkImport.created_at.desc())
    )
    cols = COLUMNS[kind]
    return {
        "kind": kind,
        "file_name": file_name,
        "rows_total": len(results),
        "counts": counts,
        "can_import": importable > 0 and (counts["error"] == 0 or opts.skip_errors),
        "already_imported_at": earlier.created_at.isoformat() if earlier else None,
        "columns": [{"key": c.key, "label": c.ur if lang == "ur" else c.en} for c in cols],
        "rows": [r.out() for r in results],
        "_results": results,
    }


# ---- import -----------------------------------------------------------------------------------


def run_import(
    db: Session,
    ctx,
    kind: str,
    rows: list[dict],
    lang: str | None,
    opts: Options,
    *,
    file_name: str | None,
    sha: str,
) -> dict:
    pv = preview(db, ctx, kind, rows, lang, opts, file_name=file_name, sha=sha)
    results: list[RowResult] = pv.pop("_results")
    if not pv["can_import"]:
        raise ValidationFailed(
            code="bulk_has_errors",
            message_en="Some rows have errors. Fix them or tick 'skip rows with errors'.",
            message_ur="کچھ قطاروں میں غلطیاں ہیں۔ انہیں ٹھیک کریں یا 'غلط قطاریں چھوڑ دیں' ٹک کریں۔",
            details=pv,
        )
    todo = [r for r in results if r.status in ("ok", "warn")]
    created: dict[str, int] = {}
    failed = False
    with deferred_commits(db):
        try:
            WRITERS[kind](db, ctx, todo, lang, opts, created)
        except AppError:
            failed = True
            raise
        finally:
            if failed:
                pass
        row = BulkImport(
            shop_id=ctx.shop_id,
            kind=kind,
            file_name=file_name,
            file_sha256=sha,
            rows_total=len(results),
            rows_ok=len(todo),
            rows_failed=pv["counts"]["error"],
            rows_skipped=pv["counts"]["skip"],
            summary={"created": created, "options": opts.__dict__},
            created_by=ctx.id,
        )
        db.add(row)
        db.flush()
        record_audit(
            db,
            shop_id=ctx.shop_id,
            user_id=ctx.id,
            entity="bulk_import",
            entity_id=row.id,
            action="import",
            after={"kind": kind, "file": file_name, "rows": len(todo), "created": created},
        )
    db.commit()
    return {**pv, "import_id": str(row.id), "created": created, "rows": [r.out() for r in results]}


def _row_error(res: RowResult, exc: Exception, lang: str | None) -> ValidationFailed:
    """a service or schema refused the row: the import stops (rolled back) with the row named"""
    if isinstance(exc, AppError):
        en, ur, code = exc.message_en, exc.message_ur or exc.message_en, exc.code
    else:  # pydantic: the first message, without the "Value error, " prefix
        en = ur = str(exc.errors()[0].get("msg", "invalid")).removeprefix("Value error, ")
        code = "invalid"
    res.error(ur if lang == "ur" else en)
    return ValidationFailed(
        code="bulk_row_failed",
        message_en=f"Row {res.row}: {en}",
        message_ur=f"قطار {res.row}: {ur}",
        details={"row": res.row, "code": code},
    )


def _ensure_party(db, ctx, look_new: dict, phone: str, created: dict) -> uuid.UUID:
    from app.modules.parties.schemas import PartyCreate
    from app.modules.parties.service import by_phone, create_party

    p = by_phone(db, ctx.shop_id, phone)
    if p is not None and p.is_active:
        return p.id
    info = look_new[phone]
    party = create_party(
        db, ctx.shop_id, ctx.id, PartyCreate(name=info["name"], phone=phone, kinds=info["kinds"])
    )
    created["parties"] = created.get("parties", 0) + 1
    return party.id


def _write_stock(db, ctx, todo: list[RowResult], lang, opts: Options, created: dict) -> None:
    from app.modules.catalogue.schemas import BrandCreate, ModelCreate
    from app.modules.catalogue.service import create_brand, create_model
    from app.modules.devices.schemas import DeviceIdentity, OpeningStockIn
    from app.modules.devices.service import add_opening_stock
    from app.modules.purchases.models import PurchaseKind
    from app.modules.purchases.schemas import DeviceLineIn, PurchaseCreate
    from app.modules.purchases.service import create_purchase

    look = _Lookups(db, ctx.shop_id)
    new_parties: dict[str, dict] = {}
    for r in todo:
        if r.plan["supplier_phone"] and r.plan["party_id"] is None:
            new_parties.setdefault(
                r.plan["supplier_phone"],
                {"name": r.values.get("supplier_name") or "", "kinds": ["supplier"]},
            )

    def brand_id(r: RowResult) -> uuid.UUID:
        if r.plan["brand_id"]:
            return r.plan["brand_id"]
        b = look.brands.get(r.plan["brand_key"])
        if b is None:
            out = create_brand(db, ctx.shop_id, ctx.id, BrandCreate(name=r.values["brand"]))
            b = db.get(Brand, out["id"])
            look.brands[r.plan["brand_key"]] = b
            created["brands"] = created.get("brands", 0) + 1
        return b.id

    def model_id(r: RowResult, bid: uuid.UUID) -> uuid.UUID:
        if r.plan["model_id"]:
            return r.plan["model_id"]
        m = look.models.get(bid, {}).get(r.plan["model_key"])
        if m is None:
            out = create_model(
                db, ctx.shop_id, ctx.id, ModelCreate(brand_id=bid, name=r.values["model"])
            )
            m = db.get(Model, out["id"])
            look.models.setdefault(bid, {})[r.plan["model_key"]] = m
            created["models"] = created.get("models", 0) + 1
        return m.id

    def identity(r: RowResult) -> DeviceIdentity:
        bid = brand_id(r)
        return DeviceIdentity(
            imei1=r.plan["imei1"],
            imei2=r.plan["imei2"],
            brand_id=bid,
            model_id=model_id(r, bid),
            storage_id=r.plan["storage_id"],
            colour_id=r.plan["colour_id"],
            condition=r.plan["condition"],
            pta_status=r.plan["pta"],
            sim_time_months=r.plan["sim_time"],
            notes=r.plan["notes"],
        )

    groups: dict[tuple, list[RowResult]] = {}
    for r in todo:
        try:
            if r.action == "opening_stock":
                ident = identity(r)
                add_opening_stock(
                    db,
                    ctx.shop_id,
                    ctx.id,
                    OpeningStockIn(
                        **ident.model_dump(),
                        cost_price=r.plan["cost"],
                        asking_price=r.plan["asking"],
                    ),
                )
                created["devices"] = created.get("devices", 0) + 1
            else:
                pid = r.plan["party_id"] or _ensure_party(
                    db, ctx, new_parties, r.plan["supplier_phone"], created
                )
                r.plan["party_id"] = pid
                groups.setdefault((pid, r.plan["date"]), []).append(r)
        except (AppError, PydanticError) as exc:
            raise _row_error(r, exc, lang) from exc
    for (pid, date), rs in groups.items():
        try:
            lines = [
                DeviceLineIn(device=identity(r), cost=r.plan["cost"], asking_price=r.plan["asking"])
                for r in rs
            ]
            create_purchase(
                db,
                ctx.shop_id,
                ctx.id,
                PurchaseCreate(
                    kind=PurchaseKind.SUPPLIER,
                    party_id=pid,
                    date=date,
                    devices=lines,
                    paid=sum((r.plan["paid"] for r in rs), Decimal(0)),
                    notes="Bulk import",
                ),
                commit=False,
            )
            created["devices"] = created.get("devices", 0) + len(rs)
            created["purchases"] = created.get("purchases", 0) + 1
        except (AppError, PydanticError) as exc:
            raise _row_error(rs[0], exc, lang) from exc


def _write_people(db, ctx, todo, lang, opts, created) -> None:
    from app.modules.ledger.service import post_party_opening_balance
    from app.modules.parties.schemas import PartyCreate
    from app.modules.parties.service import create_party

    for r in todo:
        try:
            p = create_party(
                db,
                ctx.shop_id,
                ctx.id,
                PartyCreate(
                    name=r.plan["name"],
                    phone=r.plan["phone"],
                    kinds=r.plan["kinds"],
                    city=r.plan["city"],
                    cnic=r.plan["cnic"],
                    notes=r.plan["notes"],
                ),
            )
            created["parties"] = created.get("parties", 0) + 1
            if r.plan["opening"] > 0:
                post_party_opening_balance(
                    db,
                    ctx.shop_id,
                    ctx.id,
                    p.id,
                    r.plan["opening"],
                    r.plan["they_owe"],
                    "Opening balance (bulk import)",
                )
                created["opening_balances"] = created.get("opening_balances", 0) + 1
        except (AppError, PydanticError) as exc:
            raise _row_error(r, exc, lang) from exc


def _write_items(db, ctx, todo, lang, opts, created) -> None:
    from app.modules.accessories.schemas import AccessoryCreate
    from app.modules.accessories.service import create

    for r in todo:
        try:
            create(
                db,
                ctx.shop_id,
                ctx.id,
                AccessoryCreate(
                    sku=r.plan["sku"],
                    name=r.plan["name"],
                    category=r.plan["category"],
                    price=r.plan["price"],
                    reorder_level=r.plan["reorder"],
                    opening_qty=r.plan["qty"],
                    opening_cost=r.plan["cost"],
                ),
            )
            created["items"] = created.get("items", 0) + 1
        except (AppError, PydanticError) as exc:
            raise _row_error(r, exc, lang) from exc


def _write_sales(db, ctx, todo, lang, opts: Options, created) -> None:
    from app.modules.sales.schemas import DeviceSaleLineIn, SaleCreate
    from app.modules.sales.service import create_sale

    new_parties = {}
    for r in todo:
        if r.plan["customer_phone"] and r.plan["party_id"] is None:
            new_parties.setdefault(
                r.plan["customer_phone"],
                {"name": r.values.get("customer_name") or "", "kinds": ["customer"]},
            )
    for r in todo:
        try:
            pid = r.plan["party_id"] or (
                _ensure_party(db, ctx, new_parties, r.plan["customer_phone"], created)
                if r.plan["customer_phone"]
                else None
            )
            create_sale(
                db,
                ctx.shop_id,
                ctx,
                SaleCreate(
                    party_id=pid,
                    date=r.plan["date"],
                    devices=[
                        DeviceSaleLineIn(device_id=r.plan["device_id"], price=r.plan["price"])
                    ],
                    paid=r.plan["paid"],
                    notes=r.plan["notes"],
                    below_cost_ok=opts.allow_below_cost,
                ),
                commit=False,
            )
            created["invoices"] = created.get("invoices", 0) + 1
        except (AppError, PydanticError) as exc:
            raise _row_error(r, exc, lang) from exc


def _write_expenses(db, ctx, todo, lang, opts, created) -> None:
    from app.modules.expenses.schemas import ExpenseCreate
    from app.modules.expenses.service import create_expense

    for r in todo:
        try:
            create_expense(
                db,
                ctx.shop_id,
                ctx.id,
                ExpenseCreate(
                    category_id=r.plan["category_id"],
                    amount=r.plan["amount"],
                    cash_account_id=r.plan["cash_account_id"],
                    date=r.plan["date"],
                    description=r.plan["description"],
                ),
            )
            created["expenses"] = created.get("expenses", 0) + 1
        except (AppError, PydanticError) as exc:
            raise _row_error(r, exc, lang) from exc


WRITERS = {
    "stock": _write_stock,
    "people": _write_people,
    "items": _write_items,
    "sales": _write_sales,
    "expenses": _write_expenses,
}


# ---- export (same layout as the template, so it can be edited and re-imported) ---------------


def export_rows(db: Session, ctx, kind: str, lang: str | None) -> list[list]:
    ur = lang == "ur"
    lbl = lambda name, key: (
        ENUM_LABELS[name][key][1 if ur else 0] if key in ENUM_LABELS[name] else key
    )
    sid = ctx.shop_id
    if kind == "stock":
        q = (
            select(Device, Brand.name, Model.name, Storage.name, Colour.name)
            .join(Brand, Brand.id == Device.brand_id)
            .join(Model, Model.id == Device.model_id)
            .outerjoin(Storage, Storage.id == Device.storage_id)
            .outerjoin(Colour, Colour.id == Device.colour_id)
            .where(Device.shop_id == sid, Device.status == DeviceStatus.IN_STOCK)
            .order_by(Device.created_at)
        )
        return [
            [
                d.imei1,
                d.imei2,
                b,
                m,
                s,
                c,
                lbl("condition", d.condition),
                lbl("pta", d.pta_status),
                d.sim_time_months,
                _num(d.cost_price),
                _num(d.asking_price),
                None,
                None,
                d.created_at.strftime("%d-%m-%Y"),
                None,
                d.notes,
            ]
            for d, b, m, s, c in db.execute(q).all()
        ]
    if kind == "people":
        rows = db.scalars(
            select(Party)
            .where(Party.shop_id == sid, Party.is_active.is_(True))
            .order_by(Party.name)
        ).all()

        def ptype(k):
            ks = set(k or [])
            if {"customer", "supplier"} <= ks:
                return lbl("party_type", "both")
            for x in ("supplier", "shop", "customer"):
                if x in ks:
                    return lbl("party_type", x)
            return lbl("party_type", "customer")

        return [
            [
                p.name,
                p.phone,
                ptype(p.kinds),
                p.city,
                p.cnic,
                _num(abs(p.balance)) if p.balance else None,
                (lbl("direction", "they_owe") if p.balance > 0 else lbl("direction", "we_owe"))
                if p.balance
                else None,
                p.notes,
            ]
            for p in rows
        ]
    if kind == "items":
        rows = db.scalars(
            select(Accessory)
            .where(Accessory.shop_id == sid, Accessory.is_active.is_(True))
            .order_by(Accessory.name)
        ).all()
        return [
            [a.name, a.category, a.sku, a.qty, _num(a.avg_cost), _num(a.price), a.reorder_level]
            for a in rows
        ]
    if kind == "sales":
        from app.modules.sales.models import Invoice, InvoiceLine

        q = (
            select(Invoice, InvoiceLine, Device.imei1, Party.phone, Party.name)
            .join(InvoiceLine, InvoiceLine.invoice_id == Invoice.id)
            .join(Device, Device.id == InvoiceLine.device_id)
            .outerjoin(Party, Party.id == Invoice.party_id)
            .where(Invoice.shop_id == sid, Invoice.status != "void")
            .order_by(Invoice.date, Invoice.no)
        )
        return [
            [
                imei,
                _num(ln.unit_price),
                _num(inv.paid),
                phone,
                name,
                inv.date.strftime("%d-%m-%Y"),
                inv.notes,
            ]
            for inv, ln, imei, phone, name in db.execute(q).all()
        ]
    if kind == "expenses":
        from app.modules.expenses.models import Expense

        q = (
            select(Expense, ExpenseCategory.name, ExpenseCategory.name_ur, CashAccount.name)
            .join(ExpenseCategory, ExpenseCategory.id == Expense.category_id)
            .join(CashAccount, CashAccount.id == Expense.cash_account_id)
            .where(Expense.shop_id == sid)
            .order_by(Expense.date, Expense.no)
        )
        return [
            [
                e.date.strftime("%d-%m-%Y"),
                (cu if ur and cu else cn),
                _num(e.amount),
                e.description,
                acc,
            ]
            for e, cn, cu, acc in db.execute(q).all()
        ]
    return []


def _num(v):
    if v is None:
        return None
    v = Decimal(v)
    return int(v) if v == v.to_integral_value() else float(v)


def list_imports(db: Session, shop_id: uuid.UUID, limit: int = 20) -> list[dict]:
    from app.modules.auth.models import User

    rows = db.execute(
        select(BulkImport, User.name)
        .outerjoin(User, User.id == BulkImport.created_by)
        .where(BulkImport.shop_id == shop_id)
        .order_by(BulkImport.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": str(b.id),
            "kind": b.kind,
            "file_name": b.file_name,
            "rows_total": b.rows_total,
            "rows_ok": b.rows_ok,
            "rows_failed": b.rows_failed,
            "rows_skipped": b.rows_skipped,
            "created": (b.summary or {}).get("created", {}),
            "by": who,
            "at": b.created_at.isoformat(),
        }
        for b, who in rows
    ]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def count_devices(db: Session, shop_id: uuid.UUID) -> int:
    return db.scalar(select(func.count(Device.id)).where(Device.shop_id == shop_id)) or 0
