"""FBR Digital Invoicing (docs/36 §4, ADR-050): a shop that switches it on sends every sale bill to
FBR through PRAL's DI API and prints the FBR invoice number with its QR code.

- Settings live on `shops.fbr_settings`; the security token is encrypted with a key derived from the
  server's SECRET_KEY and is never returned to a browser or the app.
- A bill is queued in the same transaction as the sale (`enqueue`), then sent right after and again
  by the scheduler every minute until FBR answers (`send_pending`). A bill FBR accepted is never
  posted again; one it rejected waits for the shop to fix the cause and press "Send again".
- Nothing here can stop a sale: FBR being down only leaves the bill waiting.
"""

import base64
import datetime as dt
import hashlib
import uuid
from decimal import Decimal

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.modules.auth.models import Shop
from app.modules.fbr.models import FbrStatus, FbrSubmission
from app.modules.ledger.service import money

URL_POST = "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata"
URL_VALIDATE_SANDBOX = "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb"
UOM = "Numbers, pieces, units"
# what goes on a line by the kind of goods (the owner's tax adviser may change these in Settings)
DEFAULT_KINDS = {
    "phone": {"sale_type": "Mobile Phones", "hs_code": "8517.1300", "scenario": "SN015"},
    "device": {
        "sale_type": "Goods at standard rate (default)",
        "hs_code": "8471.3010",
        "scenario": "SN026",
    },
    "item": {
        "sale_type": "Goods at standard rate (default)",
        "hs_code": "8504.4090",
        "scenario": "SN026",
    },
}
PROVINCES = {
    "punjab": "PUNJAB",
    "sindh": "SINDH",
    "kpk": "KHYBER PAKHTUNKHWA",
    "balochistan": "BALOCHISTAN",
    "islamabad": "CAPITAL TERRITORY",
    "gb": "GILGIT BALTISTAN",
    "ajk": "AZAD JAMMU AND KASHMIR",
}
RETRY_MINUTES = (1, 2, 5, 10, 30, 60)


# ---- settings -------------------------------------------------------------------------------------


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(
        hashlib.sha256(f"fbr-token:{settings.secret_key}".encode()).digest()
    )
    return Fernet(key)


def raw_settings(shop: Shop) -> dict:
    s = dict(shop.fbr_settings or {})
    kinds = {k: {**v, **((s.get("kinds") or {}).get(k) or {})} for k, v in DEFAULT_KINDS.items()}
    return {
        "enabled": bool(s.get("enabled")),
        "env": s.get("env") if s.get("env") in ("sandbox", "production") else "sandbox",
        "province": s.get("province") or shop.province or "punjab",
        "kinds": kinds,
        "token_enc": s.get("token_enc"),
    }


def settings_out(shop: Shop) -> dict:
    s = raw_settings(shop)
    token_set = bool(s.pop("token_enc"))
    return {
        **s,
        "token_set": token_set,
        "ntn": shop.ntn,
        "strn": shop.strn,
        "ready": token_set and bool(shop.ntn),
    }


def token_of(shop: Shop) -> str | None:
    enc = raw_settings(shop)["token_enc"]
    if not enc:
        return None
    try:
        return _fernet().decrypt(enc.encode()).decode()
    except InvalidToken:  # the server's secret changed: the owner must paste the token again
        return None


def save_settings(db: Session, shop: Shop, data: dict) -> dict:
    s = dict(shop.fbr_settings or {})
    for k in ("enabled", "env", "province"):
        if k in data and data[k] is not None:
            s[k] = data[k]
    if data.get("kinds"):
        s["kinds"] = {
            k: {
                f: str(v)[:80]
                for f, v in (data["kinds"].get(k) or {}).items()
                if f in ("sale_type", "hs_code", "scenario")
            }
            for k in DEFAULT_KINDS
        }
    if data.get("token"):
        s["token_enc"] = _fernet().encrypt(data["token"].strip().encode()).decode()
    if data.get("clear_token"):
        s.pop("token_enc", None)
    if s.get("enabled") and not (s.get("token_enc") and shop.ntn):
        raise ValidationFailed(
            code="fbr_not_ready",
            message_en="Add the FBR security token and the shop's NTN (Settings → Tax registration) before switching FBR on.",
            message_ur="FBR آن کرنے سے پہلے FBR ٹوکن اور دکان کا NTN (سیٹنگز ← ٹیکس رجسٹریشن) لکھیں۔",
        )
    shop.fbr_settings = s
    db.commit()
    return settings_out(shop)


# ---- the invoice as FBR wants it ---------------------------------------------------------------------


def _num(v: Decimal) -> float:
    return float(money(v))


def _device_name(db: Session, device) -> str | None:
    if device is None:
        return None
    from app.modules.catalogue.models import Brand, Model

    b, m = db.get(Brand, device.brand_id), db.get(Model, device.model_id)
    return " ".join(x for x in (b.name if b else None, m.name if m else None, device.imei1) if x)


def build_payload(db: Session, shop: Shop, inv, env: str) -> dict:
    """The DI `postinvoicedata` body for a sale bill (PRAL DI API specification v1)."""
    from app.modules.devices.models import Device
    from app.modules.parties.models import Party

    st = raw_settings(shop)
    party = db.get(Party, inv.party_id) if inv.party_id else None
    province = PROVINCES.get(st["province"], st["province"].upper())
    items = []
    scenario = None
    for ln in inv.lines:
        device = db.get(Device, ln.device_id) if ln.kind == "device" and ln.device_id else None
        # a phone, another device (tablet / watch), or a counted / typed item
        kind_key = (
            ("phone" if (device is None or device.category == "phone") else "device")
            if ln.kind == "device"
            else "item"
        )
        kind = st["kinds"][kind_key]
        scenario = scenario or kind.get("scenario")
        rate = money(ln.tax_rate) if ln.tax_rate is not None else money(inv.tax_rate)
        excl = money(ln.line_total - ln.tax_share)
        items.append(
            {
                "hsCode": kind["hs_code"],
                "productDescription": (ln.description or _device_name(db, device) or "Item")[:100],
                "rate": f"{rate:.0f}%"
                if rate > ZERO
                else ("Exempt" if kind["sale_type"] != "Mobile Phones" else "0%"),
                "uoM": UOM,
                "quantity": ln.qty,
                "totalValues": _num(ln.line_total),
                "valueSalesExcludingST": _num(excl),
                "fixedNotifiedValueOrRetailPrice": 0,
                "salesTaxApplicable": _num(ln.tax_share),
                "salesTaxWithheldAtSource": 0,
                "extraTax": "",
                "furtherTax": 0,
                "sroScheduleNo": "",
                "fedPayable": 0,
                "discount": _num(ln.discount_share),
                "saleType": kind["sale_type"],
                "sroItemSerialNo": "",
            }
        )
    body = {
        "invoiceType": "Sale Invoice",
        "invoiceDate": inv.date.isoformat(),
        "sellerNTNCNIC": "".join(c for c in (shop.ntn or "") if c.isdigit())[:13],
        "sellerBusinessName": shop.legal_name or shop.name,
        "sellerProvince": province,
        "sellerAddress": shop.address or shop.city or "",
        "buyerNTNCNIC": "".join(c for c in ((party.cnic if party else None) or "") if c.isdigit()),
        "buyerBusinessName": party.name if party else "Walk-in customer",
        "buyerProvince": province,
        "buyerAddress": (party.address if party and getattr(party, "address", None) else "") or "",
        "buyerRegistrationType": "Unregistered",
        "invoiceRefNo": "",
        "items": items,
    }
    if env == "sandbox":
        body["scenarioId"] = scenario or "SN026"
    return body


# ---- talking to FBR ------------------------------------------------------------------------------------


def post(
    body: dict, token: str, *, validate_only: bool = False
) -> tuple[str | None, dict | None, str | None]:
    """→ (FBR invoice number, FBR's answer, error). Never raises."""
    url = URL_VALIDATE_SANDBOX if validate_only else URL_POST
    try:
        r = httpx.post(url, json=body, headers={"Authorization": f"Bearer {token}"}, timeout=25)
    except httpx.HTTPError as e:
        return None, None, f"FBR not reachable: {e.__class__.__name__}"
    if r.status_code in (401, 403):  # a wrong or expired token: no point trying again until it is fixed
        return None, {"httpStatus": r.status_code}, f"FBR did not accept the token ({r.status_code}) — paste the right token in Settings → FBR"
    try:
        data = r.json()
    except ValueError:
        return None, None, f"FBR answered {r.status_code} without data"
    v = (data or {}).get("validationResponse") or {}
    if r.status_code == 200 and v.get("statusCode") == "00":
        return data.get("invoiceNumber") or None, data, None
    errs = [v.get("error")] + [
        s.get("error") for s in v.get("invoiceStatuses") or [] if s.get("error")
    ]
    return None, data, "; ".join(e for e in errs if e) or f"FBR answered {r.status_code}"


def enqueue(db: Session, shop: Shop, invoice_id: uuid.UUID) -> FbrSubmission | None:
    """called inside the sale's transaction: the bill waits to be sent (shops with FBR on only)"""
    st = raw_settings(shop)
    if not st["enabled"]:
        return None
    sub = FbrSubmission(
        shop_id=shop.id, invoice_id=invoice_id, kind="sale", env=st["env"], status=FbrStatus.PENDING
    )
    db.add(sub)
    db.flush()
    return sub


def send(db: Session, sub: FbrSubmission) -> FbrSubmission:
    from app.modules.sales.models import Invoice

    if sub.status != FbrStatus.PENDING:
        return sub
    # claim it first: with two workers (and the scheduler) only one of them posts a bill at a time;
    # the claim lapses by itself after two minutes if that worker dies mid-way
    now = utcnow()
    claimed = db.execute(
        update(FbrSubmission)
        .where(
            FbrSubmission.id == sub.id,
            FbrSubmission.status == FbrStatus.PENDING,
            or_(FbrSubmission.next_try_at.is_(None), FbrSubmission.next_try_at <= now),
        )
        .values(next_try_at=now + dt.timedelta(minutes=2))
    ).rowcount
    db.commit()
    db.refresh(sub)
    if not claimed:
        return sub
    shop = db.get(Shop, sub.shop_id)
    inv = db.get(Invoice, sub.invoice_id)
    token = token_of(shop)
    sub.attempts += 1
    if not token:
        sub.last_error = "No FBR token on this shop (Settings → FBR)"
        sub.next_try_at = utcnow() + dt.timedelta(hours=1)
        db.commit()
        return sub
    body = build_payload(db, shop, inv, sub.env)
    sub.request = body
    number, answer, error = post(body, token)
    sub.response = answer
    if number:
        sub.status, sub.fbr_invoice_no, sub.last_error, sub.sent_at, sub.next_try_at = (
            FbrStatus.SENT,
            number,
            None,
            utcnow(),
            None,
        )
        inv.fbr_invoice_no = number
    elif answer is not None:  # FBR read it and said no: retrying will not help until it is fixed
        sub.status, sub.last_error, sub.next_try_at = FbrStatus.REJECTED, error, None
    else:  # FBR not reachable: try again later
        sub.last_error = error
        wait = RETRY_MINUTES[min(sub.attempts - 1, len(RETRY_MINUTES) - 1)]
        sub.next_try_at = utcnow() + dt.timedelta(minutes=wait)
    db.commit()
    return sub


def send_pending(db: Session, limit: int = 20, shop_id: uuid.UUID | None = None) -> int:
    """bills waiting whose next try is due (one shop's, from its "Send now" button, or every shop's
    from the scheduler)"""
    now = utcnow()
    q = (
        select(FbrSubmission)
        .where(FbrSubmission.status == FbrStatus.PENDING)
        .where((FbrSubmission.next_try_at.is_(None)) | (FbrSubmission.next_try_at <= now))
    )
    if shop_id is not None:
        q = q.where(FbrSubmission.shop_id == shop_id)
    rows = db.scalars(q.order_by(FbrSubmission.created_at).limit(limit)).all()
    for sub in rows:
        send(db, sub)
    return len(rows)


def retry(db: Session, shop_id: uuid.UUID, sub_id: uuid.UUID) -> FbrSubmission:
    sub = db.get(FbrSubmission, sub_id)
    if sub is None or sub.shop_id != shop_id:
        raise NotFound(code="fbr_submission_not_found")
    if sub.status in (FbrStatus.REJECTED, FbrStatus.PENDING):
        sub.status, sub.next_try_at = FbrStatus.PENDING, None  # the shop asked: try now
        db.commit()
    return send(db, sub)


def test_connection(db: Session, shop: Shop) -> dict:
    """a small made-up bill to FBR's sandbox *validate* method: is the token right, and does FBR accept
    our format? Nothing is recorded at FBR."""
    token = token_of(shop)
    if not token:
        raise ValidationFailed(
            code="fbr_no_token",
            message_en="Paste the FBR security token first.",
            message_ur="پہلے FBR ٹوکن لکھیں۔",
        )
    st = raw_settings(shop)
    kind = st["kinds"]["item"]
    province = PROVINCES.get(st["province"], st["province"].upper())
    body = {
        "invoiceType": "Sale Invoice",
        "invoiceDate": dt.date.today().isoformat(),
        "sellerNTNCNIC": "".join(c for c in (shop.ntn or "") if c.isdigit())[:13],
        "sellerBusinessName": shop.legal_name or shop.name,
        "sellerProvince": province,
        "sellerAddress": shop.address or shop.city or "",
        "buyerNTNCNIC": "",
        "buyerBusinessName": "Walk-in customer",
        "buyerProvince": province,
        "buyerAddress": "",
        "buyerRegistrationType": "Unregistered",
        "invoiceRefNo": "",
        "scenarioId": kind.get("scenario") or "SN026",
        "items": [
            {
                "hsCode": kind["hs_code"],
                "productDescription": "Test item",
                "rate": "18%",
                "uoM": UOM,
                "quantity": 1,
                "totalValues": 1180,
                "valueSalesExcludingST": 1000,
                "fixedNotifiedValueOrRetailPrice": 0,
                "salesTaxApplicable": 180,
                "salesTaxWithheldAtSource": 0,
                "extraTax": "",
                "furtherTax": 0,
                "sroScheduleNo": "",
                "fedPayable": 0,
                "discount": 0,
                "saleType": kind["sale_type"],
                "sroItemSerialNo": "",
            }
        ],
    }
    _, answer, error = post(body, token, validate_only=True)
    return {"ok": error is None, "error": error, "answer": answer}


def for_invoice(db: Session, invoice_id: uuid.UUID) -> FbrSubmission | None:
    return db.scalar(
        select(FbrSubmission).where(
            FbrSubmission.invoice_id == invoice_id, FbrSubmission.kind == "sale"
        )
    )


def sub_out(sub: FbrSubmission) -> dict:
    return {
        "id": sub.id,
        "invoice_id": sub.invoice_id,
        "env": sub.env,
        "status": sub.status,
        "fbr_invoice_no": sub.fbr_invoice_no,
        "attempts": sub.attempts,
        "last_error": sub.last_error,
        "sent_at": sub.sent_at,
        "created_at": sub.created_at,
    }


def submissions(
    db: Session, shop_id: uuid.UUID, status: str | None = None, limit: int = 100
) -> dict:
    from app.modules.sales.models import Invoice

    q = (
        select(FbrSubmission, Invoice.no, Invoice.total)
        .join(Invoice, Invoice.id == FbrSubmission.invoice_id)
        .where(FbrSubmission.shop_id == shop_id)
    )
    if status:
        q = q.where(FbrSubmission.status == status)
    rows = db.execute(q.order_by(FbrSubmission.created_at.desc()).limit(limit)).all()
    counts = dict(
        db.execute(
            select(FbrSubmission.status, func.count())
            .where(FbrSubmission.shop_id == shop_id)
            .group_by(FbrSubmission.status)
        ).all()
    )
    return {
        "counts": {
            s: counts.get(s, 0) for s in (FbrStatus.PENDING, FbrStatus.SENT, FbrStatus.REJECTED)
        },
        "rows": [{**sub_out(s), "invoice_no": no, "total": total} for s, no, total in rows],
    }


def send_soon(shop_id: uuid.UUID) -> None:
    """after a sale's answer has gone: send that shop's waiting bills (its own session; never raises)"""
    from app.db.session import SessionLocal

    try:
        with SessionLocal() as db:
            shop = db.get(Shop, shop_id)
            if shop is not None and raw_settings(shop)["enabled"]:
                send_pending(db, shop_id=shop_id)
    except Exception:
        import logging

        logging.getLogger("fbr").exception("FBR send after sale failed")
