from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import install_error_handlers
from app.modules.accessories.router import router as accessories_router
from app.modules.admin.fees_router import router as fees_router
from app.modules.admin.router import router as admin_router
from app.modules.ai.router import router as ai_router
from app.modules.attendance.router import activity_router as staff_activity_router
from app.modules.attendance.router import router as attendance_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.auth.router import shops as shops_router
from app.modules.auth.router import staff as staff_router
from app.modules.bulk.router import router as bulk_router
from app.modules.catalogue.router import router as catalogue_router
from app.modules.devices.router import router as devices_router
from app.modules.exchanges.router import router as exchanges_router
from app.modules.expenses.router import router as expenses_router
from app.modules.exports.router import router as exports_router
from app.modules.files.router import router as files_router
from app.modules.installments.router import router as installments_router
from app.modules.invoices.router import router as invoices_router
from app.modules.labels.router import router as labels_router
from app.modules.ledger.router import router as ledger_router
from app.modules.loans.router import router as loans_router
from app.modules.notifications.router import router as notifications_router
from app.modules.otp.router import router as otp_router
from app.modules.parties.router import router as parties_router
from app.modules.payments.router import router as payments_router
from app.modules.public.router import router as public_router
from app.modules.purchases.router import router as purchases_router
from app.modules.repairs.router import router as repairs_router
from app.modules.reports.router import router as reports_router
from app.modules.returns.router import router as returns_router
from app.modules.sales.router import router as sales_router
from app.modules.shopaudit.router import router as shopaudit_router
from app.modules.units.router import router as units_router
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
    from app.modules.notifications import scheduler

    task = scheduler.start()
    yield
    if task:
        task.cancel()


def check_production_settings() -> None:
    """Refuse to run in production with development secrets."""
    if settings.app_env == "prod" and (
        settings.secret_key in ("dev-secret-change-me", "change-me-to-a-long-random-string")
        or len(settings.secret_key) < 32
    ):
        raise RuntimeError(
            "SECRET_KEY must be set to a random value of at least 32 characters in production"
        )


def _mount_web(app: FastAPI, web_dir: str) -> None:
    """The one-PC install: the built React app from `web_dir`, with every non-API path falling
    back to index.html so the app's own routes work on reload."""
    from pathlib import Path

    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    root = Path(web_dir)
    index = root / "index.html"
    if not index.is_file():
        return
    assets = root / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def web(path: str):
        candidate = (root / path).resolve() if path else index
        if path and candidate.is_file() and root.resolve() in candidate.parents:
            return FileResponse(str(candidate))
        return FileResponse(str(index))


def create_app() -> FastAPI:
    check_production_settings()
    app = FastAPI(
        title=settings.app_name,
        version="2.0.0",
        description="Bilingual mobile-shop management SaaS for Pakistan (new + used mobiles).",
        docs_url="/docs" if settings.app_env != "prod" else None,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def autoprint(request: Request, call_next):
        """`?autoprint=1` on a print page (receipt, declaration, job sheet, report "PDF") opens the
        print dialog as soon as it loads; used when the Android app opens it in Chrome."""
        response = await call_next(request)
        if request.query_params.get("autoprint") != "1" or not response.headers.get(
            "content-type", ""
        ).startswith("text/html"):
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])
        script = b"<script>addEventListener('load',()=>setTimeout(()=>print(),500))</script>"
        body = (
            body.replace(b"</body>", script + b"</body>", 1)
            if b"</body>" in body
            else body + script
        )
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        return Response(body, status_code=response.status_code, headers=headers)

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
    app.include_router(admin_router)
    app.include_router(fees_router)
    app.include_router(public_router)
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
    app.include_router(exchanges_router)
    app.include_router(reports_router)
    app.include_router(exports_router)
    app.include_router(invoices_router)
    app.include_router(installments_router)
    app.include_router(units_router)
    app.include_router(shopaudit_router)
    app.include_router(bulk_router)
    app.include_router(ai_router)
    app.include_router(otp_router)
    app.include_router(labels_router)
    app.include_router(attendance_router)
    app.include_router(staff_activity_router)
    if settings.web_dir:
        _mount_web(app, settings.web_dir)
    return app


app = create_app()
