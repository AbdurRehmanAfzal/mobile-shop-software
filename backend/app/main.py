from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import install_error_handlers
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.auth.router import shops as shops_router
from app.modules.auth.router import staff as staff_router
from app.modules.catalogue.router import router as catalogue_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Seed the shared catalogue on first run (idempotent). Tests override get_db and skip this.
    if settings.app_env != "test":
        from app.db.session import SessionLocal
        from app.seeds.catalogue import seed_catalogue

        with SessionLocal() as db:
            added = seed_catalogue(db)
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
    return app


app = create_app()
