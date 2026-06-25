"""
API Routes for Parties (Customers & Suppliers)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app.models import Party
from app.schemas import Party as PartySchema, PartyCreate, PartyUpdate, PartyTypeEnum

router = APIRouter(prefix="/api/parties", tags=["parties"])

# ============================================================================
# CREATE PARTY (Customer or Supplier)
# ============================================================================
@router.post("/", response_model=PartySchema)
def create_party(party: PartyCreate, db: Session = Depends(get_db)):
    """Create a new customer or supplier"""
    
    # Check if phone already exists
    existing = db.query(Party).filter(Party.phone == party.phone).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Phone number {party.phone} already registered"
        )
    
    db_party = Party(
        name=party.name,
        phone=party.phone,
        cnic=party.cnic,
        address=party.address,
        type=party.type.value,
        is_active=party.is_active
    )
    db.add(db_party)
    db.commit()
    db.refresh(db_party)
    return db_party

# ============================================================================
# GET ALL PARTIES (with optional filtering by type)
# ============================================================================
@router.get("/", response_model=List[PartySchema])
def get_parties(
    party_type: str = None,
    is_active: bool = True,
    db: Session = Depends(get_db)
):
    """Get all parties (customers, suppliers, or both)"""
    query = db.query(Party).filter(Party.is_active == is_active)
    
    if party_type:
        if party_type.upper() not in ["CUSTOMER", "VENDOR", "TRADE_IN"]:
            raise HTTPException(
                status_code=400,
                detail="party_type must be CUSTOMER, VENDOR, or TRADE_IN"
            )
        query = query.filter(Party.type == party_type.upper())
    
    return query.order_by(Party.name).all()

# ============================================================================
# GET CUSTOMERS
# ============================================================================
@router.get("/customers", response_model=List[PartySchema])
def get_customers(db: Session = Depends(get_db)):
    """Get all customers"""
    return db.query(Party).filter(
        Party.type == "CUSTOMER",
        Party.is_active == True
    ).order_by(Party.name).all()

# ============================================================================
# GET SUPPLIERS
# ============================================================================
@router.get("/suppliers", response_model=List[PartySchema])
def get_suppliers(db: Session = Depends(get_db)):
    """Get all suppliers (VENDOR and TRADE_IN)"""
    return db.query(Party).filter(
        Party.type.in_(["VENDOR", "TRADE_IN"]),
        Party.is_active == True
    ).order_by(Party.name).all()

# ============================================================================
# GET SINGLE PARTY
# ============================================================================
@router.get("/{party_id}", response_model=PartySchema)
def get_party(party_id: int, db: Session = Depends(get_db)):
    """Get a specific party by ID"""
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    return party

# ============================================================================
# SEARCH PARTY BY PHONE
# ============================================================================
@router.get("/search/phone/{phone}", response_model=PartySchema)
def search_by_phone(phone: str, db: Session = Depends(get_db)):
    """Search party by phone number"""
    party = db.query(Party).filter(Party.phone == phone).first()
    if not party:
        raise HTTPException(status_code=404, detail="No party found with this phone")
    return party

# ============================================================================
# UPDATE PARTY
# ============================================================================
@router.put("/{party_id}", response_model=PartySchema)
def update_party(
    party_id: int,
    party_update: PartyUpdate,
    db: Session = Depends(get_db)
):
    """Update party information"""
    db_party = db.query(Party).filter(Party.id == party_id).first()
    if not db_party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    # Check if new phone already exists (if phone is being updated)
    if party_update.phone and party_update.phone != db_party.phone:
        existing = db.query(Party).filter(Party.phone == party_update.phone).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Phone number {party_update.phone} already registered"
            )
    
    update_data = party_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_party, field, value)
    
    db_party.updated_at = datetime.utcnow()
    db.add(db_party)
    db.commit()
    db.refresh(db_party)
    return db_party

# ============================================================================
# DEACTIVATE PARTY
# ============================================================================
@router.patch("/{party_id}/deactivate")
def deactivate_party(party_id: int, db: Session = Depends(get_db)):
    """Deactivate a party (soft delete)"""
    db_party = db.query(Party).filter(Party.id == party_id).first()
    if not db_party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    db_party.is_active = False
    db_party.updated_at = datetime.utcnow()
    db.add(db_party)
    db.commit()
    db.refresh(db_party)
    
    return {
        "status": "success",
        "message": f"{db_party.name} has been deactivated",
        "party": db_party
    }

# ============================================================================
# GET PARTY WITH BALANCE SUMMARY
# ============================================================================
@router.get("/{party_id}/balance")
def get_party_balance(party_id: int, db: Session = Depends(get_db)):
    """Get party balance summary"""
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    balance_status = "CLEAR" if party.current_balance == 0 else (
        "OWES US" if party.type == "CUSTOMER" and party.current_balance > 0 else (
            "WE OWE" if party.type == "SUPPLIER" and party.current_balance > 0 else "ERROR"
        )
    )
    
    return {
        "party_id": party.id,
        "name": party.name,
        "phone": party.phone,
        "type": party.type,
        "current_balance": party.current_balance,
        "balance_status": balance_status,
        "updated_at": party.updated_at
    }
