"""The QR on a sale bill (owner 2026-11-07): the customer scans it and sees the bill online, without
a login, so they can keep a copy and check that the bill is genuine.

The token is the invoice id signed with the server's secret (as the repair status link), so nothing
is stored and a link cannot be guessed or changed into another bill's. The page never shows the
customer's name or phone, the full IMEI, a cost or the customer's khata balance.
"""

import hashlib
import hmac
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFound
from app.db.base import ZERO
from app.modules.auth.models import Shop
from app.modules.ledger.service import money
from app.modules.sales.models import Invoice, InvoiceStatus


def _sig(invoice_id: uuid.UUID) -> str:
    msg = f"bill-check:{invoice_id}".encode()
    return hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()[:24]


def token(invoice_id: uuid.UUID) -> str:
    return f"{invoice_id.hex}.{_sig(invoice_id)}"


def url(invoice_id: uuid.UUID) -> str | None:
    """the full link for the QR, when this install has a public address"""
    base = settings.public_base
    return f"{base}/b/{token(invoice_id)}" if base else None


def invoice_for(db: Session, tok: str) -> Invoice:
    gone = NotFound(
        code="bill_link_invalid",
        message_en="This bill could not be found. Ask the shop for help.",
        message_ur="یہ بل نہیں ملا۔ دکان سے رابطہ کریں۔",
    )
    if not tok or "." not in tok:
        raise gone
    raw, sig = tok.split(".", 1)
    try:
        inv_id = uuid.UUID(hex=raw)
    except ValueError:
        raise gone from None
    if not hmac.compare_digest(_sig(inv_id), sig):
        raise gone
    inv = db.get(Invoice, inv_id)
    if inv is None:
        raise gone
    return inv


def public_view(db: Session, inv: Invoice) -> dict:
    from app.modules.sales.service import to_out

    shop = db.get(Shop, inv.shop_id)
    out = to_out(db, inv, show_cost=False)
    if inv.status == InvoiceStatus.VOID:
        state = "void"
    elif inv.status == InvoiceStatus.RETURNED:
        state = "returned"
    else:
        state = "paid" if out["balance_due"] <= ZERO else ("partial" if inv.paid > 0 else "unpaid")
    return {
        "shop": {
            "name": shop.name,
            "name_ur": shop.name_ur,
            "phone": shop.phone,
            "city": shop.city,
            "locale": shop.default_locale,
        },
        "no": inv.no,
        "date": inv.date,
        "state": state,
        "lines": [
            {
                "label": ln["device_label"] or ln["description"] or "",
                "imei_last4": ln["imei1"][-4:] if ln["imei1"] else None,
                "qty": ln["qty"],
                "unit_price": money(ln["unit_price"]),
                "line_total": money(ln["line_total"]),
                "warranty_days": ln["warranty_days"],
            }
            for ln in out["lines"]
        ],
        "subtotal": money(inv.subtotal),
        "discount": money(inv.discount),
        "tax": money(inv.tax_amount),
        "total": money(inv.total),
        "returned": money(inv.returned_total),
        "paid": money(inv.paid),
        "due": money(out["balance_due"]),
        "fbr_invoice_no": inv.fbr_invoice_no,
    }
