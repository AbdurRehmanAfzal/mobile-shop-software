"""
API Routes for Inventory (Mobile & Accessories)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models import MobileInventory, Accessory, MobileModel, Party
from app.schemas import (
    MobileInventoryResponse as MobileInventorySchema,
    MobileInventoryCreate,
    MobileInventoryUpdate,
    AccessoryResponse as AccessorySchema,
    AccessoryCreate,
    AccessoryUpdate
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

# ============================================================================
# MOBILE INVENTORY ROUTES
# ============================================================================

@router.post("/mobiles", response_model=MobileInventorySchema)
def add_mobile(mobile: MobileInventoryCreate, db: Session = Depends(get_db)):
    """Add a new mobile to inventory"""

    # Verify model exists
    model = db.query(MobileModel).filter(MobileModel.id == mobile.model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Check IMEI1 uniqueness if provided (IMEI1 is primary identifier)
    if mobile.imei1:
        existing = db.query(MobileInventory).filter(
            MobileInventory.imei1 == mobile.imei1
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="IMEI1 already exists")

    # Check IMEI2 uniqueness if provided
    if mobile.imei2:
        existing = db.query(MobileInventory).filter(
            MobileInventory.imei2 == mobile.imei2
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="IMEI2 already exists")

    # Check IMEI3 uniqueness if provided
    if mobile.imei3:
        existing = db.query(MobileInventory).filter(
            MobileInventory.imei3 == mobile.imei3
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="IMEI3 already exists")

    db_mobile = MobileInventory(**mobile.dict())
    db.add(db_mobile)
    db.commit()
    db.refresh(db_mobile)
    return db_mobile

@router.get("/mobiles", response_model=List[MobileInventorySchema])
def get_mobiles(
    status: Optional[str] = "IN_STOCK",
    condition: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get mobiles with optional filtering"""
    query = db.query(MobileInventory)
    
    if status:
        query = query.filter(MobileInventory.status == status)
    if condition:
        query = query.filter(MobileInventory.condition == condition)
    
    return query.order_by(MobileInventory.created_at.desc()).all()

@router.get("/mobiles/{mobile_id}", response_model=MobileInventorySchema)
def get_mobile(mobile_id: int, db: Session = Depends(get_db)):
    """Get a specific mobile"""
    mobile = db.query(MobileInventory).filter(MobileInventory.id == mobile_id).first()
    if not mobile:
        raise HTTPException(status_code=404, detail="Mobile not found")
    return mobile

@router.put("/mobiles/{mobile_id}", response_model=MobileInventorySchema)
def update_mobile(
    mobile_id: int,
    mobile_update: MobileInventoryUpdate,
    db: Session = Depends(get_db)
):
    """Update mobile information"""
    db_mobile = db.query(MobileInventory).filter(MobileInventory.id == mobile_id).first()
    if not db_mobile:
        raise HTTPException(status_code=404, detail="Mobile not found")
    
    update_data = mobile_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_mobile, field, value)
    
    db.add(db_mobile)
    db.commit()
    db.refresh(db_mobile)
    return db_mobile

@router.get("/mobiles/search/imei/{imei}", response_model=MobileInventorySchema)
def search_by_imei(imei: str, db: Session = Depends(get_db)):
    """Search mobile by IMEI"""
    mobile = db.query(MobileInventory).filter(MobileInventory.imei == imei).first()
    if not mobile:
        raise HTTPException(status_code=404, detail="Mobile not found")
    return mobile

# ============================================================================
# ACCESSORIES INVENTORY ROUTES
# ============================================================================

@router.post("/accessories", response_model=AccessorySchema)
def add_accessory(
    accessory: AccessoryCreate,
    db: Session = Depends(get_db)
):
    """Add an accessory to inventory"""
    
    # Verify vendor exists
    vendor = db.query(Party).filter(Party.id == accessory.source_party_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    # Verify mobile exists if provided
    if accessory.mobile_id:
        mobile = db.query(MobileInventory).filter(
            MobileInventory.id == accessory.mobile_id
        ).first()
        if not mobile:
            raise HTTPException(status_code=404, detail="Mobile not found")
    
    db_accessory = Accessory(**accessory.dict())
    db.add(db_accessory)
    db.commit()
    db.refresh(db_accessory)
    return db_accessory

@router.get("/accessories", response_model=List[AccessorySchema])
def get_accessories(
    status: Optional[str] = None,
    accessory_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get accessories with optional filtering"""
    query = db.query(Accessory)
    
    if status:
        query = query.filter(Accessory.status == status)
    if accessory_type:
        query = query.filter(Accessory.type == accessory_type)
    
    return query.order_by(Accessory.created_at.desc()).all()

@router.get("/accessories/{accessory_id}", response_model=AccessorySchema)
def get_accessory(accessory_id: int, db: Session = Depends(get_db)):
    """Get a specific accessory"""
    accessory = db.query(Accessory).filter(
        Accessory.id == accessory_id
    ).first()
    if not accessory:
        raise HTTPException(status_code=404, detail="Accessory not found")
    return accessory

@router.put("/accessories/{accessory_id}", response_model=AccessorySchema)
def update_accessory(
    accessory_id: int,
    accessory_update: AccessoryUpdate,
    db: Session = Depends(get_db)
):
    """Update accessory information"""
    db_accessory = db.query(Accessory).filter(
        Accessory.id == accessory_id
    ).first()
    if not db_accessory:
        raise HTTPException(status_code=404, detail="Accessory not found")
    
    update_data = accessory_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_accessory, field, value)
    
    db.add(db_accessory)
    db.commit()
    db.refresh(db_accessory)
    return db_accessory

@router.get("/accessories/mobile/{mobile_id}", response_model=List[AccessorySchema])
def get_mobile_accessories(mobile_id: int, db: Session = Depends(get_db)):
    """Get all accessories for a specific mobile"""
    return db.query(Accessory).filter(
        Accessory.mobile_id == mobile_id
    ).all()

# ============================================================================
# INVENTORY STATISTICS
# ============================================================================

@router.get("/stats/summary")
def get_inventory_stats(db: Session = Depends(get_db)):
    """Get inventory summary statistics"""
    
    total_stock = db.query(func.count(MobileInventory.id)).scalar()
    by_status = db.query(
        MobileInventory.status,
        func.count(MobileInventory.id)
    ).group_by(MobileInventory.status).all()
    
    by_condition = db.query(
        MobileInventory.condition,
        func.count(MobileInventory.id)
    ).group_by(MobileInventory.condition).all()
    
    total_cost = db.query(func.sum(MobileInventory.cost_price)).filter(
        MobileInventory.status.in_(["IN_STOCK", "RESERVED"])
    ).scalar() or 0
    
    return {
        "total_in_stock": db.query(func.count(MobileInventory.id)).filter(
            MobileInventory.status == "IN_STOCK"
        ).scalar(),
        "total_sold": db.query(func.count(MobileInventory.id)).filter(
            MobileInventory.status == "SOLD"
        ).scalar(),
        "total_reserved": db.query(func.count(MobileInventory.id)).filter(
            MobileInventory.status == "RESERVED"
        ).scalar(),
        "total_trade_in": db.query(func.count(MobileInventory.id)).filter(
            MobileInventory.status == "TRADE_IN"
        ).scalar(),
        "by_status": {status: count for status, count in by_status},
        "by_condition": {condition: count for condition, count in by_condition},
        "inventory_value": float(total_cost)
    }

@router.get("/stats/pending-accessories")
def get_pending_accessories(db: Session = Depends(get_db)):
    """Get all pending accessories (vendor or customer)"""
    pending = db.query(Accessory).filter(
        Accessory.status.in_(["PENDING_VENDOR", "PENDING_CUSTOMER"])
    ).all()
    
    vendor_pending = [a for a in pending if a.status == "PENDING_VENDOR"]
    customer_pending = [a for a in pending if a.status == "PENDING_CUSTOMER"]
    
    return {
        "total_pending": len(pending),
        "pending_from_vendor": len(vendor_pending),
        "pending_from_customer": len(customer_pending),
        "vendor_pending_items": vendor_pending,
        "customer_pending_items": customer_pending
    }

@router.get("/stats/low-stock")
def get_low_stock(min_count: int = 5, db: Session = Depends(get_db)):
    """Get brands/models with low stock"""
    from app.models import MobileBrand

    low_stock = db.query(
        MobileBrand.name,
        MobileModel.name,
        func.count(MobileInventory.id).label("count")
    ).join(
        MobileModel, MobileBrand.id == MobileModel.brand_id
    ).join(
        MobileInventory, MobileModel.id == MobileInventory.model_id
    ).filter(
        MobileInventory.status == "IN_STOCK"
    ).group_by(
        MobileBrand.name, MobileModel.name
    ).having(
        func.count(MobileInventory.id) < min_count
    ).all()

    return {
        "low_stock_items": [
            {"brand": brand, "model": model, "count": count}
            for brand, model, count in low_stock
        ],
        "threshold": min_count
    }
