import datetime as dt
import html
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.modules.accessories import service as acc_stock
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop, User
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import DeviceStatus, EventType
from app.modules.files.service import belongs
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount
from app.modules.ledger.service import Posting, default_cash_account, money, post
from app.modules.notifications import service as notify
from app.modules.parties.models import Party
from app.modules.purchases.service import next_number
from app.modules.repairs.models import (
    CLOSED_STATUSES,
    TRANSITIONS,
    RepairJob,
    RepairPart,
    RepairStatus,
    RepairStatusLog,
)
from app.modules.repairs.schemas import FAULT_CODES, DeliverIn, PartIn, RepairCreate, RepairUpdate


def _cash(db: Session, shop_id: uuid.UUID, cash_account_id: uuid.UUID | None) -> CashAccount:
    cash = (
        db.get(CashAccount, cash_account_id)
        if cash_account_id
        else default_cash_account(db, shop_id)
    )
    if cash is None or cash.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")
    return cash


def _party(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID | None) -> Party | None:
    if party_id is None:
        return None
    p = db.get(Party, party_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    return p


def _device_label(db: Session, device: Device) -> str:
    b, m = db.get(Brand, device.brand_id), db.get(Model, device.model_id)
    return f"{b.name if b else ''} {m.name if m else ''}".strip()


def _recalc(job: RepairJob) -> None:
    job.parts_total = sum((money(p.unit_price * p.qty) for p in job.parts), ZERO)
    job.total = money(max(ZERO, job.parts_total + job.labour - job.discount))


def _log(
    db: Session,
    job: RepairJob,
    user_id: uuid.UUID | None,
    to: RepairStatus,
    note: str | None,
    from_status: str | None = None,
) -> None:
    db.add(
        RepairStatusLog(
            job_id=job.id, from_status=from_status, to_status=to, note=note, user_id=user_id
        )
    )


def create_job(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: RepairCreate
) -> RepairJob:
    shop = db.get(Shop, shop_id)
    party = _party(db, shop_id, data.party_id)
    outside = _party(db, shop_id, data.outside_party_id)
    device: Device | None = None
    desc = data.device_desc or ""
    imei = data.imei
    if data.device_id:
        device = get_device(db, shop_id, data.device_id)
        if device.status not in (DeviceStatus.IN_STOCK, DeviceStatus.FAULTY):
            raise Conflict(
                code="device_not_in_stock",
                message_en=f"Device is {device.status}",
                message_ur="موبائل اسٹاک میں نہیں",
            )
        desc = desc or _device_label(db, device)
        imei = imei or device.imei1
    if data.technician_id and (
        (u := db.get(User, data.technician_id)) is None or u.organisation_id != shop.organisation_id
    ):
        raise NotFound(code="user_not_found")
    for p in data.condition_photos:
        if not belongs(shop_id, p):
            raise ValidationFailed(code="file_not_found")
    if data.advance > ZERO and party is None:
        raise ValidationFailed(code="advance_needs_customer")

    job = RepairJob(
        shop_id=shop_id,
        no=next_number(db, shop, "REP", "next_repair_no"),
        party_id=party.id if party else None,
        device_id=device.id if device else None,
        device_desc=desc,
        imei=imei,
        fault_codes=data.fault_codes,
        fault_text=data.fault_text,
        received_accessories=data.received_accessories,
        condition_photos=data.condition_photos,
        condition_notes=data.condition_notes,
        estimate=money(data.estimate),
        advance=money(data.advance),
        paid=money(data.advance),
        promised_at=data.promised_at,
        technician_id=data.technician_id,
        outside_party_id=outside.id if outside else None,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(job)
    db.flush()
    _log(db, job, user_id, RepairStatus.RECEIVED, None)

    if job.advance > ZERO:
        cash = _cash(db, shop_id, data.cash_account_id)
        posting = Posting(
            document_type="repair_advance",
            document_id=job.id,
            memo=f"{job.no} advance {party.name}",
        )
        posting.debit(
            acc.cash_account(cash.id), job.advance, memo=f"Repair advance {job.no}"
        ).credit(acc.party_account(party.id), job.advance)
        job.advance_group_id = post(db, shop_id, user_id, posting).id

    if device:
        apply_event(
            db,
            shop_id,
            user_id,
            device,
            EventType.SENT_TO_REPAIR,
            party_id=outside.id if outside else None,
            document_type="repair",
            document_id=job.id,
            data={"repair_no": job.no, "fault": data.fault_codes},
        )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="create",
        after={"no": job.no, "device": desc, "advance": str(job.advance)},
    )
    db.commit()
    return job


def get_job(db: Session, shop_id: uuid.UUID, job_id: uuid.UUID) -> RepairJob:
    j = db.get(RepairJob, job_id)
    if j is None or j.shop_id != shop_id:
        raise NotFound(code="repair_not_found")
    return j


def list_jobs(
    db: Session, shop_id: uuid.UUID, *, status, open_only, party_id, technician_id, limit
) -> list[RepairJob]:
    stmt = select(RepairJob).where(RepairJob.shop_id == shop_id)
    if status:
        stmt = stmt.where(RepairJob.status == status)
    elif open_only:
        stmt = stmt.where(RepairJob.status.notin_([s.value for s in CLOSED_STATUSES]))
    if party_id:
        stmt = stmt.where(RepairJob.party_id == party_id)
    if technician_id:
        stmt = stmt.where(RepairJob.technician_id == technician_id)
    return list(db.scalars(stmt.order_by(RepairJob.created_at.desc()).limit(limit)).all())


def update_job(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, job_id: uuid.UUID, data: RepairUpdate
) -> RepairJob:
    job = get_job(db, shop_id, job_id)
    if job.status in CLOSED_STATUSES:
        raise Conflict(code="repair_closed")
    changes = data.model_dump(exclude_unset=True)
    if (
        "fault_codes" in changes
        and changes["fault_codes"] is not None
        and any(c not in FAULT_CODES for c in changes["fault_codes"])
    ):
        raise ValidationFailed(code="fault_code")
    if "outside_party_id" in changes:
        _party(db, shop_id, changes["outside_party_id"])
    for k, v in changes.items():
        setattr(job, k, money(v) if isinstance(v, Decimal) else v)
    _recalc(job)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="update",
        after={k: str(v) for k, v in changes.items()},
    )
    db.commit()
    return job


def set_parts(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, job_id: uuid.UUID, parts: list[PartIn]
) -> RepairJob:
    job = get_job(db, shop_id, job_id)
    if job.status in CLOSED_STATUSES:
        raise Conflict(code="repair_closed")
    job.parts = [RepairPart(job_id=job.id, **p.model_dump()) for p in parts]
    db.flush()
    _recalc(job)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="parts",
        after={"parts": [p.description for p in parts]},
    )
    db.commit()
    return job


def set_status(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    status: RepairStatus,
    note: str | None,
) -> RepairJob:
    job = get_job(db, shop_id, job_id)
    current = RepairStatus(job.status)
    if status == RepairStatus.DELIVERED:
        raise ValidationFailed(
            code="use_deliver_endpoint",
            message_en="Use deliver to close with the bill",
            message_ur="بل کے ساتھ بند کرنے کے لیے ڈیلیور استعمال کریں",
        )
    if status not in TRANSITIONS[current]:
        raise Conflict(
            code="invalid_transition",
            message_en=f"Cannot go from {current} to {status}",
            message_ur="یہ تبدیلی ممکن نہیں",
        )
    job.status = status
    _log(db, job, user_id, status, note, from_status=current)
    if status == RepairStatus.RETURNED_UNREPAIRED:
        _close_device(db, shop_id, user_id, job, repaired=False)
        job.delivered_at = utcnow()
    if status == RepairStatus.REPAIRED and job.party_id:
        shop = db.get(Shop, shop_id)
        party = db.get(Party, job.party_id)
        notify.on_repair_ready(db, shop, job, party)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="status",
        after={"from": current, "to": status, "note": note},
    )
    db.commit()
    return job


def _close_device(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, job: RepairJob, *, repaired: bool
) -> None:
    if not job.device_id:
        return
    device = get_device(db, shop_id, job.device_id)
    if device.status == DeviceStatus.IN_REPAIR:
        apply_event(
            db,
            shop_id,
            user_id,
            device,
            EventType.REPAIR_RETURNED,
            party_id=job.outside_party_id,
            document_type="repair",
            document_id=job.id,
            data={"repair_no": job.no, "repaired": repaired, "cost": str(job.outside_cost)},
        )
        if not repaired:
            apply_event(
                db,
                shop_id,
                user_id,
                device,
                EventType.MARKED_FAULTY,
                document_type="repair",
                document_id=job.id,
                data={"repair_no": job.no},
            )


def deliver(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, job_id: uuid.UUID, data: DeliverIn
) -> RepairJob:
    job = get_job(db, shop_id, job_id)
    current = RepairStatus(job.status)
    if RepairStatus.DELIVERED not in TRANSITIONS[current] and current not in (
        RepairStatus.RECEIVED,
        RepairStatus.DIAGNOSED,
        RepairStatus.IN_PROGRESS,
        RepairStatus.WAITING_PARTS,
    ):
        raise Conflict(code="invalid_transition")
    if data.labour is not None:
        job.labour = money(data.labour)
    if data.discount is not None:
        job.discount = money(data.discount)
    if data.warranty_days is not None:
        job.warranty_days = data.warranty_days
    if data.outside_cost is not None:
        job.outside_cost = money(data.outside_cost)
    _recalc(job)
    paid = money(data.paid)

    if job.party_id:
        party = db.get(Party, job.party_id)
        if money(job.advance + paid) > job.total and job.total > ZERO and paid > ZERO:
            raise ValidationFailed(
                code="paid_exceeds_total",
                message_en="Paid exceeds the bill",
                message_ur="ادا شدہ رقم بل سے زیادہ ہے",
            )
        posting = Posting(
            document_type="repair_bill", document_id=job.id, memo=f"{job.no} {job.device_desc}"
        )
        for part in job.parts:
            if part.accessory_id:
                a = acc_stock.get_accessory(db, shop_id, part.accessory_id)
                acc_stock.move(
                    db,
                    shop_id,
                    user_id,
                    a,
                    -part.qty,
                    "repair",
                    document_type="repair",
                    document_id=job.id,
                    note=job.no,
                )
                part.unit_cost = a.avg_cost
                pc = money(a.avg_cost * part.qty)
                if pc > ZERO:
                    posting.debit(acc.SysAccount.COGS, pc, memo=part.description).credit(
                        acc.SysAccount.INVENTORY, pc
                    )
        if job.total > ZERO:
            posting.debit(acc.party_account(party.id), job.total).credit(
                acc.SysAccount.REPAIR_INCOME, job.total, memo=job.no
            )
        if paid > ZERO:
            cash = _cash(db, shop_id, data.cash_account_id)
            posting.debit(acc.cash_account(cash.id), paid, memo=f"Repair {job.no}").credit(
                acc.party_account(party.id), paid
            )
        if posting.lines:
            job.bill_group_id = post(db, shop_id, user_id, posting).id
        job.paid = money(job.advance + paid)
    else:
        # own stock device: outside technician cost adds to the device's cost
        if job.outside_cost > ZERO:
            device = get_device(db, shop_id, job.device_id)
            posting = Posting(
                document_type="repair_cost", document_id=job.id, memo=f"{job.no} {job.device_desc}"
            )
            posting.debit(
                acc.SysAccount.INVENTORY, job.outside_cost, device_id=device.id, memo=job.no
            )
            if job.outside_party_id:
                posting.credit(acc.party_account(job.outside_party_id), job.outside_cost)
            else:
                cash = _cash(db, shop_id, data.cash_account_id)
                posting.credit(acc.cash_account(cash.id), job.outside_cost, memo=f"Repair {job.no}")
            job.bill_group_id = post(db, shop_id, user_id, posting).id
            device.cost_price = money((device.cost_price or ZERO) + job.outside_cost)

    _close_device(db, shop_id, user_id, job, repaired=True)
    job.status = RepairStatus.DELIVERED
    job.delivered_at = utcnow()
    _log(db, job, user_id, RepairStatus.DELIVERED, data.note, from_status=current)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="deliver",
        after={"total": str(job.total), "paid": str(paid)},
    )
    db.commit()
    return job


def to_out(db: Session, job: RepairJob) -> dict:
    party = db.get(Party, job.party_id) if job.party_id else None
    outside = db.get(Party, job.outside_party_id) if job.outside_party_id else None
    tech = db.get(User, job.technician_id) if job.technician_id else None
    users = (
        {
            u.id: u.name
            for u in db.scalars(
                select(User).where(User.id.in_([lg.user_id for lg in job.status_log if lg.user_id]))
            ).all()
        }
        if job.status_log
        else {}
    )
    open_ = job.status not in CLOSED_STATUSES
    return {
        **{c.name: getattr(job, c.name) for c in RepairJob.__table__.columns},
        "party_name": party.name if party else None,
        "party_phone": party.phone if party else None,
        "technician_name": tech.name if tech else None,
        "outside_party_name": outside.name if outside else None,
        "balance_due": money(max(ZERO, job.total - job.paid))
        if job.party_id and job.status == RepairStatus.DELIVERED
        else (money(max(ZERO, job.estimate - job.advance)) if job.party_id and open_ else ZERO),
        "overdue": open_ and job.promised_at is not None and job.promised_at < dt.date.today(),
        "parts": list(job.parts),
        "status_log": [
            {
                "from_status": lg.from_status,
                "to_status": lg.to_status,
                "note": lg.note,
                "user_id": lg.user_id,
                "user_name": users.get(lg.user_id),
                "at": lg.at,
            }
            for lg in job.status_log
        ],
    }


def job_sheet_html(db: Session, shop_id: uuid.UUID, job_id: uuid.UUID, lang: str | None) -> str:
    job = get_job(db, shop_id, job_id)
    shop = db.get(Shop, shop_id)
    lang = lang if lang in ("en", "ur") else (shop.default_locale or "ur")
    ur = lang == "ur"
    party = db.get(Party, job.party_id) if job.party_id else None
    e = html.escape
    T = {
        "title": "مرمت کی رسید" if ur else "Repair job sheet",
        "customer": "گاہک" if ur else "Customer",
        "device": "موبائل" if ur else "Device",
        "fault": "خرابی" if ur else "Fault",
        "received": "ساتھ ملا" if ur else "Received with",
        "estimate": "اندازہ" if ur else "Estimate",
        "advance": "ایڈوانس" if ur else "Advance",
        "promised": "واپسی کی تاریخ" if ur else "Promised date",
        "terms": (
            "موبائل 30 دن کے اندر وصول نہ کرنے پر دکان ذمہ دار نہیں۔ ڈیٹا کی ذمہ داری گاہک پر ہے۔ یہ رسید دکھا کر موبائل واپس لیں۔"
            if ur
            else "The shop is not responsible for devices left over 30 days. Data backup is the customer's responsibility. Present this slip to collect the device."
        ),
        "status": "حالت" if ur else "Status",
        "total": "کل بل" if ur else "Total",
        "paid": "وصول" if ur else "Paid",
        "due": "باقی" if ur else "Due",
        "warranty": "وارنٹی (دن)" if ur else "Warranty (days)",
    }
    faults = ", ".join(
        (FAULT_CODES[c][1] if ur else FAULT_CODES[c][0])
        for c in job.fault_codes
        if c in FAULT_CODES
    )
    if job.fault_text:
        faults = f"{faults} · {e(job.fault_text)}" if faults else e(job.fault_text)
    font_link = (
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">'
        if ur
        else ""
    )
    shop_name = e(shop.name_ur) if ur and shop.name_ur else e(shop.name)
    bill = ""
    if job.status == RepairStatus.DELIVERED:
        bill = f"<tr><td>{T['total']}</td><td class='ltr'>Rs. {job.total:,.0f}</td></tr><tr><td>{T['paid']}</td><td class='ltr'>Rs. {job.paid:,.0f}</td></tr><tr><td>{T['due']}</td><td class='ltr'>Rs. {max(ZERO, job.total - job.paid):,.0f}</td></tr><tr><td>{T['warranty']}</td><td class='ltr'>{job.warranty_days}</td></tr>"
    return f"""<!doctype html><html lang="{lang}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{e(job.no)}</title>{font_link}
<style>@page {{ size: 80mm auto; margin: 4mm; }} body {{ width: 72mm; margin: 0 auto; font-family: {"'Noto Nastaliq Urdu', serif" if ur else "Arial, sans-serif"}; font-size: 11px; color: #111; {"line-height: 1.9;" if ur else ""} }}
h1 {{ font-size: 15px; margin: 0; text-align: center; }} .c {{ text-align: center; }} .ltr {{ direction: ltr; unicode-bidi: isolate; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 6px; }} td {{ padding: 3px 2px; vertical-align: top; border-bottom: 1px dotted #ccc; }} .foot {{ margin-top: 8px; border-top: 1px dashed #999; padding-top: 6px; font-size: 10px; }}</style></head><body>
<h1>{shop_name}</h1><div class="c"><small>{e(shop.phone or "")}</small></div>
<div class="c"><b>{T["title"]}</b> · <span class="ltr">{e(job.no)}</span> · <span class="ltr">{job.created_at.strftime("%d-%m-%Y")}</span></div>
<table>
<tr><td>{T["customer"]}</td><td>{e(party.name) if party else "—"}<br><span class="ltr">{e(party.phone) if party else ""}</span></td></tr>
<tr><td>{T["device"]}</td><td>{e(job.device_desc)}<br><span class="ltr">{e(job.imei or "")}</span></td></tr>
<tr><td>{T["fault"]}</td><td>{faults}</td></tr>
<tr><td>{T["received"]}</td><td>{e(", ".join(job.received_accessories)) or "—"}</td></tr>
<tr><td>{T["estimate"]}</td><td class="ltr">Rs. {job.estimate:,.0f}</td></tr>
<tr><td>{T["advance"]}</td><td class="ltr">Rs. {job.advance:,.0f}</td></tr>
<tr><td>{T["promised"]}</td><td class="ltr">{job.promised_at.strftime("%d-%m-%Y") if job.promised_at else "—"}</td></tr>
<tr><td>{T["status"]}</td><td class="ltr">{e(job.status)}</td></tr>{bill}
</table>
<div class="foot">{T["terms"]}</div>
</body></html>"""
