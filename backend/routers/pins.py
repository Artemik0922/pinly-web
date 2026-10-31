# Маршруты пинов: /api/pins*, /api/uploads/*, /api/user-pins, /api/saves-count.

import sqlite3

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse

from .. import boards, erasure, pins, ratelimit, uploads
from ..deps import current_user
from ..schemas import PinFromUrlBody, PinUpdateBody

router = APIRouter()

IMMUTABLE_HEADERS = {
    "Cache-Control": "public, max-age=31536000, immutable",
    # содержимое загружает пользователь: запретить браузеру
    # угадывать тип и исполнять его как HTML/SVG
    "X-Content-Type-Options": "nosniff",
}


@router.post("/api/pins")
async def pins_create(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
    category: str = Form(""),
    tags: str = Form(""),
    width: int = Form(800),
    height: int = Form(1200),
    user: sqlite3.Row = Depends(current_user),
) -> dict:
    ratelimit.rate_limit(request, "pin", limit=30, window_s=3600.0)
    content = await file.read(uploads.MAX_UPLOAD_BYTES + 1)
    pin = pins.create(user["id"], content, title, description, category, tags, width, height)
    await pins.vectorize(pin)
    return {"pin": pin}


# статический путь раньше /api/pins/{pin_id}: иначе from-url съедается как id
@router.post("/api/pins/from-url")
async def pins_create_from_url(
    body: PinFromUrlBody, request: Request, user: sqlite3.Row = Depends(current_user)
) -> dict:
    ratelimit.rate_limit(request, "pin", limit=30, window_s=3600.0)
    pin = pins.create_from_url(user["id"], body)
    await pins.vectorize(pin)
    return {"pin": pin}


@router.get("/api/uploads/{name}")
def uploads_get(name: str) -> FileResponse:
    if not uploads.FILENAME_RE.match(name) or not uploads.exists(name):
        raise HTTPException(404, "not found")
    return FileResponse(
        uploads.location(name),
        media_type=uploads.media_type(name),
        headers={**IMMUTABLE_HEADERS, "Content-Disposition": f'inline; filename="{name}"'},
    )


@router.get("/api/user-pins")
def user_pins_list(category: str | None = None, q: str | None = None, limit: int = 6) -> dict:
    page = min(max(limit, 1), 20)
    if q:
        return {"pins": pins.search_user_pins(q, page)}
    return {"pins": pins.recent_user_pins(category, page)}


@router.get("/api/saves-count")
def saves_count(ids: str = "") -> dict:
    """Счётчик сохранений для произвольных пинов (нужен Node-версии
    для SSR страниц Openverse/моков)."""
    wanted = [pin_id.strip() for pin_id in ids.split(",")[:50] if pin_id.strip()]
    return {"counts": boards.save_counts(wanted)}


@router.patch("/api/pins/{pin_id}")
async def pins_update(
    pin_id: str, body: PinUpdateBody, user: sqlite3.Row = Depends(current_user)
) -> dict:
    pin = pins.update(user["id"], pin_id, body)
    await pins.vectorize(pin)  # текст мог измениться
    return {"pin": pin}


@router.delete("/api/pins/{pin_id}")
def pins_delete(pin_id: str, user: sqlite3.Row = Depends(current_user)) -> Response:
    erasure.erase_pin(pins.deletable(user["id"], pin_id))
    return Response(status_code=204)
