"""Messages the shop sends by itself (owner 2026-10-29): the day's hisaab to the owner every night,
udhaar reminders to customers, and the sending of queued WhatsApp messages through the Cloud API.

`tick()` runs once a minute from the API process (see `scheduler.py`). Each shop's night report and
reminder run are recorded in `job_runs` (one row per shop, job and day), so they go out once even
when two API workers tick at the same time."""

import datetime as dt
import logging
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import ZERO, utcnow
from app.modules.accessories.models import Accessory
from app.modules.auth.models import Shop
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus
from app.modules.ledger.models import LedgerEntry
from app.modules.notifications import provider
from app.modules.notifications.models import Channel, JobRun, Message, MessageStatus
from app.modules.notifications.schemas import NotificationSettings
from app.modules.notifications.service import fmt, lang_for, queue, settings_for
from app.modules.notifications.templates import render
from app.modules.parties.models import Party

log = logging.getLogger("notifications")

DAILY = "daily_report"
REMIND = "udhaar_reminder"
INSTALL = "installment_reminders"
SNAPSHOT = "stock_snapshot"


# ---- udhaar reminders ----------------------------------------------------------------------


def reminder_rows(db: Session, shop: Shop, *, min_days: int) -> list[dict]:
    """Customers who owe the shop, with how long since their account last moved and when they
    were last reminded. `min_days`: only accounts untouched for at least that many days."""
    lang = lang_for(shop)
    now = utcnow()
    last_move = dict(
        db.execute(
            select(LedgerEntry.party_id, func.max(LedgerEntry.at))
            .where(LedgerEntry.shop_id == shop.id, LedgerEntry.party_id.is_not(None))
            .group_by(LedgerEntry.party_id)
        ).all()
    )
    last_remind = dict(
        db.execute(
            select(Message.party_id, func.max(Message.created_at))
            .where(
                Message.shop_id == shop.id,
                Message.template_key == REMIND,
                Message.party_id.is_not(None),
            )
            .group_by(Message.party_id)
        ).all()
    )
    rows = []
    parties = db.scalars(
        select(Party)
        .where(Party.shop_id == shop.id, Party.is_active.is_(True), Party.balance > 0)
        .order_by(Party.balance.desc())
    ).all()
    for p in parties:
        moved = last_move.get(p.id)
        days = None
        if moved is not None:
            if moved.tzinfo is None:
                moved = moved.replace(tzinfo=dt.UTC)
            days = (now - moved).days
        if days is not None and days < min_days:
            continue
        reminded = last_remind.get(p.id)
        if reminded is not None and reminded.tzinfo is None:
            reminded = reminded.replace(tzinfo=dt.UTC)
        _, body = render(
            REMIND, lang, {"shop": shop.name, "customer": p.name, "balance": fmt(p.balance)}
        )
        rows.append(
            {
                "party_id": p.id,
                "name": p.name,
                "phone": p.phone,
                "balance": p.balance,
                "days_since": days,
                "last_reminded_at": reminded,
                "body": body,
            }
        )
    return rows


def queue_reminders(
    db: Session,
    shop: Shop,
    *,
    party_ids: list[uuid.UUID] | None,
    min_days: int,
    skip_reminded_within_days: int = 0,
) -> list[Message]:
    """Queues one reminder per chosen customer (all due ones when `party_ids` is None)."""
    lang = lang_for(shop)
    now = utcnow()
    msgs: list[Message] = []
    for row in reminder_rows(db, shop, min_days=min_days):
        if party_ids is not None and row["party_id"] not in party_ids:
            continue
        if not row["phone"]:
            continue
        last = row["last_reminded_at"]
        if skip_reminded_within_days and last and (now - last).days < skip_reminded_within_days:
            continue
        msgs.append(
            queue(
                db,
                shop,
                channel=Channel.WHATSAPP,
                audience="customer",
                recipient=row["phone"],
                template_key=REMIND,
                lang=lang,
                ctx={"shop": shop.name, "customer": row["name"], "balance": fmt(row["balance"])},
                event_type="reminder",
                document_type=None,
                document_id=None,
                party_id=row["party_id"],
            )
        )
    db.flush()
    return msgs


# ---- the night report ----------------------------------------------------------------------


def daily_report_ctx(db: Session, shop: Shop, day: dt.date) -> dict:
    from app.modules.reports.service import day_report

    rep = day_report(db, shop.id, day, show_cost=True)
    balances = db.scalars(
        select(Party.balance).where(
            Party.shop_id == shop.id, Party.is_active.is_(True), Party.balance != 0
        )
    ).all()
    stock = db.scalar(
        select(func.count(Device.id)).where(
            Device.shop_id == shop.id, Device.status == DeviceStatus.IN_STOCK
        )
    )
    low = db.scalar(
        select(func.count(Accessory.id)).where(
            Accessory.shop_id == shop.id,
            Accessory.is_active.is_(True),
            Accessory.qty <= Accessory.reorder_level,
        )
    )
    return {
        "shop": shop.name,
        "low": low or 0,
        "date": day.strftime("%d-%m-%Y"),
        "phones": rep["phones_sold"],
        "sales": fmt(rep["sales_total"]),
        "cash": fmt(rep["cash_net"]),
        "udhaar_given": fmt(rep["udhaar_given"]),
        "udhaar_received": fmt(rep["udhaar_received"]),
        "expenses": fmt(rep["expenses"]),
        "profit": fmt(rep["profit"]),
        "receivable": fmt(sum((b for b in balances if b > 0), ZERO)),
        "payable": fmt(-sum((b for b in balances if b < 0), ZERO)),
        "stock": stock or 0,
    }


def queue_daily_report(db: Session, shop: Shop, day: dt.date) -> Message | None:
    """WhatsApp and/or email, whichever the owner set; returns the WhatsApp one when both."""
    s = settings_for(shop)
    targets: list[tuple[Channel, str]] = []
    if s.owner_whatsapp and (s.owner_daily_report_whatsapp or not s.owner_daily_report_email):
        targets.append((Channel.WHATSAPP, s.owner_whatsapp))
    if s.owner_email and s.owner_daily_report_email:
        targets.append((Channel.EMAIL, str(s.owner_email)))
    if not targets:
        return None
    ctx = daily_report_ctx(db, shop, day)
    first: Message | None = None
    for channel, recipient in targets:
        msg = queue(
            db,
            shop,
            channel=channel,
            audience="owner",
            recipient=recipient,
            template_key=DAILY,
            lang=lang_for(shop, s),
            ctx=ctx,
            event_type="daily_report",
            document_type=None,
            document_id=None,
        )
        first = first or msg
    db.flush()
    return first


# ---- sending through the Cloud API ----------------------------------------------------------


def dispatch(db: Session, limit: int = 50) -> dict:
    """Sends queued WhatsApp messages when the Cloud API is configured. Each message is claimed
    first (queued -> sending), so a second worker never sends the same one."""
    channels = []
    if provider.configured():
        channels.append(Channel.WHATSAPP)
    if provider.email_configured():
        channels.append(Channel.EMAIL)
    if not channels:
        return {"sent": 0, "failed": 0}
    ids = db.scalars(
        select(Message.id)
        .where(Message.channel.in_(channels), Message.status == MessageStatus.QUEUED)
        .order_by(Message.created_at)
        .limit(limit)
    ).all()
    sent = failed = 0
    for mid in ids:
        claimed = db.execute(
            update(Message)
            .where(Message.id == mid, Message.status == MessageStatus.QUEUED)
            .values(status="sending")
        ).rowcount
        db.commit()
        if not claimed:
            continue
        m = db.get(Message, mid)
        via = "smtp" if m.channel == Channel.EMAIL else "whatsapp_api"
        try:
            if m.channel == Channel.EMAIL:
                m.provider_id = provider.send_email(m.recipient, m.subject or "", m.body)
            else:
                m.provider_id = provider.send_whatsapp(m.recipient, m.body, m.template_key)
            m.status = MessageStatus.SENT
            m.sent_at = utcnow()
            m.provider = via
            m.error = None
            sent += 1
        except Exception as e:  # noqa: BLE001 - the error is kept on the row
            m.status = MessageStatus.FAILED
            m.provider = via
            m.error = str(e)[:500]
            failed += 1
            log.warning("%s send failed for %s: %s", via, mid, e)
        db.commit()
    return {"sent": sent, "failed": failed}


# ---- the clock ------------------------------------------------------------------------------


def is_due(hhmm: str, now_local: dt.datetime) -> bool:
    h, m = (int(x) for x in hhmm.split(":"))
    return (now_local.hour, now_local.minute) >= (h, m)


def _claim(db: Session, shop_id: uuid.UUID, job: str, day: dt.date) -> bool:
    db.add(JobRun(shop_id=shop_id, job=job, day=day))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def tick(db: Session, now: dt.datetime | None = None) -> dict:
    """What is due right now for every active shop. Safe to call as often as you like."""
    now = now or utcnow()
    ran = {"daily_report": 0, "reminders": 0, "snapshots": 0}
    for shop in db.scalars(select(Shop).where(Shop.is_active.is_(True))).all():
        s: NotificationSettings = settings_for(shop)
        local = now.astimezone(ZoneInfo(shop.timezone or "Asia/Karachi"))
        day = local.date()
        report_due = (
            (s.owner_daily_report_whatsapp and s.owner_whatsapp)
            or (s.owner_daily_report_email and s.owner_email)
        ) and is_due(s.daily_report_time, local)
        if report_due and _claim(db, shop.id, DAILY, day):
            queue_daily_report(db, shop, day)
            db.commit()
            ran["daily_report"] += 1
        # the stock snapshot for the day that just ended (owner decision 2026-10-31), once a day
        if _claim(db, shop.id, SNAPSHOT, day):
            from app.modules.shopaudit.snapshots import nightly

            nightly(db, shop.id, day)
            db.commit()
            ran["snapshots"] += 1
        remind_due = s.customer_reminder_whatsapp and is_due(s.reminder_time, local)
        if remind_due and _claim(db, shop.id, INSTALL, day):
            from app.modules.admin.modules import effective
            from app.modules.installments.service import auto_reminders

            if "installments" in effective(shop.organisation):
                ran["reminders"] += auto_reminders(db, shop)
                db.commit()
        if remind_due and _claim(db, shop.id, REMIND, day):
            n = len(
                queue_reminders(
                    db,
                    shop,
                    party_ids=None,
                    min_days=s.reminder_after_days,
                    skip_reminded_within_days=s.reminder_after_days,
                )
            )
            db.commit()
            ran["reminders"] += n
    return ran
