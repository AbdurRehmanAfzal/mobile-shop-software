"""Bulk Excel: template → fill → preview → import, plus an export in the same layout.
Owner and manager only (the sheets carry cost prices)."""

import csv
import datetime as dt
import io
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response

from app.core.errors import NotFound
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.bulk import service, template
from app.modules.bulk.parse import read_rows
from app.modules.bulk.spec import COLUMNS, KINDS

router = APIRouter(prefix="/api/v1/bulk", tags=["bulk"])
Managers = Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))]
Lang = Annotated[str | None, Query(pattern="^(en|ur)$")]
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _kind(kind: str) -> str:
    if kind not in KINDS:
        raise NotFound(code="bulk_kind_unknown")
    return kind


@router.get("/kinds")
def kinds(ctx: Managers, lang: Lang = None):
    """What can be imported, with the columns (the screen draws its cards from this)."""
    return [
        {
            "kind": k,
            "columns": [
                {
                    "key": c.key,
                    "label": c.ur if lang == "ur" else c.en,
                    "required": c.required,
                    "help": c.help_ur if lang == "ur" else c.help_en,
                }
                for c in COLUMNS[k]
            ],
        }
        for k in KINDS
    ]


@router.get("/template/{kind}")
def download_template(kind: str, ctx: Managers, db: DB, lang: Lang = None):
    kind = _kind(kind)
    data = template.build(db, ctx.shop_id, kind, lang)
    return Response(
        content=data,
        media_type=XLSX,
        headers={"Content-Disposition": f'attachment; filename="{template.filename(kind)}"'},
    )


@router.get("/export/{kind}")
def export(
    kind: str, ctx: Managers, db: DB, lang: Lang = None, format: Literal["xlsx", "csv"] = "xlsx"
):
    kind = _kind(kind)
    rows = service.export_rows(db, ctx, kind, lang)
    if format == "csv":
        buf = io.StringIO()
        buf.write("﻿")
        w = csv.writer(buf)
        w.writerow([(c.ur if lang == "ur" else c.en) for c in COLUMNS[kind]])
        w.writerows(rows)
        name = template.filename(kind, export=True).replace(".xlsx", ".csv")
        return Response(
            content=buf.getvalue().encode("utf-8"),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )
    data = template.build(db, ctx.shop_id, kind, lang, rows=rows)
    return Response(
        content=data,
        media_type=XLSX,
        headers={
            "Content-Disposition": f'attachment; filename="{template.filename(kind, export=True)}"'
        },
    )


async def _read(kind: str, file: UploadFile) -> tuple[list[dict], bytes]:
    data = await file.read()
    return read_rows(kind, data, file.filename), data


def _flag(v: str | None, default: bool) -> bool:
    """a multipart field left out means the default; "true" / "1" / "yes" / "on" mean yes"""
    if v is None or v == "":
        return default
    return v.strip().lower() in ("true", "1", "yes", "on")


def _flag(v: str | None, default: bool) -> bool:
    """a multipart field left out means the default; "true" / "1" / "yes" / "on" mean yes"""
    if v is None or v == "":
        return default
    return v.strip().lower() in ("true", "1", "yes", "on")


def _flag(v: str | None, default: bool) -> bool:
    """a multipart field left out means the default; "true" / "1" / "yes" / "on" mean yes"""
    if v is None or v == "":
        return default
    return v.strip().lower() in ("true", "1", "yes", "on")


def _opts(create_catalogue, skip_errors, allow_below_cost) -> service.Options:
    return service.Options(
        create_catalogue=_flag(create_catalogue, True),
        skip_errors=_flag(skip_errors, False),
        allow_below_cost=_flag(allow_below_cost, False),
    )


@router.post("/preview/{kind}")
async def preview(
    kind: str,
    ctx: Managers,
    db: DB,
    file: Annotated[UploadFile, File()],
    lang: Lang = None,
    create_catalogue: Annotated[str | None, Form()] = None,
    skip_errors: Annotated[str | None, Form()] = None,
    allow_below_cost: Annotated[str | None, Form()] = None,
):
    """Checks every row and writes nothing."""
    kind = _kind(kind)
    rows, data = await _read(kind, file)
    out = service.preview(
        db,
        ctx,
        kind,
        rows,
        lang,
        _opts(create_catalogue, skip_errors, allow_below_cost),
        file_name=file.filename,
        sha=service.sha256(data),
    )
    out.pop("_results", None)
    db.rollback()  # lookups only; make sure nothing a service flushed stays
    return out


@router.post("/import/{kind}", status_code=201)
async def run_import(
    kind: str,
    ctx: Managers,
    db: DB,
    file: Annotated[UploadFile, File()],
    lang: Lang = None,
    create_catalogue: Annotated[str | None, Form()] = None,
    skip_errors: Annotated[str | None, Form()] = None,
    allow_below_cost: Annotated[str | None, Form()] = None,
):
    """All-or-nothing: either every good row is saved, or nothing is."""
    kind = _kind(kind)
    rows, data = await _read(kind, file)
    return service.run_import(
        db,
        ctx,
        kind,
        rows,
        lang,
        _opts(create_catalogue, skip_errors, allow_below_cost),
        file_name=file.filename,
        sha=service.sha256(data),
    )


@router.get("/imports")
def imports(ctx: Managers, db: DB, limit: int = Query(20, ge=1, le=100)):
    return service.list_imports(db, ctx.shop_id, limit)


def _today() -> str:
    return dt.date.today().isoformat()
