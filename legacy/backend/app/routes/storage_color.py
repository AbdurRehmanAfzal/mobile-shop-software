"""
API Routes for Mobile Storage and Color Management
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import MobileStorage, MobileColor

router = APIRouter(prefix="/api/mobile", tags=["storage-color"])

# ============================================================================
# STORAGE MANAGEMENT
# ============================================================================

@router.get("/storages")
def get_all_storages(db: Session = Depends(get_db)):
    """Get all mobile storage options"""
    storages = db.query(MobileStorage).order_by(MobileStorage.name).all()
    return [{"id": s.id, "name": s.name, "name_urdu": s.name_urdu} for s in storages]


@router.post("/storages")
def create_storage(name: str, name_urdu: str = None, db: Session = Depends(get_db)):
    """Create a new storage option"""

    # Check if storage already exists
    existing = db.query(MobileStorage).filter(MobileStorage.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Storage option already exists")

    storage = MobileStorage(name=name, name_urdu=name_urdu)
    db.add(storage)
    db.commit()
    db.refresh(storage)

    return {"id": storage.id, "name": storage.name, "name_urdu": storage.name_urdu}


# ============================================================================
# COLOR MANAGEMENT
# ============================================================================

@router.get("/colors")
def get_all_colors(db: Session = Depends(get_db)):
    """Get all mobile color options"""
    colors = db.query(MobileColor).order_by(MobileColor.name).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "name_urdu": c.name_urdu,
            "hex_code": c.hex_code,
        }
        for c in colors
    ]


@router.post("/colors")
def create_color(
    name: str, name_urdu: str = None, hex_code: str = None, db: Session = Depends(get_db)
):
    """Create a new color option"""

    # Check if color already exists
    existing = db.query(MobileColor).filter(MobileColor.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Color option already exists")

    color = MobileColor(name=name, name_urdu=name_urdu, hex_code=hex_code)
    db.add(color)
    db.commit()
    db.refresh(color)

    return {
        "id": color.id,
        "name": color.name,
        "name_urdu": color.name_urdu,
        "hex_code": color.hex_code,
    }
