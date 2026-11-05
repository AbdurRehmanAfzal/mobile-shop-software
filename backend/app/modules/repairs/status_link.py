"""The customer's repair status link (docs/35 §5 item 5, owner 2026-11-04).

The shop sends the customer a link on WhatsApp; it opens a read-only page with the job's progress,
the promised day and what is left to pay — no login. The token is the job id signed with the
server's secret, so nothing is stored and a link cannot be guessed or changed into another job's.
The page never shows the customer's phone, the full IMEI, the screen lock, the lab's name or any cost.
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
from app.modules.repairs.models import RepairJob, RepairStatus
from app.modules.repairs.schemas import FAULT_CODES

# the steps a customer sees, in order (closed jobs end on their own last step)
STEPS = [
    RepairStatus.RECEIVED,
    RepairStatus.DIAGNOSED,
    RepairStatus.IN_PROGRESS,
    RepairStatus.REPAIRED,
    RepairStatus.DELIVERED,
]


def _sig(job_id: uuid.UUID) -> str:
    msg = f"repair-status:{job_id}".encode()
    return hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()[:24]


def token(job_id: uuid.UUID) -> str:
    return f"{job_id.hex}.{_sig(job_id)}"


def job_for(db: Session, tok: str) -> RepairJob:
    gone = NotFound(
        code="repair_link_invalid",
        message_en="This link is not valid. Ask the shop to send it again.",
        message_ur="یہ لنک درست نہیں۔ دکان سے دوبارہ بھیجنے کو کہیں۔",
    )
    if not tok or "." not in tok:
        raise gone
    raw, sig = tok.split(".", 1)
    try:
        job_id = uuid.UUID(hex=raw)
    except ValueError:
        raise gone from None
    if not hmac.compare_digest(_sig(job_id), sig):
        raise gone
    job = db.get(RepairJob, job_id)
    if job is None:
        raise gone
    return job


def public_view(db: Session, job: RepairJob) -> dict:
    from app.modules.repairs.labs import open_trip

    shop = db.get(Shop, job.shop_id)
    seen = {}
    for lg in job.status_log:
        seen.setdefault(lg.to_status, lg.at)
    done = job.status in (
        RepairStatus.DELIVERED,
        RepairStatus.RETURNED_UNREPAIRED,
        RepairStatus.UNCLAIMED,
    )
    bill = job.total if job.total > 0 else job.estimate
    paid = job.paid if job.status == RepairStatus.DELIVERED else job.advance
    return {
        "shop": {
            "name": shop.name,
            "name_ur": shop.name_ur,
            "phone": shop.phone,
            "city": shop.city,
            "locale": shop.default_locale,
        },
        "no": job.no,
        "device": job.device_desc,
        "imei_last4": job.imei[-4:] if job.imei else None,
        "faults": [
            {"code": c, "en": FAULT_CODES[c][0], "ur": FAULT_CODES[c][1]}
            for c in job.fault_codes
            if c in FAULT_CODES
        ],
        "fault_text": job.fault_text,
        "status": job.status,
        "at_workshop": open_trip(db, job.id) is not None,
        "steps": [
            {
                "status": s,
                "at": seen.get(s) or (job.created_at if s == RepairStatus.RECEIVED else None),
            }
            for s in STEPS
        ],
        "received_at": job.created_at,
        "promised_at": job.promised_at,
        "delivered_at": job.delivered_at,
        "closed": done,
        "bill": money(bill),
        "paid": money(paid),
        "left": money(max(ZERO, bill - paid)),
        "final": job.total > 0,
        "warranty_days": job.warranty_days,
    }
