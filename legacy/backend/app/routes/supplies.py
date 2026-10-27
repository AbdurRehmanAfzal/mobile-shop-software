"""
API Routes for Supplies (Purchase from Vendors/Suppliers)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List
from datetime import datetime

from app.database import get_db
from app.models import Supply, SupplyItem, Party

router = APIRouter(prefix="/api/supplies", tags=["supplies"])

# ============================================================================
# GET ALL SUPPLIES (VENDOR PURCHASES)
# ============================================================================
@router.get("/")
def get_all_supplies(db: Session = Depends(get_db)):
    """Get all supplies/purchases"""
    supplies = db.query(Supply).order_by(Supply.created_at.desc()).all()

    # Enrich with party details
    result = []
    for supply in supplies:
        party = db.query(Party).filter(Party.id == supply.party_id).first()
        result.append({
            "id": supply.id,
            "party_id": supply.party_id,
            "party_name": party.name if party else "Unknown",
            "party_type": party.type if party else None,
            "total_amount": supply.total_amount,
            "amount_paid": supply.amount_paid,
            "credit_amount": supply.credit_amount,
            "payment_status": supply.payment_status,
            "is_completed": supply.is_completed,
            "created_at": supply.created_at,
            "updated_at": supply.updated_at,
            "item_count": len(supply.items) if supply.items else 0,
        })

    return result


# ============================================================================
# GET SUPPLIES BY VENDOR (VENDOR LEDGER)
# ============================================================================
@router.get("/vendor/{vendor_id}")
def get_vendor_supplies(vendor_id: int, db: Session = Depends(get_db)):
    """Get all supplies from a specific vendor with balance details"""

    # Verify vendor exists
    vendor = db.query(Party).filter(Party.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Get all supplies from this vendor
    supplies = db.query(Supply).filter(Supply.party_id == vendor_id).order_by(Supply.created_at.desc()).all()

    # Calculate totals
    total_amount = 0
    total_paid = 0
    total_credit = 0

    supplies_list = []
    for supply in supplies:
        total_amount += supply.total_amount
        total_paid += supply.amount_paid
        total_credit += supply.credit_amount

        supplies_list.append({
            "id": supply.id,
            "created_at": supply.created_at,
            "total_amount": supply.total_amount,
            "amount_paid": supply.amount_paid,
            "credit_amount": supply.credit_amount,
            "payment_status": supply.payment_status,
            "is_completed": supply.is_completed,
            "item_count": len(supply.items) if supply.items else 0,
            "items": [
                {
                    "item_type": item.item_type,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "total_price": item.total_price,
                } for item in supply.items
            ] if supply.items else [],
        })

    return {
        "vendor_id": vendor_id,
        "vendor_name": vendor.name,
        "vendor_phone": vendor.phone,
        "vendor_type": vendor.type,
        "total_amount": total_amount,
        "total_paid": total_paid,
        "total_credit": total_credit,
        "outstanding_balance": total_credit,
        "supplies_count": len(supplies),
        "supplies": supplies_list,
    }


# ============================================================================
# GET OUTSTANDING BALANCE SUMMARY
# ============================================================================
@router.get("/outstanding/summary")
def get_outstanding_summary(db: Session = Depends(get_db)):
    """Get summary of all outstanding balances"""

    # Get all supplies with credit balance > 0
    supplies = db.query(Supply).filter(Supply.credit_amount > 0).all()

    # Group by vendor
    vendor_summary = {}
    for supply in supplies:
        if supply.party_id not in vendor_summary:
            party = db.query(Party).filter(Party.id == supply.party_id).first()
            vendor_summary[supply.party_id] = {
                "vendor_id": supply.party_id,
                "vendor_name": party.name if party else "Unknown",
                "vendor_phone": party.phone if party else None,
                "vendor_type": party.type if party else None,
                "total_credit": 0,
                "supply_count": 0,
            }

        vendor_summary[supply.party_id]["total_credit"] += supply.credit_amount
        vendor_summary[supply.party_id]["supply_count"] += 1

    # Sort by total credit descending
    sorted_vendors = sorted(
        vendor_summary.values(),
        key=lambda x: x["total_credit"],
        reverse=True
    )

    total_outstanding = sum(v["total_credit"] for v in sorted_vendors)

    return {
        "total_outstanding": total_outstanding,
        "vendor_count": len(sorted_vendors),
        "vendors": sorted_vendors,
    }


# ============================================================================
# GET SINGLE SUPPLY DETAILS
# ============================================================================
@router.get("/{supply_id}")
def get_supply_details(supply_id: int, db: Session = Depends(get_db)):
    """Get detailed information about a specific supply"""

    supply = db.query(Supply).filter(Supply.id == supply_id).first()
    if not supply:
        raise HTTPException(status_code=404, detail="Supply not found")

    party = db.query(Party).filter(Party.id == supply.party_id).first()

    return {
        "id": supply.id,
        "party_id": supply.party_id,
        "party_name": party.name if party else "Unknown",
        "party_phone": party.phone if party else None,
        "party_type": party.type if party else None,
        "total_amount": supply.total_amount,
        "amount_paid": supply.amount_paid,
        "credit_amount": supply.credit_amount,
        "payment_status": supply.payment_status,
        "is_completed": supply.is_completed,
        "created_at": supply.created_at,
        "updated_at": supply.updated_at,
        "items": [
            {
                "id": item.id,
                "item_type": item.item_type,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total_price": item.total_price,
            } for item in supply.items
        ] if supply.items else [],
    }


# ============================================================================
# RECORD PAYMENT AGAINST SUPPLY
# ============================================================================
@router.post("/{supply_id}/payment")
def record_payment(
    supply_id: int,
    payment_data: dict,
    db: Session = Depends(get_db)
):
    """Record a payment against a supply/purchase"""

    supply = db.query(Supply).filter(Supply.id == supply_id).first()
    if not supply:
        raise HTTPException(status_code=404, detail="Supply not found")

    payment_amount = payment_data.get("payment_amount", 0)
    payment_method = payment_data.get("payment_method", "cash")
    notes = payment_data.get("notes", "")

    if payment_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")

    if payment_amount > supply.credit_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount ({payment_amount}) exceeds outstanding balance ({supply.credit_amount})"
        )

    # Update supply
    supply.amount_paid += payment_amount
    supply.credit_amount -= payment_amount

    # Update payment status
    if supply.credit_amount == 0:
        supply.payment_status = "completed"
        supply.is_completed = True
    elif supply.amount_paid > 0 and supply.credit_amount > 0:
        supply.payment_status = "partial"

    supply.updated_at = datetime.utcnow()

    db.add(supply)
    db.commit()
    db.refresh(supply)

    return {
        "status": "success",
        "message": f"Payment of {payment_amount} recorded successfully",
        "supply_id": supply.id,
        "amount_paid": supply.amount_paid,
        "credit_amount": supply.credit_amount,
        "payment_status": supply.payment_status,
    }


# ============================================================================
# GET RECENT SUPPLIES
# ============================================================================
@router.get("/recent/purchases")
def get_recent_supplies(limit: int = 10, db: Session = Depends(get_db)):
    """Get recent supplies/purchases"""

    supplies = db.query(Supply).order_by(Supply.created_at.desc()).limit(limit).all()

    result = []
    for supply in supplies:
        party = db.query(Party).filter(Party.id == supply.party_id).first()
        result.append({
            "id": supply.id,
            "party_name": party.name if party else "Unknown",
            "total_amount": supply.total_amount,
            "credit_amount": supply.credit_amount,
            "payment_status": supply.payment_status,
            "created_at": supply.created_at,
        })

    return result
