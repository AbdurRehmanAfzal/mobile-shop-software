from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.tenancy import Ctx
from app.modules.files import service

router = APIRouter(prefix="/api/v1/files", tags=["files"])


class FileOut(BaseModel):
    path: str


@router.post("", response_model=FileOut, status_code=201)
async def upload(
    ctx: Ctx,
    file: Annotated[UploadFile, File()],
    purpose: str = Query(default="misc", pattern=r"^[a-z_]{1,30}$"),
):
    data = await file.read()
    return {"path": service.save(ctx.shop_id, file.content_type or "", data, purpose)}


@router.get("/{path:path}")
def download(path: str, ctx: Ctx):
    return FileResponse(service.resolve(ctx.shop_id, path))
