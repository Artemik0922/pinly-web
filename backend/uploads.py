# Файловое хранилище картинок: web/.data/uploads.
#
# Имя файла всегда генерирует сервер (uuid4 hex + известное расширение),
# наружу файл идёт только через GET /api/uploads/<name>, где тот же формат
# проверяется регуляркой. Удаление чужого/уже ушедшего файла не должно ронять
# запрос — отсюда молчаливый discard.

import re
import uuid
from pathlib import Path

from fastapi import HTTPException

from .db import DATA_DIR
from .images import detect_image_ext

UPLOADS_DIR = DATA_DIR / "uploads"

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# имя файла всегда генерирует сервер: uuid4 hex + известное расширение
FILENAME_RE = re.compile(r"^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$")
EXT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


def new_filename(ext: str) -> str:
    return f"{uuid.uuid4().hex}.{ext}"


def location(name: str) -> Path:
    return UPLOADS_DIR / name


def write(name: str, content: bytes) -> str:
    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        location(name).write_bytes(content)
    except OSError:
        raise HTTPException(500, "could not save file")
    return name


def store_image(content: bytes, source: str = "") -> str:
    """Сохранить картинку, тип которой определён по сигнатуре байтов.

    source — имя файла или URL, он попадает в текст ошибки: по нему быстрее
    понять, откуда прилетел неподписанный мусор.
    """
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file too large (max 10 MB)")
    ext = detect_image_ext(content)
    if ext is None:
        raise HTTPException(
            400,
            f"unsupported file type in {source} (jpg/png/webp)"
            if source
            else "unsupported file type (jpg/png/webp)",
        )
    return write(new_filename(ext), content)


def discard(name: str) -> None:
    """Удалить файл, если он ещё на диске. Мусор не должен копиться, но и
    отсутствующий файл — не ошибка запроса."""
    try:
        location(name).unlink()
    except OSError:
        pass


def exists(name: str) -> bool:
    return location(name).exists()


def basename(url_or_name: str) -> str:
    """/api/uploads/<file> или просто <file> — имя файла из адреса аватара."""
    return url_or_name.rsplit("/", 1)[-1]


def public_url(name: str) -> str:
    return f"/api/uploads/{name}"


def media_type(name: str) -> str:
    """Content-Type по расширению имени: имена генерируем мы, расширение —
    из сигнатуры байтов, так что таблица полная."""
    return EXT_TYPES[name.rsplit(".", 1)[1]]
