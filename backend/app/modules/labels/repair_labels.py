"""Repair stickers (owner 2026-11-03, docs/34): when a customer's phone comes in for repair, a sticker
with its details goes on the phone. Before printing, the shop picks which fields are on it.

The barcode is the job number (Code 128), so a scan finds the job. The phone's screen-lock code is
never printed (a sticker is seen by anyone; repair software keeps it off labels too)."""

import html
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.modules.auth.models import Shop
from app.modules.barcodes import codes
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.repairs.labs import open_trip
from app.modules.repairs.models import RepairJob
from app.modules.repairs.schemas import FAULT_CODES

REPAIR_FIELDS = (
    "shop",
    "no",
    "barcode",
    "customer",
    "phone",
    "device",
    "imei",
    "fault",
    "accessories",
    "received",
    "promised",
    "estimate",
    "advance",
    "left",
    "lab",
    "notes",
)
REPAIR_DEFAULT = ("shop", "no", "barcode", "customer", "phone", "device", "fault", "promised")
ACCESSORIES = {
    "sim": ("SIM", "سم"),
    "memory_card": ("Memory card", "میموری کارڈ"),
    "cover": ("Cover", "کور"),
    "charger": ("Charger", "چارجر"),
    "box": ("Box", "ڈبہ"),
    "earphones": ("Earphones", "ہینڈ فری"),
}
WORDS = {
    "received": ("In", "آیا"),
    "promised": ("Ready", "تیار"),
    "estimate": ("Est.", "اندازہ"),
    "advance": ("Adv.", "ایڈوانس"),
    "left": ("Left", "باقی"),
    "lab": ("Lab", "لیب"),
    "with": ("With", "ساتھ"),
}


def fields_of(fields: str | None) -> list[str]:
    want = [f.strip() for f in (fields or "").split(",") if f.strip()] or list(REPAIR_DEFAULT)
    return [f for f in REPAIR_FIELDS if f in want]


def _rs(v) -> str:
    return f"Rs. {money(v):,.0f}"


def _sticker(db: Session, job: RepairJob, shop: Shop, want: list[str], ur: bool) -> str:
    e = html.escape
    w = lambda k: WORDS[k][1 if ur else 0]
    party = db.get(Party, job.party_id) if job.party_id else None
    lines: list[str] = []
    if "shop" in want:
        lines.append(
            f'<div class="shop">{e(shop.name_ur if ur and shop.name_ur else shop.name)}</div>'
        )
    head = []
    if "no" in want:
        head.append(f'<span class="no">{e(job.no)}</span>')
    if "customer" in want and party:
        head.append(f'<span class="who">{e(party.name)}</span>')
    if head:
        lines.append(f'<div class="row">{"".join(head)}</div>')
    if "phone" in want and party and party.phone:
        lines.append(f'<div class="meta ltr">{e(party.phone)}</div>')
    if "device" in want:
        lines.append(f'<div class="name">{e(job.device_desc)}</div>')
    if "imei" in want and job.imei:
        lines.append(f'<div class="imei">IMEI {e(job.imei)}</div>')
    if "fault" in want:
        faults = [FAULT_CODES.get(c, (c, c))[1 if ur else 0] for c in job.fault_codes]
        if job.fault_text:
            faults.append(job.fault_text)
        if faults:
            lines.append(f'<div class="fault">{e(" · ".join(faults))}</div>')
    if "accessories" in want and job.received_accessories:
        acc = [ACCESSORIES.get(a, (a, a))[1 if ur else 0] for a in job.received_accessories]
        lines.append(f'<div class="meta">{e(w("with"))}: {e(", ".join(acc))}</div>')
    dates = []
    if "received" in want:
        dates.append(f"{w('received')} {job.created_at.strftime('%d-%m')}")
    if "promised" in want and job.promised_at:
        dates.append(f"{w('promised')} {job.promised_at.strftime('%d-%m')}")
    if dates:
        lines.append(f'<div class="meta">{e(" · ".join(dates))}</div>')
    money_ = []
    if "estimate" in want and job.estimate:
        money_.append(f"{w('estimate')} {_rs(job.estimate)}")
    if "advance" in want and job.advance:
        money_.append(f"{w('advance')} {_rs(job.advance)}")
    if "left" in want:
        base = job.total if job.total else job.estimate
        left = money(max(base - job.paid, 0)) if base else None
        if left:
            money_.append(f"{w('left')} {_rs(left)}")
    if money_:
        lines.append(f'<div class="meta">{e(" · ".join(money_))}</div>')
    if "lab" in want:
        trip = open_trip(db, job.id)
        if trip:
            lab = db.get(Party, trip.lab_party_id)
            lines.append(f'<div class="meta">{e(w("lab"))}: {e(lab.name if lab else "")}</div>')
    if "notes" in want and (job.notes or job.condition_notes):
        lines.append(f'<div class="meta">{e(job.condition_notes or job.notes or "")}</div>')
    bar = ""
    if "barcode" in want:
        bar = f'<div class="bar">{codes.svg("code128", job.no)}</div>'
    return f'<div class="label{" ur" if ur else ""}"><div>{"".join(lines)}</div>{bar}</div>'


def repairs_html(
    db: Session,
    shop_id: uuid.UUID,
    ids: list[uuid.UUID],
    *,
    size: str = "58x40",
    w: float | None = None,
    h: float | None = None,
    fields: str | None = None,
    copies: int = 1,
    lang: str | None = None,
) -> str:
    from app.modules.labels.service import _size

    shop = db.get(Shop, shop_id)
    ur = (lang or shop.default_locale) == "ur"
    lw, lh, sheet = _size(size, w, h)
    want = fields_of(fields)
    jobs = {
        j.id: j
        for j in db.scalars(
            select(RepairJob).where(RepairJob.shop_id == shop_id, RepairJob.id.in_(ids))
        ).all()
    }
    labels = []
    for jid in ids:
        j = jobs.get(jid)
        if j is not None:
            labels.extend([_sticker(db, j, shop, want, ur)] * max(1, min(copies, 10)))
    if not labels:
        raise ValidationFailed(code="no_labels")
    return _page(labels, lw, lh, sheet, ur, f"repair-{jobs[ids[0]].no if ids[0] in jobs else ''}")


def _page(labels: list[str], w: float, h: float, sheet: bool, ur: bool, title: str) -> str:
    s = h / 40  # a 40 mm sticker is the base
    if sheet:
        page = "@page{size:A4;margin:8mm} .grid{display:flex;flex-wrap:wrap;gap:2mm} .label{page-break-inside:avoid}"
    else:
        page = f"@page{{size:{w}mm {h}mm;margin:0}} .label{{page-break-after:always}} .label:last-child{{page-break-after:auto}}"
    css = f"""
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:Arial,Helvetica,'Noto Nastaliq Urdu',sans-serif;color:#000;background:#fff}}
    {page}
    .label{{width:{w}mm;height:{h}mm;padding:{1.2 * s:.2f}mm {1.5 * s:.2f}mm;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;border:0.1mm solid #bbb}}
    @media print{{.label{{border:0}}}}
    .ur{{direction:rtl;font-family:'Noto Nastaliq Urdu',Arial,sans-serif}}
    .shop{{font-size:{2.4 * s:.2f}mm;font-weight:700;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .row{{display:flex;justify-content:space-between;gap:1mm;align-items:baseline}}
    .no{{font-size:{3.4 * s:.2f}mm;font-weight:900;font-family:'Courier New',monospace;direction:ltr}}
    .who{{font-size:{3 * s:.2f}mm;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .name{{font-size:{3 * s:.2f}mm;font-weight:800;line-height:1.15}}
    .fault{{font-size:{2.7 * s:.2f}mm;font-weight:700;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
    .imei{{font-size:{2.3 * s:.2f}mm;font-family:'Courier New',monospace;direction:ltr}}
    .meta{{font-size:{2.3 * s:.2f}mm;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .ltr{{direction:ltr}}
    .bar{{height:{7 * s:.2f}mm;width:100%}} .bar svg{{display:block;width:100%;height:100%}}
    """
    body = "".join(labels)
    inner = f'<div class="grid">{body}</div>' if sheet else body
    return (
        f'<!doctype html><html lang="{"ur" if ur else "en"}"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title><style>{css}</style></head><body>{inner}</body></html>"
    )
