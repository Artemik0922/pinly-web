# Маршруты пинов: /api/pins*, /api/uploads/*, /api/user-pins, /api/saves-count.

import json
import sqlite3

from anyio import to_thread
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


def declared_sizes(raw: str, count: int) -> list[dict]:
    """Размеры, которые прислал браузер, по порядку файлов.

    Это подсказка, а не истина: битую форму, лишние или недостающие элементы
    сервер молча превращает в нули, а для видео размеры всё равно берёт ffprobe.
    """
    try:
        parsed = json.loads(raw or "[]")
    except ValueError:
        return []
    if not isinstance(parsed, list):
        return []
    sizes: list[dict] = []
    for item in parsed[:count]:
        if not isinstance(item, dict):
            sizes.append({})
            continue
        try:
            sizes.append(
                {"width": int(item.get("width") or 0), "height": int(item.get("height") or 0)}
            )
        except (TypeError, ValueError):
            sizes.append({})
    return sizes


@router.post("/api/pins")
async def pins_create(
    request: Request,
    file: UploadFile | None = File(None),
    files: list[UploadFile] = File(default=[]),
    title: str = Form(""),
    description: str = Form(""),
    category: str = Form(""),
    tags: str = Form(""),
    width: int = Form(800),
    height: int = Form(1200),
    sizes: str = Form(""),
    user: sqlite3.Row = Depends(current_user),
) -> dict:
    """Создать пин: один файл — как раньше, несколько — перелистываемые слайды,
    и среди них может быть видео.

    Поле `file` осталось на месте: старые клиенты шлют именно его, и ответ для
    них не меняется. `files` рядом — порядок слайдов = порядок частей формы.
    Файл читается частями в файл: видео на 60 МБ не должно ложиться в память
    единственного воркера.
    """
    ratelimit.rate_limit(request, "pin", limit=30, window_s=3600.0)
    chosen = [item for item in files if item is not None and item.filename] or (
        [file] if file is not None and file.filename else []
    )
    if not chosen:
        # тот же 422, что давала валидация FastAPI, когда file был обязателен
        raise HTTPException(422, "file required")
    names = [await uploads.save_upload(item) for item in chosen]
    per_file = declared_sizes(sizes, len(names)) or [{"width": width, "height": height}]
    try:
        # ffprobe и ffmpeg — внешние процессы на доли секунды: в единственном
        # воркере они встали бы поперёк всех остальных запросов, поэтому уводим
        # сборку пина в поток.
        pin = await to_thread.run_sync(
            lambda: pins.create_media(user["id"], names, per_file, title, description, category, tags)
        )
    except HTTPException:
        # пин не завёлся — файлы не должны остаться сиротами на диске
        for name in names:
            uploads.discard(name)
        raise
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
    """Отдать файл хранилища.

    Диапазон по байтам нужен видео: без `Range` плеер не умеет перемотку, а
    Safari отказывается играть ролик вовсе. Разбирает его сама Starlette
    (FileResponse): валидный кусок → 206, неудовлетворительный → 416, битый
    заголовок → 400. Свою парилку диапазона выводим только вместе с Accept-Ranges.
    """
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
