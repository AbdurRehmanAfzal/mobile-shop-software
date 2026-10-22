import uuid
from decimal import Decimal
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pk import normalise_phone
from app.modules.auth.models import Shop, User
from app.modules.notifications.models import Channel, Message, MessageStatus
from app.modules.notifications.schemas import NotificationSettings
from app.modules.notifications.templates import BALANCE_LINE, PENDING_LINE, render
from app.modules.parties.models import Party


def settings_for(shop: Shop) -> NotificationSettings:
    return NotificationSettings.model_validate(shop.notification_settings or {})


def lang_for(shop: Shop, settings: NotificationSettings | None = None) -> str:
    s = settings or settings_for(shop)
    return s.language or shop.default_locale or "ur"


def wa_link(phone: str, body: str) -> str:
    digits = normalise_phone(phone)
    return f"https://wa.me/92{digits[1:]}?text={quote(body)}"


def fmt(n: Decimal | int | str | None) -> str:
    try:
        return f"{Decimal(str(n)):,.0f}"
    except Exception:  # noqa: BLE001
        return str(n or 0)


def balance_line(lang: str, balance: Decimal | None) -> str:
    if balance is None:
        return ""
    b = Decimal(balance)
    if b > 0:
        return BALANCE_LINE[lang]["owes"].format(balance=fmt(b))
    if b < 0:
        return BALANCE_LINE[lang]["advance"].format(balance=fmt(-b))
    return BALANCE_LINE[lang]["clear"]


def queue(
    db: Session,
    shop: Shop,
    *,
    channel: Channel,
    audience: str,
    recipient: str,
    template_key: str,
    lang: str,
    ctx: dict,
    event_type: str,
    document_type: str | None,
    document_id: uuid.UUID | None,
    party_id: uuid.UUID | None = None,
) -> Message:
    subject, body = render(template_key, lang, ctx)
    msg = Message(
        shop_id=shop.id,
        channel=channel,
        audience=audience,
        recipient=recipient,
        party_id=party_id,
        template_key=template_key,
        lang=lang,
        subject=subject if channel == Channel.EMAIL else None,
        body=body,
        link=wa_link(recipient, body) if channel == Channel.WHATSAPP else None,
        event_type=event_type,
        document_type=document_type,
        document_id=document_id,
        status=MessageStatus.QUEUED,
        provider="wa_link" if channel == Channel.WHATSAPP else "smtp",
    )
    db.add(msg)
    return msg


def _staff_name(db: Session, user_id: uuid.UUID | None) -> str:
    u = db.get(User, user_id) if user_id else None
    return u.name if u else "Staff"


# ---- event hooks (called inside the document's transaction, before commit) ---------------


def on_sale(
    db: Session, shop: Shop, invoice, party: Party | None, items: str, pending: str, user_id
) -> list[Message]:
    s = settings_for(shop)
    lang = lang_for(shop, s)
    out: list[Message] = []
    ctx = {
        "shop": shop.name_ur if lang == "ur" and shop.name_ur else shop.name,
        "customer": party.name if party else ("گاہک" if lang == "ur" else "Customer"),
        "items": items,
        "total": fmt(invoice.total),
        "paid": fmt(invoice.paid),
        "due": fmt(invoice.total - invoice.paid),
        "invoice_no": invoice.no,
        "staff": _staff_name(db, user_id),
        "balance_line": balance_line(lang, party.balance if party else None),
        "pending_line": PENDING_LINE[lang].format(pending=pending) if pending else "",
    }
    common = {
        "template_key": None,
        "lang": lang,
        "ctx": ctx,
        "event_type": "sale",
        "document_type": "invoice",
        "document_id": invoice.id,
    }
    if party:
        if s.customer_on_sale_whatsapp and (party.whatsapp or party.phone):
            out.append(
                queue(
                    db,
                    shop,
                    channel=Channel.WHATSAPP,
                    audience="customer",
                    recipient=party.whatsapp or party.phone,
                    party_id=party.id,
                    **{**common, "template_key": "sale_customer"},
                )
            )
        if s.customer_on_sale_email and getattr(party, "email", None):
            out.append(
                queue(
                    db,
                    shop,
                    channel=Channel.EMAIL,
                    audience="customer",
                    recipient=party.email,
                    party_id=party.id,
                    **{**common, "template_key": "sale_customer"},
                )
            )
    if s.owner_on_sale_whatsapp and s.owner_whatsapp:
        out.append(
            queue(
                db,
                shop,
                channel=Channel.WHATSAPP,
                audience="owner",
                recipient=s.owner_whatsapp,
                **{**common, "template_key": "sale_owner"},
            )
        )
    if s.owner_on_sale_email and s.owner_email:
        out.append(
            queue(
                db,
                shop,
                channel=Channel.EMAIL,
                audience="owner",
                recipient=str(s.owner_email),
                **{**common, "template_key": "sale_owner"},
            )
        )
    return out


def on_purchase(
    db: Session, shop: Shop, purchase, party: Party, items: str, count: int, user_id
) -> list[Message]:
    s = settings_for(shop)
    lang = lang_for(shop, s)
    out: list[Message] = []
    ctx = {
        "shop": shop.name_ur if lang == "ur" and shop.name_ur else shop.name,
        "party": party.name,
        "items": items,
        "count": count,
        "total": fmt(purchase.total),
        "paid": fmt(purchase.paid),
        "purchase_no": purchase.no,
        "staff": _staff_name(db, user_id),
    }
    common = {
        "lang": lang,
        "ctx": ctx,
        "event_type": "purchase",
        "document_type": "purchase",
        "document_id": purchase.id,
    }
    if s.owner_on_purchase_whatsapp and s.owner_whatsapp:
        out.append(
            queue(
                db,
                shop,
                channel=Channel.WHATSAPP,
                audience="owner",
                recipient=s.owner_whatsapp,
                template_key="purchase_owner",
                **common,
            )
        )
    if s.owner_on_purchase_email and s.owner_email:
        out.append(
            queue(
                db,
                shop,
                channel=Channel.EMAIL,
                audience="owner",
                recipient=str(s.owner_email),
                template_key="purchase_owner",
                **common,
            )
        )
    if s.seller_on_purchase_whatsapp and (party.whatsapp or party.phone):
        out.append(
            queue(
                db,
                shop,
                channel=Channel.WHATSAPP,
                audience="customer",
                recipient=party.whatsapp or party.phone,
                party_id=party.id,
                template_key="purchase_seller",
                **common,
            )
        )
    if s.seller_on_purchase_email and getattr(party, "email", None):
        out.append(
            queue(
                db,
                shop,
                channel=Channel.EMAIL,
                audience="customer",
                recipient=party.email,
                party_id=party.id,
                template_key="purchase_seller",
                **common,
            )
        )
    return out


def on_payment_in(db: Session, shop: Shop, payment, party: Party) -> list[Message]:
    s = settings_for(shop)
    lang = lang_for(shop, s)
    if not (s.customer_on_payment_whatsapp and (party.whatsapp or party.phone)):
        return []
    ctx = {
        "shop": shop.name_ur if lang == "ur" and shop.name_ur else shop.name,
        "customer": party.name,
        "amount": fmt(payment.amount),
        "payment_no": payment.no,
        "balance_line": balance_line(lang, party.balance),
    }
    return [
        queue(
            db,
            shop,
            channel=Channel.WHATSAPP,
            audience="customer",
            recipient=party.whatsapp or party.phone,
            party_id=party.id,
            template_key="payment_customer",
            lang=lang,
            ctx=ctx,
            event_type="payment",
            document_type="payment",
            document_id=payment.id,
        )
    ]


def list_messages(
    db: Session, shop_id: uuid.UUID, *, status: str | None, audience: str | None, limit: int
) -> list[Message]:
    stmt = select(Message).where(Message.shop_id == shop_id)
    if status:
        stmt = stmt.where(Message.status == status)
    if audience:
        stmt = stmt.where(Message.audience == audience)
    return list(db.scalars(stmt.order_by(Message.created_at.desc()).limit(limit)).all())
