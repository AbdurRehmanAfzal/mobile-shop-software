from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import install_error_handlers
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.auth.router import shops as shops_router
from app.modules.auth.router import staff as staff_router


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="2.0.0",
        description="Bilingual mobile-shop management SaaS for Pakistan (new + used mobiles).",
        docs_url="/docs" if settings.app_env != "prod" else None,
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
    return app


app = create_app()
