"""
API Routes for Transactions (Sales, Purchases, Payments)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import date, datetime

from app.database import get_db
from app.models import Transaction, Party, MobileInventory
from app.models.models import MobileBrand, MobileModel, MobileCondition, PTAStatus, MobileStatus
from app.schemas import (
    TransactionResponse as TransactionSchema,
    TransactionCreate,
    QuickTradeInRequest
)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def update_party_balance(db: Session, party_id: int):
    """Recalculate and update party balance from all transactions"""
    transactions = db.query(Transaction).filter(
        Transaction.party_id == party_id
    ).order_by(Transaction.transaction_date, Transaction.created_at).all()
    
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        return
    
    balance = 0.0
    for txn in transactions:
        if txn.party_type == "CUSTOMER":
            if txn.transaction_type == "SALE":
                balance += txn.total_amount
            elif txn.transaction_type == "PAYMENT_IN":
                balance -= txn.total_amount
            elif txn.transaction_type == "TRADE_IN":
                balance -= txn.total_amount
        elif txn.party_type == "SUPPLIER":
            if txn.transaction_type == "PURCHASE":
                balance += txn.total_amount
            elif txn.transaction_type == "PAYMENT_OUT":
                balance -= txn.total_amount
            elif txn.transaction_type == "RETURN_OUT":
                balance -= txn.total_amount
    
    party.current_balance = balance
    party.updated_at = datetime.utcnow()
    db.add(party)
    db.commit()

# ============================================================================
# CREATE TRANSACTION
# ============================================================================

@router.post("/", response_model=TransactionSchema)
def create_transaction(
    transaction: TransactionCreate,
    db: Session = Depends(get_db)
):
    """Record a transaction (sale, purchase, payment)"""
    
    # Verify party exists
    party = db.query(Party).filter(Party.id == transaction.party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    # Verify mobile exists if provided
    if transaction.mobile_id:
        mobile = db.query(MobileInventory).filter(
            MobileInventory.id == transaction.mobile_id
        ).first()
        if not mobile:
            raise HTTPException(status_code=404, detail="Mobile not found")
    
    # Validate transaction type matches party type
    if transaction.party_type.value != party.type:
        raise HTTPException(
            status_code=400,
            detail=f"Party type mismatch. Party is {party.type}, transaction expects {transaction.party_type.value}"
        )
    
    # Calculate new balance
    balance = party.current_balance
    if party.type == "CUSTOMER":
        if transaction.transaction_type.value == "SALE":
            balance += transaction.total_amount
        elif transaction.transaction_type.value == "PAYMENT_IN":
            balance -= transaction.total_amount
        elif transaction.transaction_type.value == "TRADE_IN":
            balance -= transaction.total_amount
    elif party.type == "SUPPLIER":
        if transaction.transaction_type.value == "PURCHASE":
            balance += transaction.total_amount
        elif transaction.transaction_type.value == "PAYMENT_OUT":
            balance -= transaction.total_amount
        elif transaction.transaction_type.value == "RETURN_OUT":
            balance -= transaction.total_amount
    
    # Create transaction
    db_transaction = Transaction(
        party_id=transaction.party_id,
        mobile_id=transaction.mobile_id,
        party_type=transaction.party_type.value,
        transaction_type=transaction.transaction_type.value,
        quantity=transaction.quantity,
        unit_price=transaction.unit_price,
        total_amount=transaction.total_amount,
        balance_after=balance,
        transaction_date=transaction.transaction_date,
        notes=transaction.notes
    )
    
    db.add(db_transaction)
    db.flush()  # Get the transaction ID
    
    # Update mobile status if applicable
    if transaction.mobile_id:
        mobile = db.query(MobileInventory).filter(
            MobileInventory.id == transaction.mobile_id
        ).first()
        if transaction.transaction_type.value == "SALE":
            mobile.status = "SOLD"
        elif transaction.transaction_type.value == "TRADE_IN":
            mobile.status = "TRADE_IN"
        db.add(mobile)
    
    # Update party balance
    party.current_balance = balance
    party.updated_at = datetime.utcnow()
    db.add(party)
    
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

# ============================================================================
# GET TRANSACTIONS
# ============================================================================

@router.get("/", response_model=List[TransactionSchema])
def get_transactions(
    party_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Get transactions with optional filtering"""
    query = db.query(Transaction)
    
    if party_id:
        query = query.filter(Transaction.party_id == party_id)
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)
    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)
    
    return query.order_by(desc(Transaction.transaction_date)).all()

@router.get("/{transaction_id}", response_model=TransactionSchema)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Get a specific transaction"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction

@router.get("/party/{party_id}", response_model=List[TransactionSchema])
def get_party_transactions(party_id: int, db: Session = Depends(get_db)):
    """Get all transactions for a party"""
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    return db.query(Transaction).filter(
        Transaction.party_id == party_id
    ).order_by(desc(Transaction.transaction_date)).all()

# ============================================================================
# QUICK TRANSACTION SHORTCUTS
# ============================================================================

@router.post("/quick-sale")
def quick_sale(
    customer_id: int,
    mobile_id: int,
    price: float,
    amount_paid: float,
    payment_method: str = "cash",
    transaction_date: date = None,
    notes: str = None,
    db: Session = Depends(get_db)
):
    """Quick sale transaction with partial payment support

    Args:
        customer_id: Customer ID
        mobile_id: Mobile ID
        price: Full selling price
        amount_paid: Amount customer paid (can be less than price for partial payment)
        payment_method: Payment method (cash, card, cheque)
        transaction_date: Transaction date (defaults to today)
        notes: Optional notes
    """
    if transaction_date is None:
        transaction_date = date.today()

    customer = db.query(Party).filter(Party.id == customer_id).first()
    if not customer or customer.type != "CUSTOMER":
        raise HTTPException(status_code=404, detail="Customer not found")

    mobile = db.query(MobileInventory).filter(MobileInventory.id == mobile_id).first()
    if not mobile:
        raise HTTPException(status_code=404, detail="Mobile not found")

    # Calculate balance: amount customer still owes or refund due
    # If amount_paid < price: customer owes (positive balance)
    # If amount_paid = price: no credit or refund (zero balance)
    # If amount_paid > price: customer gets refund (negative balance)
    remaining_balance = price - amount_paid
    balance_after = customer.current_balance + remaining_balance

    # Create transaction with payment details
    db_transaction = Transaction(
        party_id=customer_id,
        mobile_id=mobile_id,
        party_type="CUSTOMER",
        transaction_type="SALE",
        quantity=1,
        unit_price=price,
        total_amount=price,
        amount_received=amount_paid,
        payment_method=payment_method,
        balance_after=balance_after,
        transaction_date=transaction_date,
        notes=notes
    )

    db.add(db_transaction)
    db.flush()

    # Update mobile status to SOLD
    mobile.status = "SOLD"
    mobile.is_sold = True
    db.add(mobile)

    # Update customer balance
    customer.current_balance = balance_after
    customer.updated_at = datetime.utcnow()
    db.add(customer)

    db.commit()
    db.refresh(db_transaction)

    return {
        "status": "success",
        "transaction": db_transaction,
        "customer_balance": balance_after,
        "amount_paid": amount_paid,
        "remaining_balance": remaining_balance,
        "payment_method": payment_method
    }

@router.post("/quick-payment-in")
def quick_payment_in(
    customer_id: int,
    amount: float,
    transaction_date: date,
    notes: str = None,
    db: Session = Depends(get_db)
):
    """Record customer payment"""
    customer = db.query(Party).filter(Party.id == customer_id).first()
    if not customer or customer.type != "CUSTOMER":
        raise HTTPException(status_code=404, detail="Customer not found")
    
    balance = customer.current_balance - amount
    
    db_transaction = Transaction(
        party_id=customer_id,
        mobile_id=None,
        party_type="CUSTOMER",
        transaction_type="PAYMENT_IN",
        quantity=1,
        unit_price=amount,
        total_amount=amount,
        balance_after=balance,
        transaction_date=transaction_date,
        notes=notes
    )
    
    db.add(db_transaction)
    db.flush()
    
    customer.current_balance = balance
    customer.updated_at = datetime.utcnow()
    db.add(customer)
    
    db.commit()
    db.refresh(db_transaction)
    
    return {
        "status": "success",
        "transaction": db_transaction,
        "customer_balance": balance,
        "balance_clear": balance == 0
    }

@router.post("/quick-payment-out")
def quick_payment_out(
    supplier_id: int,
    amount: float,
    transaction_date: date,
    notes: str = None,
    db: Session = Depends(get_db)
):
    """Pay supplier"""
    supplier = db.query(Party).filter(Party.id == supplier_id).first()
    if not supplier or supplier.type != "SUPPLIER":
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    balance = supplier.current_balance - amount
    
    db_transaction = Transaction(
        party_id=supplier_id,
        mobile_id=None,
        party_type="SUPPLIER",
        transaction_type="PAYMENT_OUT",
        quantity=1,
        unit_price=amount,
        total_amount=amount,
        balance_after=balance,
        transaction_date=transaction_date,
        notes=notes
    )
    
    db.add(db_transaction)
    db.flush()
    
    supplier.current_balance = balance
    supplier.updated_at = datetime.utcnow()
    db.add(supplier)
    
    db.commit()
    db.refresh(db_transaction)
    
    return {
        "status": "success",
        "transaction": db_transaction,
        "supplier_balance": balance,
        "balance_clear": balance == 0
    }

@router.post("/quick-trade-in")
def quick_trade_in(
    payload: QuickTradeInRequest,
    db: Session = Depends(get_db)
):
    """Quick trade-in purchase from customer/supplier with photo and CNIC capture

    Request body should contain:
        - supplier_id: Supplier/customer selling the device ID
        - brand_id: Brand ID
        - model_id: Model ID
        - imei1: First IMEI number (required)
        - imei2: Second IMEI number (required)
        - imei3: Third IMEI number (optional)
        - condition: Device condition (new, used, patched)
        - patch_details: Details about patches if condition is patched
        - pta_status: PTA status (locked, unlocked, approved)
        - cnic_number: CNIC number of supplier
        - cnic_photo_url: URL/base64 of CNIC photo
        - photos: List of device photos (URLs/base64)
        - purchase_price: Amount we're paying for the device
        - payment_method: Payment method (cash, cheque, transfer)
        - amount_paid: Amount actually paid to supplier
        - transaction_date: Transaction date (defaults to today)
        - notes: Optional notes
    """
    transaction_date = payload.transaction_date or date.today()

    # Verify supplier exists and is a VENDOR or TRADE_IN
    supplier = db.query(Party).filter(Party.id == payload.supplier_id).first()
    if not supplier or supplier.type.value not in ["VENDOR", "TRADE_IN"]:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Verify brand and model exist (use new models)
    brand = db.query(MobileBrand).filter(MobileBrand.id == payload.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    model = db.query(MobileModel).filter(MobileModel.id == payload.model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Map condition values to enum
    condition_map = {
        "new": MobileCondition.NEW,
        "used": MobileCondition.USED,
        "patched": MobileCondition.PATCHED
    }
    db_condition = condition_map.get(payload.condition, MobileCondition.USED)

    # Map PTA status values to enum
    pta_map = {
        "locked": PTAStatus.PTA,
        "unlocked": PTAStatus.NON_PTA,
        "approved": PTAStatus.PTA
    }
    db_pta_status = pta_map.get(payload.pta_status, PTAStatus.PTA)

    # Prepare IMEI info (for notes/reference)
    imei_info = f"{payload.imei1}|{payload.imei2}"
    if payload.imei3:
        imei_info += f"|{payload.imei3}"

    # Prepare notes with metadata
    notes_text = payload.notes or f"Trade-in: {brand.name} {model.model_name} | IMEI: {imei_info}"
    if payload.patch_details:
        notes_text += f" | Patch: {payload.patch_details}"
    if payload.cnic_number:
        notes_text += f" | CNIC: {payload.cnic_number}"

    # Create new mobile in inventory
    new_mobile = MobileInventory(
        model_id=payload.model_id,
        imei1=payload.imei1,
        imei2=payload.imei2,
        imei3=payload.imei3 if payload.imei3 else None,
        pta_status=db_pta_status,
        condition=db_condition,
        cost_price=payload.purchase_price,
        sale_price=payload.purchase_price * 1.2,  # Default 20% markup for selling
        status=MobileStatus.IN_STOCK,
        received_date=transaction_date,
        notes=notes_text
    )

    db.add(new_mobile)
    db.flush()

    # Calculate balance: amount we still owe supplier or prepayment
    # If amount_paid < purchase_price: we owe supplier (positive balance)
    # If amount_paid = purchase_price: no credit or debt (zero balance)
    # If amount_paid > purchase_price: we have prepaid (negative balance)
    remaining_balance = payload.purchase_price - payload.amount_paid
    balance_after = supplier.current_balance + remaining_balance

    # Create transaction record
    db_transaction = Transaction(
        party_id=payload.supplier_id,
        mobile_id=new_mobile.id,
        party_type="VENDOR",  # Supplier is a VENDOR
        transaction_type="PURCHASE",
        quantity=1,
        unit_price=payload.purchase_price,
        total_amount=payload.purchase_price,
        amount=payload.purchase_price,  # Required field
        balance_after=balance_after,
        transaction_date=transaction_date,
        description=notes_text
    )

    db.add(db_transaction)
    db.flush()

    # Update supplier balance
    supplier.current_balance = balance_after
    supplier.updated_at = datetime.utcnow()
    db.add(supplier)

    db.commit()
    db.refresh(db_transaction)
    db.refresh(new_mobile)

    return {
        "status": "success",
        "transaction": db_transaction,
        "mobile": new_mobile,
        "supplier_balance": balance_after,
        "amount_paid": payload.amount_paid,
        "remaining_balance": remaining_balance,
        "payment_method": payload.payment_method
    }

# ============================================================================
# TRANSACTION STATISTICS
# ============================================================================

@router.get("/stats/daily")
def get_daily_stats(
    target_date: date,
    db: Session = Depends(get_db)
):
    """Get daily transaction statistics"""
    transactions = db.query(Transaction).filter(
        Transaction.transaction_date == target_date
    ).all()
    
    sales = [t for t in transactions if t.transaction_type == "SALE"]
    purchases = [t for t in transactions if t.transaction_type == "PURCHASE"]
    payments_in = [t for t in transactions if t.transaction_type == "PAYMENT_IN"]
    payments_out = [t for t in transactions if t.transaction_type == "PAYMENT_OUT"]
    
    total_sales = sum(t.total_amount for t in sales)
    total_purchases = sum(t.total_amount for t in purchases)
    total_payments_in = sum(t.total_amount for t in payments_in)
    total_payments_out = sum(t.total_amount for t in payments_out)
    
    return {
        "date": target_date,
        "sales": {
            "count": len(sales),
            "total_amount": total_sales
        },
        "purchases": {
            "count": len(purchases),
            "total_amount": total_purchases
        },
        "cash_in": total_payments_in,
        "cash_out": total_payments_out,
        "net_cash": total_payments_in - total_payments_out,
        "profit_estimate": total_sales - total_purchases
    }

# ============================================================================
# MOBILE HISTORY & TRACKING
# ============================================================================

@router.get("/mobile/{mobile_id}/history")
def get_mobile_history(
    mobile_id: int,
    db: Session = Depends(get_db)
):
    """Get complete history/timeline of a mobile device

    Shows all events: purchase, sales, payments, trade-ins
    Calculates total profit and current owner
    """
    # Verify mobile exists
    mobile = db.query(MobileInventory).filter(MobileInventory.id == mobile_id).first()
    if not mobile:
        raise HTTPException(status_code=404, detail="Mobile not found")

    # Get all transactions for this mobile
    transactions = db.query(Transaction).filter(
        Transaction.mobile_id == mobile_id
    ).order_by(Transaction.transaction_date).all()

    # Get brand and model info
    from app.models import MobileBrand, MobileModel
    model = db.query(MobileModel).filter(MobileModel.id == mobile.model_id).first()
    brand = db.query(MobileBrand).filter(MobileBrand.id == model.brand_id).first() if model else None

    # Calculate financial summary
    purchases_total = sum(t.total_amount for t in transactions if t.transaction_type == "PURCHASE")
    sales_total = sum(t.total_amount for t in transactions if t.transaction_type == "SALE")
    profit = sales_total - purchases_total

    # Get current owner (last SALE or TRADE_IN event)
    relevant_events = [t for t in transactions if t.transaction_type in ["SALE", "TRADE_IN"]]
    current_owner = relevant_events[-1].party_id if relevant_events else None
    current_owner_party = db.query(Party).filter(Party.id == current_owner).first() if current_owner else None

    # Current status
    current_status = mobile.status  # IN_STOCK, SOLD, TRADE_IN

    # Build timeline
    timeline = []
    for txn in transactions:
        party = db.query(Party).filter(Party.id == txn.party_id).first()
        timeline.append({
            "date": txn.transaction_date,
            "type": txn.transaction_type,
            "party_id": txn.party_id,
            "party_name": party.name if party else "Unknown",
            "party_type": txn.party_type,
            "amount": txn.total_amount,
            "balance_after": txn.balance_after,
            "notes": txn.description,
            "icon": get_event_icon(txn.transaction_type)
        })

    return {
        "status": "success",
        "mobile": {
            "id": mobile.id,
            "imei": mobile.imei1,
            "brand": brand.name if brand else "Unknown",
            "model": model.model_name if model else "Unknown",
            "condition": mobile.condition,
            "pta_status": mobile.pta_status.value if mobile.pta_status else "N/A"
        },
        "current_status": current_status,
        "current_owner": {
            "id": current_owner_party.id if current_owner_party else None,
            "name": current_owner_party.name if current_owner_party else "Unknown",
            "type": current_owner_party.type if current_owner_party else "Unknown"
        },
        "financial_summary": {
            "total_purchase_cost": purchases_total,
            "total_sales_earned": sales_total,
            "total_profit": profit
        },
        "timeline": timeline
    }

@router.get("/mobile/search/{query}")
def search_mobile(
    query: str,
    db: Session = Depends(get_db)
):
    """Search mobile by IMEI or model name"""
    # Search by IMEI
    mobile_by_imei = db.query(MobileInventory).filter(
        MobileInventory.imei1.contains(query)
    ).first()

    if mobile_by_imei:
        return {"status": "success", "results": [{"id": mobile_by_imei.id, "imei": mobile_by_imei.imei1, "model_id": mobile_by_imei.model_id}]}

    # Search by model name
    from app.models import MobileModel
    models = db.query(MobileModel).filter(
        MobileModel.model_name.ilike(f"%{query}%")
    ).all()

    if models:
        mobiles = []
        for model in models:
            mobile_list = db.query(MobileInventory).filter(
                MobileInventory.model_id == model.id
            ).all()
            for mobile in mobile_list:
                mobiles.append({
                    "id": mobile.id,
                    "imei": mobile.imei1,
                    "model_id": model.id,
                    "model_name": model.model_name
                })
        return {"status": "success", "results": mobiles}

    return {"status": "success", "results": []}

@router.get("/mobile/by-customer/{customer_id}")
def get_customer_mobiles(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Get all mobiles that a customer has purchased"""
    # Find all SALE transactions for this customer
    sales = db.query(Transaction).filter(
        Transaction.party_id == customer_id,
        Transaction.transaction_type == "SALE"
    ).all()

    mobiles = []
    for sale in sales:
        mobile = db.query(MobileInventory).filter(MobileInventory.id == sale.mobile_id).first()
        if mobile:
            from app.models import MobileModel, MobileBrand
            model = db.query(MobileModel).filter(MobileModel.id == mobile.model_id).first()
            brand = db.query(MobileBrand).filter(MobileBrand.id == model.brand_id).first() if model else None

            mobiles.append({
                "id": mobile.id,
                "imei": mobile.imei1,
                "brand": brand.name if brand else "Unknown",
                "model": model.model_name if model else "Unknown",
                "sale_date": sale.transaction_date,
                "sale_amount": sale.total_amount,
                "condition": mobile.condition,
                "status": mobile.status
            })

    return {
        "status": "success",
        "customer_id": customer_id,
        "total_mobiles": len(mobiles),
        "mobiles": mobiles
    }

def get_event_icon(event_type: str) -> str:
    """Return emoji icon for event type"""
    icons = {
        "PURCHASE": "📦",
        "SALE": "📱",
        "PAYMENT_IN": "💰",
        "PAYMENT_OUT": "💸",
        "TRADE_IN": "🔄",
        "RETURN_OUT": "↩️"
    }
    return icons.get(event_type, "📌")

# ============================================================================
# DEMO / TEST DATA - FOR TESTING MOBILE HISTORY
# ============================================================================

@router.post("/demo/create-test-data")
def create_test_data(db: Session = Depends(get_db)):
    """Create demo data for testing mobile history feature

    Creates:
    - 1 Supplier (Rehman Traders)
    - 2 Customers (Ahmed Khan, Ali Raza)
    - 1 Brand (Apple)
    - 1 Model (iPhone 13)
    - 1 Mobile with complete transaction history
    """
    from app.models import MobileBrand, MobileModel
    from app.models.models import MobileCondition, MobileStatus

    try:
        # Create brand
        brand = db.query(MobileBrand).filter(MobileBrand.name == "Apple").first()
        if not brand:
            brand = MobileBrand(name="Apple", name_urdu="ایپل")
            db.add(brand)
            db.flush()

        # Create model
        model = db.query(MobileModel).filter(MobileModel.model_name == "iPhone 13").first()
        if not model:
            model = MobileModel(
                brand_id=brand.id,
                model_name="iPhone 13",
                sale_price=100000
            )
            db.add(model)
            db.flush()

        # Create vendor/supplier
        vendor = db.query(Party).filter(Party.phone == "0300-1111111").first()
        if not vendor:
            vendor = Party(
                name="Rehman Traders",
                phone="0300-1111111",
                address="Hall Road, Lahore",
                city="Lahore",
                type="VENDOR",
                is_active=True,
                current_balance=0
            )
            db.add(vendor)
            db.flush()

        # Create customers
        customer1 = db.query(Party).filter(Party.phone == "0300-2222222").first()
        if not customer1:
            customer1 = Party(
                name="Ahmed Khan",
                phone="0300-2222222",
                address="Defence, Lahore",
                city="Lahore",
                type="CUSTOMER",
                is_active=True,
                current_balance=0
            )
            db.add(customer1)
            db.flush()

        customer2 = db.query(Party).filter(Party.phone == "0300-3333333").first()
        if not customer2:
            customer2 = Party(
                name="Ali Raza",
                phone="0300-3333333",
                address="Cantt, Lahore",
                city="Lahore",
                type="CUSTOMER",
                is_active=True,
                current_balance=0
            )
            db.add(customer2)
            db.flush()

        # Create mobile
        mobile = db.query(MobileInventory).filter(MobileInventory.imei1 == "352XXXXXXXXX").first()
        if not mobile:
            mobile = MobileInventory(
                model_id=model.id,
                imei1="352XXXXXXXXX",
                condition=MobileCondition.NEW,
                cost_price=95000,
                sale_price=110000,
                status=MobileStatus.SOLD
            )
            db.add(mobile)
            db.flush()

            # Create transaction history
            # Transaction 1: Purchase from vendor
            t1 = Transaction(
                party_id=vendor.id,
                mobile_id=mobile.id,
                party_type="VENDOR",
                transaction_type="PURCHASE",
                quantity=1,
                unit_price=95000,
                total_amount=95000,
                amount=95000,
                transaction_date=date(2025, 1, 1),
                description="Purchased from Rehman Traders - New in Box"
            )
            db.add(t1)

            # Transaction 2: Sale to Ahmed Khan
            t2 = Transaction(
                party_id=customer1.id,
                mobile_id=mobile.id,
                party_type="CUSTOMER",
                transaction_type="SALE",
                quantity=1,
                unit_price=110000,
                total_amount=110000,
                amount=110000,
                transaction_date=date(2025, 1, 15),
                description="Sold to Ahmed Khan with all accessories"
            )
            db.add(t2)

            # Transaction 3: Partial payment from Ahmed
            t3 = Transaction(
                party_id=customer1.id,
                mobile_id=mobile.id,
                party_type="CUSTOMER",
                transaction_type="PAYMENT_IN",
                quantity=1,
                unit_price=25000,
                total_amount=25000,
                amount=25000,
                transaction_date=date(2025, 1, 20),
                description="Partial payment received from Ahmed Khan"
            )
            db.add(t3)

            # Transaction 4: Trade-in from Ahmed
            t4 = Transaction(
                party_id=customer1.id,
                mobile_id=mobile.id,
                party_type="CUSTOMER",
                transaction_type="TRADE_IN",
                quantity=1,
                unit_price=85000,
                total_amount=85000,
                amount=85000,
                transaction_date=date(2025, 1, 28),
                description="Ahmed traded-in the mobile with credit for new device"
            )
            db.add(t4)

            # Transaction 5: Sale to Ali Raza
            t5 = Transaction(
                party_id=customer2.id,
                mobile_id=mobile.id,
                party_type="CUSTOMER",
                transaction_type="SALE",
                quantity=1,
                unit_price=80000,
                total_amount=80000,
                amount=80000,
                transaction_date=date(2025, 2, 1),
                description="Sold to Ali Raza - Full payment"
            )
            db.add(t5)

            db.commit()

            return {
                "status": "success",
                "message": "Test data created successfully",
                "mobile_id": mobile.id,
                "mobile_imei": mobile.imei1,
                "history_url": f"/api/transactions/mobile/{mobile.id}/history"
            }
        else:
            return {
                "status": "success",
                "message": "Test data already exists",
                "mobile_id": mobile.id,
                "mobile_imei": mobile.imei1,
                "history_url": f"/api/transactions/mobile/{mobile.id}/history"
            }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/demo/create-bulk-test-data")
def create_bulk_test_data(db: Session = Depends(get_db)):
    """Create comprehensive test data with multiple mobiles

    Creates:
    - 3 Vendors (Rehman Traders, Ali Mobile Store, Tech Bazaar)
    - 6 Customers (Ahmed Khan, Ali Raza, Hassan Ahmed, Fatima Khan, Usman Khan, Zainab Ali)
    - 4 Brands (Apple, Samsung, Xiaomi, OnePlus)
    - 8 Models across brands
    - 10 Mobiles with complete transaction histories
    """
    from app.models import MobileBrand, MobileModel
    from app.models.models import MobileCondition, MobileStatus

    try:
        # Create brands
        brands_data = [
            {"name": "Apple", "urdu": "ایپل"},
            {"name": "Samsung", "urdu": "سام سنگ"},
            {"name": "Xiaomi", "urdu": "شیاومی"},
            {"name": "OnePlus", "urdu": "وان پلس"}
        ]

        brands = {}
        for brand_data in brands_data:
            brand = db.query(MobileBrand).filter(MobileBrand.name == brand_data["name"]).first()
            if not brand:
                brand = MobileBrand(name=brand_data["name"], name_urdu=brand_data["urdu"])
                db.add(brand)
                db.flush()
            brands[brand_data["name"]] = brand

        # Create models
        models_data = [
            {"brand": "Apple", "name": "iPhone 15 Pro", "price": 150000},
            {"brand": "Apple", "name": "iPhone 14", "price": 120000},
            {"brand": "Samsung", "name": "Galaxy S24", "price": 140000},
            {"brand": "Samsung", "name": "Galaxy A54", "price": 80000},
            {"brand": "Xiaomi", "name": "14", "price": 90000},
            {"brand": "Xiaomi", "name": "Redmi Note 13", "price": 60000},
            {"brand": "OnePlus", "name": "12", "price": 110000},
            {"brand": "OnePlus", "name": "Nord 4", "price": 70000}
        ]

        models = {}
        for model_data in models_data:
            model_key = f"{model_data['brand']}_{model_data['name']}"
            model = db.query(MobileModel).filter(
                MobileModel.model_name == model_data["name"],
                MobileModel.brand_id == brands[model_data["brand"]].id
            ).first()
            if not model:
                model = MobileModel(
                    brand_id=brands[model_data["brand"]].id,
                    model_name=model_data["name"],
                    sale_price=model_data["price"]
                )
                db.add(model)
                db.flush()
            models[model_key] = model

        # Create vendors
        vendors_data = [
            {"name": "Rehman Traders", "phone": "0300-1111111", "address": "Hall Road, Lahore"},
            {"name": "Ali Mobile Store", "phone": "0300-4444444", "address": "Main Bazaar, Islamabad"},
            {"name": "Tech Bazaar", "phone": "0300-5555555", "address": "Tariq Road, Karachi"}
        ]

        vendors = {}
        for vendor_data in vendors_data:
            vendor = db.query(Party).filter(Party.phone == vendor_data["phone"]).first()
            if not vendor:
                vendor = Party(
                    name=vendor_data["name"],
                    phone=vendor_data["phone"],
                    address=vendor_data["address"],
                    city=vendor_data["address"].split(",")[1].strip(),
                    type="VENDOR",
                    is_active=True,
                    current_balance=0
                )
                db.add(vendor)
                db.flush()
            vendors[vendor_data["name"]] = vendor

        # Create customers
        customers_data = [
            {"name": "Ahmed Khan", "phone": "0300-2222222", "address": "Defence, Lahore"},
            {"name": "Ali Raza", "phone": "0300-3333333", "address": "Cantt, Lahore"},
            {"name": "Hassan Ahmed", "phone": "0300-6666666", "address": "F-7, Islamabad"},
            {"name": "Fatima Khan", "phone": "0300-7777777", "address": "Gulberg, Lahore"},
            {"name": "Usman Khan", "phone": "0300-8888888", "address": "Clifton, Karachi"},
            {"name": "Zainab Ali", "phone": "0300-9999999", "address": "DHA, Lahore"}
        ]

        customers = {}
        for customer_data in customers_data:
            customer = db.query(Party).filter(Party.phone == customer_data["phone"]).first()
            if not customer:
                customer = Party(
                    name=customer_data["name"],
                    phone=customer_data["phone"],
                    address=customer_data["address"],
                    city=customer_data["address"].split(",")[1].strip(),
                    type="CUSTOMER",
                    is_active=True,
                    current_balance=0
                )
                db.add(customer)
                db.flush()
            customers[customer_data["name"]] = customer

        # Define test mobiles data
        test_mobiles = [
            {
                "imei": "352001234567890",
                "model_key": "Apple_iPhone 15 Pro",
                "condition": MobileCondition.NEW,
                "cost": 140000,
                "sale_price": 155000,
                "status": MobileStatus.SOLD,
                "transactions": [
                    {
                        "vendor": "Rehman Traders",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 2, 1),
                        "amount": 140000,
                        "notes": "New in box - Direct from distributor"
                    },
                    {
                        "vendor": None,
                        "customer": "Ahmed Khan",
                        "type": "SALE",
                        "date": date(2025, 2, 5),
                        "amount": 155000,
                        "notes": "Premium condition with warranty"
                    }
                ]
            },
            {
                "imei": "352002345678901",
                "model_key": "Samsung_Galaxy S24",
                "condition": MobileCondition.NEW,
                "cost": 130000,
                "sale_price": 145000,
                "status": MobileStatus.SOLD,
                "transactions": [
                    {
                        "vendor": "Ali Mobile Store",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 1, 20),
                        "amount": 130000,
                        "notes": "Stock purchase for retail"
                    },
                    {
                        "vendor": None,
                        "customer": "Fatima Khan",
                        "type": "SALE",
                        "date": date(2025, 2, 3),
                        "amount": 145000,
                        "notes": "Sold with full accessories"
                    },
                    {
                        "vendor": None,
                        "customer": "Fatima Khan",
                        "type": "PAYMENT_IN",
                        "date": date(2025, 2, 10),
                        "amount": 145000,
                        "notes": "Full payment received"
                    }
                ]
            },
            {
                "imei": "352003456789012",
                "model_key": "Apple_iPhone 14",
                "condition": MobileCondition.PATCHED,
                "cost": 95000,
                "sale_price": 110000,
                "status": MobileStatus.IN_STOCK,
                "transactions": [
                    {
                        "vendor": "Tech Bazaar",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 1, 15),
                        "amount": 95000,
                        "notes": "PTA approved, patched condition"
                    },
                    {
                        "vendor": None,
                        "customer": "Hassan Ahmed",
                        "type": "SALE",
                        "date": date(2025, 2, 2),
                        "amount": 110000,
                        "notes": "Sold to regular customer"
                    },
                    {
                        "vendor": None,
                        "customer": "Hassan Ahmed",
                        "type": "TRADE_IN",
                        "date": date(2025, 2, 12),
                        "amount": 100000,
                        "notes": "Trade-in for newer model"
                    }
                ]
            },
            {
                "imei": "352004567890123",
                "model_key": "Xiaomi_14",
                "condition": MobileCondition.NEW,
                "cost": 85000,
                "sale_price": 98000,
                "status": MobileStatus.SOLD,
                "transactions": [
                    {
                        "vendor": "Rehman Traders",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 2, 8),
                        "amount": 85000,
                        "notes": "Bulk purchase offer"
                    },
                    {
                        "vendor": None,
                        "customer": "Usman Khan",
                        "type": "SALE",
                        "date": date(2025, 2, 10),
                        "amount": 98000,
                        "notes": "Cash sale"
                    }
                ]
            },
            {
                "imei": "352005678901234",
                "model_key": "OnePlus_12",
                "condition": MobileCondition.USED,
                "cost": 70000,
                "sale_price": 85000,
                "status": MobileStatus.SOLD,
                "transactions": [
                    {
                        "vendor": "Ali Mobile Store",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 1, 25),
                        "amount": 70000,
                        "notes": "Second hand but excellent condition"
                    },
                    {
                        "vendor": None,
                        "customer": "Zainab Ali",
                        "type": "SALE",
                        "date": date(2025, 2, 6),
                        "amount": 85000,
                        "notes": "Good value for used device"
                    },
                    {
                        "vendor": None,
                        "customer": "Zainab Ali",
                        "type": "PAYMENT_IN",
                        "date": date(2025, 2, 15),
                        "amount": 85000,
                        "notes": "Full payment clearance"
                    }
                ]
            },
            {
                "imei": "352006789012345",
                "model_key": "Samsung_Galaxy A54",
                "condition": MobileCondition.NEW,
                "cost": 72000,
                "sale_price": 82000,
                "status": MobileStatus.IN_STOCK,
                "transactions": [
                    {
                        "vendor": "Tech Bazaar",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 2, 10),
                        "amount": 72000,
                        "notes": "New shipment arrival"
                    }
                ]
            },
            {
                "imei": "352007890123456",
                "model_key": "Xiaomi_Redmi Note 13",
                "condition": MobileCondition.NEW,
                "cost": 55000,
                "sale_price": 65000,
                "status": MobileStatus.SOLD,
                "transactions": [
                    {
                        "vendor": "Rehman Traders",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 2, 5),
                        "amount": 55000,
                        "notes": "Budget segment stock"
                    },
                    {
                        "vendor": None,
                        "customer": "Ahmed Khan",
                        "type": "SALE",
                        "date": date(2025, 2, 7),
                        "amount": 65000,
                        "notes": "Popular budget choice"
                    }
                ]
            },
            {
                "imei": "352008901234567",
                "model_key": "OnePlus_Nord 4",
                "condition": MobileCondition.NEW,
                "cost": 65000,
                "sale_price": 76000,
                "status": MobileStatus.SOLD,
                "transactions": [
                    {
                        "vendor": "Ali Mobile Store",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 1, 30),
                        "amount": 65000,
                        "notes": "Mid-range quality"
                    },
                    {
                        "vendor": None,
                        "customer": "Hassan Ahmed",
                        "type": "SALE",
                        "date": date(2025, 2, 4),
                        "amount": 76000,
                        "notes": "Good processor, long battery"
                    },
                    {
                        "vendor": None,
                        "customer": "Hassan Ahmed",
                        "type": "PAYMENT_IN",
                        "date": date(2025, 2, 11),
                        "amount": 76000,
                        "notes": "Complete payment"
                    }
                ]
            },
            {
                "imei": "352009012345678",
                "model_key": "Apple_iPhone 15 Pro",
                "condition": MobileCondition.PATCHED,
                "cost": 120000,
                "sale_price": 135000,
                "status": MobileStatus.IN_STOCK,
                "transactions": [
                    {
                        "vendor": "Tech Bazaar",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 2, 12),
                        "amount": 120000,
                        "notes": "Patched but perfect working"
                    }
                ]
            },
            {
                "imei": "352010123456789",
                "model_key": "Samsung_Galaxy S24",
                "condition": MobileCondition.USED,
                "cost": 100000,
                "sale_price": 120000,
                "status": MobileStatus.IN_STOCK,
                "transactions": [
                    {
                        "vendor": "Rehman Traders",
                        "customer": None,
                        "type": "PURCHASE",
                        "date": date(2025, 2, 13),
                        "amount": 100000,
                        "notes": "Trade-in from previous sale"
                    }
                ]
            }
        ]

        created_count = 0
        created_mobiles = []

        # Create mobiles and their transactions
        for mobile_data in test_mobiles:
            # Check if mobile already exists
            existing = db.query(MobileInventory).filter(
                MobileInventory.imei1 == mobile_data["imei"]
            ).first()

            if existing:
                continue

            mobile = MobileInventory(
                model_id=models[mobile_data["model_key"]].id,
                imei1=mobile_data["imei"],
                condition=mobile_data["condition"],
                cost_price=mobile_data["cost"],
                sale_price=mobile_data["sale_price"],
                status=mobile_data["status"]
            )
            db.add(mobile)
            db.flush()

            # Create transactions
            for txn_data in mobile_data.get("transactions", []):
                if txn_data["type"] == "PURCHASE":
                    party = vendors[txn_data["vendor"]]
                    party_type = "VENDOR"
                else:
                    party = customers[txn_data["customer"]]
                    party_type = "CUSTOMER"

                txn = Transaction(
                    party_id=party.id,
                    mobile_id=mobile.id,
                    party_type=party_type,
                    transaction_type=txn_data["type"],
                    quantity=1,
                    unit_price=txn_data["amount"],
                    total_amount=txn_data["amount"],
                    amount=txn_data["amount"],
                    transaction_date=txn_data["date"],
                    description=txn_data["notes"]
                )
                db.add(txn)

            created_count += 1
            created_mobiles.append({
                "id": mobile.id,
                "imei": mobile.imei1,
                "model": models[mobile_data["model_key"]].model_name,
                "status": mobile.status
            })

        db.commit()

        return {
            "status": "success",
            "message": f"Created {created_count} test mobiles successfully",
            "total_created": created_count,
            "brands": len(brands),
            "models": len(models),
            "vendors": len(vendors),
            "customers": len(customers),
            "mobiles": created_mobiles
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/demo/create-credit-tracking-data")
def create_credit_tracking_data(db: Session = Depends(get_db)):
    """Create realistic credit tracking scenario with one mobile through multiple customers

    Shows real business flow:
    1. Purchase from vendor with credit
    2. Sale to Customer 1 with partial payment + credit
    3. Customer 1 partial payment (EMI)
    4. Customer 1 trade-in with credit adjustment
    5. Sale to Customer 2 with full payment
    6. Sale to Customer 3 with partial payments
    """
    from app.models import MobileBrand, MobileModel
    from app.models.models import MobileCondition, MobileStatus

    try:
        # Get or create iPhone 13 brand and model
        brand = db.query(MobileBrand).filter(MobileBrand.name == "Apple").first()
        if not brand:
            brand = MobileBrand(name="Apple", name_urdu="ایپل")
            db.add(brand)
            db.flush()

        model = db.query(MobileModel).filter(
            MobileModel.model_name == "iPhone 13",
            MobileModel.brand_id == brand.id
        ).first()
        if not model:
            model = MobileModel(
                brand_id=brand.id,
                model_name="iPhone 13",
                sale_price=110000
            )
            db.add(model)
            db.flush()

        # Get or create vendor
        vendor = db.query(Party).filter(Party.phone == "0300-1111111").first()
        if not vendor:
            vendor = Party(
                name="Rehman Traders",
                phone="0300-1111111",
                address="Hall Road, Lahore",
                city="Lahore",
                type="VENDOR",
                is_active=True,
                current_balance=0
            )
            db.add(vendor)
            db.flush()

        # Get or create customers
        customers = {}
        customers_data = [
            {"name": "Ahmed Khan", "phone": "0300-2222222", "address": "Defence, Lahore"},
            {"name": "Ali Raza", "phone": "0300-3333333", "address": "Cantt, Lahore"},
            {"name": "Hassan Ahmed", "phone": "0300-6666666", "address": "F-7, Islamabad"}
        ]

        for cust_data in customers_data:
            cust = db.query(Party).filter(Party.phone == cust_data["phone"]).first()
            if not cust:
                cust = Party(
                    name=cust_data["name"],
                    phone=cust_data["phone"],
                    address=cust_data["address"],
                    city=cust_data["address"].split(",")[1].strip(),
                    type="CUSTOMER",
                    is_active=True,
                    current_balance=0
                )
                db.add(cust)
                db.flush()
            customers[cust_data["name"]] = cust

        # Check if mobile already exists
        existing = db.query(MobileInventory).filter(
            MobileInventory.imei1 == "352001111111111"
        ).first()

        if existing:
            return {
                "status": "success",
                "message": "Credit tracking data already exists",
                "mobile_id": existing.id,
                "mobile_imei": existing.imei1
            }

        # Create the iPhone 13 device
        mobile = MobileInventory(
            model_id=model.id,
            imei1="352001111111111",
            condition=MobileCondition.NEW,
            cost_price=95000,
            sale_price=110000,
            status=MobileStatus.SOLD
        )
        db.add(mobile)
        db.flush()

        # Transaction Timeline
        transactions_data = [
            # 1. Purchase from Vendor (01 Jan 2025)
            {
                "party": vendor,
                "party_type": "VENDOR",
                "type": "PURCHASE",
                "date": date(2025, 1, 1),
                "amount": 95000,
                "notes": "iPhone 13 - 128GB Black - Box Pack (Sealed) - Paid Rs. 50,000, Balance Rs. 45,000"
            },
            # 2. Payment to Vendor (10 Jan 2025)
            {
                "party": vendor,
                "party_type": "VENDOR",
                "type": "PAYMENT_OUT",
                "date": date(2025, 1, 10),
                "amount": 45000,
                "notes": "Full payment to Rehman Traders - Balance cleared ✅"
            },
            # 3. Sale to Ahmed Khan (15 Jan 2025)
            {
                "party": customers["Ahmed Khan"],
                "party_type": "CUSTOMER",
                "type": "SALE",
                "date": date(2025, 1, 15),
                "amount": 110000,
                "notes": "Sold to Ahmed Khan - Rs. 60,000 paid, Rs. 50,000 credit given"
            },
            # 4. Payment from Ahmed Khan (20 Jan 2025)
            {
                "party": customers["Ahmed Khan"],
                "party_type": "CUSTOMER",
                "type": "PAYMENT_IN",
                "date": date(2025, 1, 20),
                "amount": 25000,
                "notes": "Ahmed Khan partial payment - EMI Rs. 25,000 mila"
            },
            # 5. Trade-in from Ahmed Khan (28 Jan 2025)
            {
                "party": customers["Ahmed Khan"],
                "party_type": "CUSTOMER",
                "type": "TRADE_IN",
                "date": date(2025, 1, 28),
                "amount": 85000,
                "notes": "Ahmed Khan ne mobile trade-in kiya - Trade-in value Rs. 85,000, Net credit Rs. 60,000"
            },
            # 6. Sale to Ali Raza (01 Feb 2025)
            {
                "party": customers["Ali Raza"],
                "party_type": "CUSTOMER",
                "type": "SALE",
                "date": date(2025, 2, 1),
                "amount": 80000,
                "notes": "Sold trade-in unit to Ali Raza - Full payment Rs. 80,000 ✅ Condition: Used (Good)"
            }
        ]

        # Create all transactions
        for txn_data in transactions_data:
            txn = Transaction(
                party_id=txn_data["party"].id,
                mobile_id=mobile.id,
                party_type=txn_data["party_type"],
                transaction_type=txn_data["type"],
                quantity=1,
                unit_price=txn_data["amount"],
                total_amount=txn_data["amount"],
                amount=txn_data["amount"],
                transaction_date=txn_data["date"],
                description=txn_data["notes"]
            )
            db.add(txn)

        db.commit()

        return {
            "status": "success",
            "message": "Credit tracking scenario created successfully",
            "mobile_id": mobile.id,
            "mobile_imei": mobile.imei1,
            "mobile_model": "iPhone 13",
            "scenario": "Multi-customer credit tracking with trade-in",
            "transactions": 6,
            "customers": list(customers.keys()),
            "history_url": f"/api/transactions/mobile/{mobile.id}/history"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
