from typing import Annotated, Literal

from fastapi import APIRouter, File, Query, UploadFile
from pydantic import BaseModel, Field

from app.core.errors import ValidationFailed
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx
from app.modules.ai import service

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])
MAX_PHOTO = 6 * 1024 * 1024


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=12)
    lang: str = Field(default="ur", pattern="^(en|ur|roman)$")


class ChatOut(BaseModel):
    answer: str
    tools: list[str]
    used_today: int
    limit: int


@router.get("/status")
def status(ctx: Ctx, db: DB):
    return service.status(db, ctx.shop_id)


@router.post("/chat", response_model=ChatOut)
def chat(data: ChatIn, ctx: Ctx, db: DB):
    return service.chat(
        db,
        ctx.shop,
        ctx.can(Cap.VIEW_COST),
        [t.model_dump() for t in data.history],
        data.question,
        data.lang,
    )


@router.post("/read-photo")
async def read_photo(
    ctx: Ctx,
    db: DB,
    file: Annotated[UploadFile, File()],
    kind: str = Query(default="cnic", pattern="^(cnic|imei)$"),
):
    data = await file.read()
    if not data or len(data) > MAX_PHOTO:
        raise ValidationFailed(code="photo_size")
    media = file.content_type or "image/jpeg"
    if media not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        media = "image/jpeg"
    return service.read_photo(db, ctx.shop_id, kind, data, media)
