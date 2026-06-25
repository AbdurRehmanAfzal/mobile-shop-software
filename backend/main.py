from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db, get_db
from app.config import settings
from app.utils.seed_data import seed_brands_and_models, seed_storages_and_colors
from app.routes import brands, parties, inventory, transactions, supplies, storage_color

# Initialize FastAPI app
app = FastAPI(
    title="Mobile Shop Management System",
    description="Bilingual mobile phone shop management system for Pakistani shops",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    """Initialize database tables on app startup"""
    init_db()
    seed_brands_and_models()
    seed_storages_and_colors()
    print(f"🚀 Mobile Shop Management System started!")
    print(f"📱 Shop: {settings.shop_name}")
    print(f"📍 City: {settings.shop_city}")
    print(f"📞 Phone: {settings.shop_phone}")

@app.on_event("shutdown")
def shutdown_event():
    """Cleanup on app shutdown"""
    print("🛑 Mobile Shop Management System shutting down...")

# Health check endpoint
@app.get("/")
def read_root():
    return {
        "message": "Mobile Shop Management System API",
        "shop": settings.shop_name,
        "city": settings.shop_city,
        "status": "running"
    }

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected"
    }

# Register API routers
app.include_router(brands.router)
app.include_router(parties.router)
app.include_router(inventory.router)
app.include_router(transactions.router)
app.include_router(supplies.router)
app.include_router(storage_color.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_debug,
    )
