# Файловое хранилище картинок и видео: web/.data/uploads.
#
# Имя файла всегда генерирует сервер (uuid4 hex + известное расширение),
# наружу файл идёт только через GET /api/uploads/<name>, где тот же формат
# проверяется регуляркой. Удаление чужого/уже ушедшего файла не должно ронять
# запрос — отсюда молчаливый discard.
#
# Видео меняет два правила: у него свой потолок размера (60 МБ вместо 10 МБ),
# и его нельзя читать в память whole-file — поэтому save_upload пишет частями
# и снимает файл, если упёрся в потолок или в сбой диска.

import re
import uuid
from pathlib import Path

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from .db import DATA_DIR
from .images import detect_image_ext, detect_media_ext, is_video_ext

UPLOADS_DIR = DATA_DIR / "uploads"

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 60 * 1024 * 1024

# Сколько носителей максимум в одном пине: 8 — это уже длиннее, чем любой
# разумный «до/после» или показ украшений по частям.
MAX_SLIDES_PER_PIN = 8

HEAD_BYTES = 32 * 1024
CHUNK_BYTES = 256 * 1024

# имя файла всегда генерирует сервер: uuid4 hex + известное расширение
FILENAME_RE = re.compile(r"^[a-f0-9]{32}\.(jpg|jpeg|png|webp|mp4|webm|mov)$")
EXT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mov": "video/quicktime",
}


def new_filename(ext: str) -> str:
    return f"{uuid.uuid4().hex}.{ext}"


def location(name: str) -> Path:
    return UPLOADS_DIR / name


def ext_of(name: str) -> str:
    return name.rsplit(".", 1)[1]


def is_video(name: str) -> bool:
    return is_video_ext(ext_of(name))


def ceiling_for(ext: str) -> int:
    return MAX_VIDEO_BYTES if is_video_ext(ext) else MAX_UPLOAD_BYTES


def ceiling_label(ext: str) -> str:
    return f"{ceiling_for(ext) // (1024 * 1024)} MB"


def ensure_dir() -> None:
    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise HTTPException(500, "could not save file")


def write(name: str, content: bytes) -> str:
    try:
        ensure_dir()
        location(name).write_bytes(content)
    except OSError:
        raise HTTPException(500, "could not save file")
    return name


async def save_upload(upload: UploadFile) -> str:
    """Сохранить присланный файл, тип — по сигнатуре байтов, имя — наше.

    Возвращает имя файла. Картинка и видео идут одним путём: различается только
    потолок, и он выбирается по расширению, которое мы сами вывели из байтов.
    """
    head = await upload.read(HEAD_BYTES)
    if not head:
        raise HTTPException(400, "empty file")
    ext = detect_media_ext(head)
    if ext is None:
        raise HTTPException(
            400,
            "unsupported file type (jpg/png/webp/mp4/webm)",
        )
    ceiling = ceiling_for(ext)
    name = new_filename(ext)
    ensure_dir()
    target = location(name)
    written = 0
    buffer = head
    try:
        with target.open("wb") as fh:
            while buffer:
                if written + len(buffer) > ceiling:
                    raise HTTPException(413, f"file too large (max {ceiling_label(ext)})")
                fh.write(buffer)
                written += len(buffer)
                buffer = await upload.read(CHUNK_BYTES)
    except HTTPException:
        discard(name)
        raise
    except OSError:
        discard(name)
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
    return EXT_TYPES[ext_of(name)]
