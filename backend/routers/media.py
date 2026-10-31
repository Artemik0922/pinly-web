# Маршруты медиатеки: /api/media* — личное хранилище картинок и внешний
# хостинг (ImgBB).

import sqlite3

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile

from .. import media, ratelimit
from ..deps import current_user
from ..schemas import MediaUrlBody
from ..uploads import MAX_UPLOAD_BYTES

router = APIRouter()
MEDIA_RATE_LIMIT = 60
MEDIA_RATE_WINDOW_S = 3600.0


# Статические пути (/api/media/url, /api/media/external) объявлены раньше
# /api/media/{media_id}: иначе delete съедает их как id.
@router.post("/api/media")
async def media_upload(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(""),
    width: int = Form(0),
    height: int = Form(0),
    user: sqlite3.Row = Depends(current_user),
) -> dict:
    ratelimit.rate_limit(request, "media", limit=MEDIA_RATE_LIMIT, window_s=MEDIA_RATE_WINDOW_S)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    return {"item": media.add_file(user["id"], content, title, width, height, file.filename or "file")}


@router.post("/api/media/url")
async def media_from_url(
    body: MediaUrlBody, request: Request, user: sqlite3.Row = Depends(current_user)
) -> dict:
    ratelimit.rate_limit(request, "media", limit=MEDIA_RATE_LIMIT, window_s=MEDIA_RATE_WINDOW_S)
    return {"item": await media.add_from_url(user["id"], body.url, body.title, body.width, body.height)}


@router.get("/api/media")
def media_list(user: sqlite3.Row = Depends(current_user)) -> dict:
    return {"items": media.list_items(user["id"])}


@router.get("/api/media/external")
def media_external_status() -> dict:
    return {"enabled": media.external_hosting_enabled()}


@router.post("/api/media/external")
async def media_upload_external(
    request: Request,
    file: UploadFile = File(...),
    user: sqlite3.Row = Depends(current_user),
) -> dict:
    """Отправить картинку на ImgBB (бесплатный хостинг, hotlink разрешён).
    Требуется IMGBB_API_KEY в .env.local — ключ выдаётся бесплатно
    на api.imgbb.com. Картинка остаётся на ImgBB, у нас — только ссылка."""
    ratelimit.rate_limit(request, "media", limit=MEDIA_RATE_LIMIT, window_s=MEDIA_RATE_WINDOW_S)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    return {"item": await media.add_external(user["id"], content, file.filename or "")}


@router.delete("/api/media/{media_id}")
def media_delete(media_id: str, user: sqlite3.Row = Depends(current_user)) -> Response:
    media.remove(user["id"], media_id)
    return Response(status_code=204)
