from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import install_error_handlers
from app.modules.accessories.router import router as accessories_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.auth.router import shops as shops_router
from app.modules.auth.router import staff as staff_router
from app.modules.catalogue.router import router as catalogue_router
from app.modules.devices.router import router as devices_router
from app.modules.expenses.router import router as expenses_router
from app.modules.files.router import router as files_router
from app.modules.ledger.router import router as ledger_router
from app.modules.loans.router import router as loans_router
from app.modules.notifications.router import router as notifications_router
from app.modules.parties.router import router as parties_router
from app.modules.payments.router import router as payments_router
from app.modules.purchases.router import router as purchases_router
from app.modules.repairs.router import router as repairs_router
from app.modules.returns.router import router as returns_router
from app.modules.sales.router import router as sales_router
from app.modules.verification.router import router as verification_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Seed the shared catalogue on first run (idempotent). Tests override get_db and skip this.
    if settings.app_env != "test":
        from app.db.session import SessionLocal
        from app.modules.expenses.service import seed_categories
        from app.seeds.catalogue import seed_catalogue

        with SessionLocal() as db:
            added = seed_catalogue(db)
            added["expense_categories"] = seed_categories(db)
            if any(added.values()):
                print(f"Catalogue seeded: {added}")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="2.0.0",
        description="Bilingual mobile-shop management SaaS for Pakistan (new + used mobiles).",
        docs_url="/docs" if settings.app_env != "prod" else None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok", "env": settings.app_env}

    app.include_router(auth_router)
    app.include_router(shops_router)
    app.include_router(staff_router)
    app.include_router(audit_router)
    app.include_router(catalogue_router)
    app.include_router(parties_router)
    app.include_router(ledger_router)
    app.include_router(devices_router)
    app.include_router(verification_router)
    app.include_router(files_router)
    app.include_router(purchases_router)
    app.include_router(sales_router)
    app.include_router(payments_router)
    app.include_router(loans_router)
    app.include_router(returns_router)
    app.include_router(notifications_router)
    app.include_router(expenses_router)
    app.include_router(repairs_router)
    app.include_router(accessories_router)
    return app


app = create_app()
