"""Bilingual application errors.

Every error the API returns carries a stable `code`, an English and an Urdu message,
so the frontend can show both without its own lookup.
"""

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    status_code = 400
    code = "app_error"
    message_en = "Something went wrong"
    message_ur = "کچھ غلط ہو گیا"

    def __init__(
        self,
        code: str | None = None,
        message_en: str | None = None,
        message_ur: str | None = None,
        status_code: int | None = None,
        details: dict | None = None,
    ):
        self.code = code or self.code
        self.message_en = message_en or self.message_en
        self.message_ur = message_ur or self.message_ur
        self.status_code = status_code or self.status_code
        self.details = details or {}
        super().__init__(self.message_en)

    def to_dict(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message_en": self.message_en,
                "message_ur": self.message_ur,
                "details": self.details,
            }
        }


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    message_en = "Record not found"
    message_ur = "ریکارڈ نہیں ملا"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"
    message_en = "Please log in"
    message_ur = "براہ کرم لاگ اِن کریں"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"
    message_en = "You do not have permission for this action"
    message_ur = "آپ کو اس کام کی اجازت نہیں"


class Conflict(AppError):
    status_code = 409
    code = "conflict"
    message_en = "Record already exists"
    message_ur = "ریکارڈ پہلے سے موجود ہے"


class ValidationFailed(AppError):
    status_code = 422
    code = "validation_failed"
    message_en = "Please check the entered information"
    message_ur = "براہ کرم درج کی گئی معلومات چیک کریں"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_dict())

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        err = ValidationFailed(
            details={"errors": jsonable_encoder(exc.errors(), exclude={"ctx", "url"})}
        )
        return JSONResponse(status_code=err.status_code, content=err.to_dict())
