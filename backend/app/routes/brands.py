"""
API Routes for Brands and Models
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import MobileBrand, MobileModel
from app.schemas import Brand as BrandSchema, BrandCreate, BrandUpdate
from app.schemas import Model as ModelSchema, ModelCreate, ModelUpdate

router = APIRouter(prefix="/api/brands", tags=["brands"])

# ============================================================================
# BRAND ROUTES
# ============================================================================

@router.get("/", response_model=List[BrandSchema])
def get_brands(db: Session = Depends(get_db)):
    """Get all brands"""
    return db.query(MobileBrand).order_by(MobileBrand.name).all()

@router.get("/{brand_id}", response_model=BrandSchema)
def get_brand(brand_id: int, db: Session = Depends(get_db)):
    """Get a specific brand"""
    brand = db.query(MobileBrand).filter(MobileBrand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand

@router.post("/", response_model=BrandSchema)
def create_brand(brand: BrandCreate, db: Session = Depends(get_db)):
    """Create a new brand"""
    existing = db.query(MobileBrand).filter(MobileBrand.name == brand.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Brand already exists")

    db_brand = MobileBrand(**brand.dict())
    db.add(db_brand)
    db.commit()
    db.refresh(db_brand)
    return db_brand

@router.put("/{brand_id}", response_model=BrandSchema)
def update_brand(
    brand_id: int,
    brand_update: BrandUpdate,
    db: Session = Depends(get_db)
):
    """Update brand information"""
    db_brand = db.query(MobileBrand).filter(MobileBrand.id == brand_id).first()
    if not db_brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    update_data = brand_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_brand, field, value)

    db.add(db_brand)
    db.commit()
    db.refresh(db_brand)
    return db_brand

# ============================================================================
# MODEL ROUTES
# ============================================================================

@router.get("/{brand_id}/models", response_model=List[ModelSchema])
def get_brand_models(brand_id: int, db: Session = Depends(get_db)):
    """Get all models for a brand"""
    brand = db.query(MobileBrand).filter(MobileBrand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    return db.query(MobileModel).filter(MobileModel.brand_id == brand_id).order_by(MobileModel.model_name).all()

@router.get("/models", response_model=List[ModelSchema])
def get_models(db: Session = Depends(get_db)):
    """Get all models"""
    return db.query(MobileModel).order_by(MobileModel.model_name).all()

@router.get("/models/{model_id}", response_model=ModelSchema)
def get_model(model_id: int, db: Session = Depends(get_db)):
    """Get a specific model"""
    model = db.query(MobileModel).filter(MobileModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model

@router.post("/models", response_model=ModelSchema)
def create_model(model: ModelCreate, db: Session = Depends(get_db)):
    """Create a new model"""
    brand = db.query(MobileBrand).filter(MobileBrand.id == model.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    db_model = MobileModel(**model.dict())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model

@router.put("/models/{model_id}", response_model=ModelSchema)
def update_model(
    model_id: int,
    model_update: ModelUpdate,
    db: Session = Depends(get_db)
):
    """Update model information"""
    db_model = db.query(MobileModel).filter(MobileModel.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    update_data = model_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_model, field, value)

    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model
