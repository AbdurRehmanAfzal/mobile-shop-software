import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import DeviceStatus, EventType
from app.modules.loans.models import Loan, LoanStatus
from app.modules.loans.schemas import LoanCreate, LoanSellIn
from app.modules.parties.models import Party
from app.modules.sales.schemas import DeviceSaleLineIn, SaleCreate
from app.modules.sales.service import create_sale


def create_loan(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: LoanCreate) -> Loan:
    device = get_device(db, shop_id, data.device_id)
    party = db.get(Party, data.party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    if "shop" not in party.kinds:
        raise ValidationFailed(
            code="loan_party_must_be_shop",
            message_en="Loans (amanat) are only to other shops",
            message_ur="امانت صرف دوسری دکان کو دی جا سکتی ہے",
        )
    if device.status != DeviceStatus.IN_STOCK:
        raise Conflict(
            code="device_not_in_stock",
            message_en=f"Device is {device.status}",
            message_ur="موبائل اسٹاک میں نہیں",
        )
    loan = Loan(
        shop_id=shop_id,
        device_id=device.id,
        party_id=party.id,
        expected_back_at=data.expected_back_at,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(loan)
    db.flush()
    apply_event(
        db,
        shop_id,
        user_id,
        device,
        EventType.LOANED_OUT,
        party_id=party.id,
        document_type="loan",
        document_id=loan.id,
        data={
            "expected_back_at": data.expected_back_at.isoformat()
            if data.expected_back_at
            else None,
            "note": data.notes,
        },
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="loan",
        entity_id=loan.id,
        action="create",
        after={"device": device.imei1, "party": party.name},
    )
    db.commit()
    return loan


def get_loan(db: Session, shop_id: uuid.UUID, loan_id: uuid.UUID) -> Loan:
    loan = db.get(Loan, loan_id)
    if loan is None or loan.shop_id != shop_id:
        raise NotFound(code="loan_not_found")
    return loan


def return_loan(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, loan_id: uuid.UUID, notes: str | None
) -> Loan:
    loan = get_loan(db, shop_id, loan_id)
    if loan.status != LoanStatus.OUT:
        raise Conflict(code="loan_not_open")
    device = get_device(db, shop_id, loan.device_id)
    apply_event(
        db,
        shop_id,
        user_id,
        device,
        EventType.LOAN_RETURNED,
        party_id=loan.party_id,
        document_type="loan",
        document_id=loan.id,
        data={"note": notes},
    )
    loan.status = LoanStatus.RETURNED
    loan.settled_at = utcnow()
    if notes:
        loan.notes = f"{loan.notes}\n{notes}" if loan.notes else notes
    record_audit(
        db, shop_id=shop_id, user_id=user_id, entity="loan", entity_id=loan.id, action="return"
    )
    db.commit()
    return loan


def sell_loan(db: Session, shop_id: uuid.UUID, ctx, loan_id: uuid.UUID, data: LoanSellIn) -> Loan:
    """The borrowing shop sold (or kept) the device: convert the loan into a sale to that shop."""
    loan = get_loan(db, shop_id, loan_id)
    if loan.status != LoanStatus.OUT:
        raise Conflict(code="loan_not_open")
    sale = SaleCreate(
        party_id=loan.party_id,
        devices=[
            DeviceSaleLineIn(
                device_id=loan.device_id, price=data.price, warranty_days=data.warranty_days
            )
        ],
        discount=data.discount,
        paid=data.paid,
        cash_account_id=data.cash_account_id,
        notes=data.notes,
    )
    invoice = create_sale(db, shop_id, ctx, sale, loan=loan)
    loan.status = LoanStatus.SOLD
    loan.settled_at = utcnow()
    loan.invoice_id = invoice.id
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="loan",
        entity_id=loan.id,
        action="sold",
        after={"invoice": invoice.no},
    )
    db.commit()
    return loan


def list_loans(
    db: Session,
    shop_id: uuid.UUID,
    *,
    status: LoanStatus | None,
    party_id: uuid.UUID | None,
    limit: int,
) -> list[Loan]:
    stmt = select(Loan).where(Loan.shop_id == shop_id)
    if status:
        stmt = stmt.where(Loan.status == status)
    if party_id:
        stmt = stmt.where(Loan.party_id == party_id)
    return list(db.scalars(stmt.order_by(Loan.out_at.desc()).limit(limit)).all())


def to_out(db: Session, loan: Loan) -> dict:
    device = db.get(Device, loan.device_id)
    party = db.get(Party, loan.party_id)
    label = None
    if device:
        b, m = db.get(Brand, device.brand_id), db.get(Model, device.model_id)
        label = f"{b.name if b else ''} {m.name if m else ''}".strip()
    return {
        **{c.name: getattr(loan, c.name) for c in Loan.__table__.columns},
        "imei1": device.imei1 if device else None,
        "device_label": label,
        "party_name": party.name if party else None,
        "overdue": loan.status == LoanStatus.OUT
        and loan.expected_back_at is not None
        and loan.expected_back_at < shop_today(),
    }
