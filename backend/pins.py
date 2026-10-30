# Пины пользователей: загрузка картинок, редактирование, раздача файлов.
#
# id вида "up-<uuid>"; файлы в web/.data/uploads/<uuid>.<ext>, имя
# генерирует сервер. Лайки (likes) и сохранения (board_pins) — общие
# таблицы со всеми пинами, работают по строковому pin_id.
#
# Node-версия сайта (lib/feed.ts) подтягивает свежие загрузки и детали
# пинов через GET /api/user-pins и GET /api/pin/{id} — поэтому они
# публичные и без авторизации.

import json
import os
import re
import sqlite3
import time
import uuid
from pathlib import Path

from fastapi import File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx

try:
    from backend.accounts import DATA_DIR, UPLOADS_DIR, _db, _current_user_row, rate_limit
    from backend.embeddings import embed_texts, embeddings_enabled, store as vector_store
    from backend.images import detect_image_ext, is_allowed_img_host
except ImportError:  # запуск из каталога backend/
    from accounts import DATA_DIR, UPLOADS_DIR, _db, _current_user_row, rate_limit
    from embeddings import embed_texts, embeddings_enabled, store as vector_store
    from images import detect_image_ext, is_allowed_img_host

import httpx

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# имя файла всегда генерирует сервер: uuid4 hex + известное расширение
FILE_RE = re.compile(r"^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$")
EXT_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}

SCHEMA = """
create table if not exists pins (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  title       text not null default 'Без названия',
  description text not null default '',
  category    text not null default '',
  tags        text not null default '[]',
  width       integer not null default 800,
  height      integer not null default 1200,
  file        text not null,
  created_at  real not null
);
create index if not exists pins_user_idx on pins (user_id, created_at desc);
create index if not exists pins_category_idx on pins (category, created_at desc);
create table if not exists media (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  title      text not null default '',
  width      integer not null default 0,
  height     integer not null default 0,
  file       text not null,
  created_at real not null
);
create index if not exists media_user_idx on media (user_id, created_at desc);
"""


def _init() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    with _db() as conn:
        conn.executescript(SCHEMA)
        # миграции существующих баз
        for stmt in (
            "alter table pins add column source_url text",
            "alter table media add column external_url text",
        ):
            try:
                conn.execute(stmt)
            except sqlite3.OperationalError:
                pass  # колонка уже есть


def _clean_tags(raw: str) -> list[str]:
    tags = [t.strip().lstrip("#") for t in (raw or "").split(",")]
    return [t for t in tags if t][:8]


def _pin_json(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    user = conn.execute(
        "select display_name, avatar_url from users where id = ?", (row["user_id"],)
    ).fetchone()
    # e-mail наружу не отдаём: локальная часть адреса — персональные данные,
    # а лента и страница пина доступны без авторизации
    author = (user["display_name"] or "").strip() if user else ""
    if not author:
        author = "Пользователь"
    likes = conn.execute(
        "select count(*) as c from likes where pin_id = ?", (row["id"],)
    ).fetchone()["c"]
    saves = conn.execute(
        "select count(*) as c from board_pins where pin_id = ?", (row["id"],)
    ).fetchone()["c"]
    keys = row.keys()
    # пин может держать картинку локально (uploads) или на внешнем хостинге
    if "source_url" in keys and row["source_url"]:
        source = row["source_url"]
    else:
        source = f"/api/uploads/{row['file']}"
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "category": row["category"],
        "tags": json.loads(row["tags"]),
        "author": author,
        "authorAvatar": user["avatar_url"] if user else None,
        "userId": row["user_id"],
        "width": row["width"],
        "height": row["height"],
        "seed": row["id"],
        "likes": likes,
        "saves": saves,
        "sourceUrl": source,
    }


def get_user_pin(pin_id: str) -> dict | None:
    if not pin_id.startswith("up-"):
        return None
    with _db() as conn:
        row = conn.execute("select * from pins where id = ?", (pin_id,)).fetchone()
        if row is None:
            return None
        return _pin_json(conn, row)


def recent_user_pins(category: str | None = None, limit: int = 6) -> list[dict]:
    with _db() as conn:
        if category:
            rows = conn.execute(
                "select * from pins where category = ? order by created_at desc limit ?",
                (category, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "select * from pins order by created_at desc limit ?", (limit,)
            ).fetchall()
        return [_pin_json(conn, r) for r in rows]


def search_user_pins(q: str, limit: int = 4) -> list[dict]:
    query = (q or "").strip()
    if not query:
        return []
    like = f"%{query.lower()}%"
    with _db() as conn:
        rows = conn.execute(
            "select * from pins where lower(title) like ? or lower(description) like ? "
            "or lower(tags) like ? or lower(category) like ? "
            "order by created_at desc limit ?",
            (like, like, like, like, limit),
        ).fetchall()
        return [_pin_json(conn, r) for r in rows]


async def _vectorize(pin: dict) -> None:
    """Добавить пин в векторное хранилище. Не критично: без ключа — пропуск."""
    if not embeddings_enabled():
        return
    try:
        text = ". ".join([pin["title"], pin["description"], pin["category"], *pin["tags"]])
        embs = await embed_texts([text])
        if embs and embs[0]:
            vector_store.upsert(pin, embs[0])
            vector_store.save()
    except Exception:
        pass  # поиск не критичен для загрузки


class PinUpdateBody(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None


def register_pins(app) -> None:
    _init()

    @app.post("/api/pins")
    async def pins_create(
        request: Request,
        file: UploadFile = File(...),
        title: str = Form(""),
        description: str = Form(""),
        category: str = Form(""),
        tags: str = Form(""),
        width: int = Form(800),
        height: int = Form(1200),
    ):
        user = _current_user_row(request)
        rate_limit(request, "pin", limit=30, window_s=3600.0)

        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "file too large (max 10 MB)")
        if not content:
            raise HTTPException(400, "empty file")
        # тип берём из содержимого: имя файла и Content-Type присылает клиент,
        # и без проверки под видом .jpg можно выложить то, что браузер
        # исполнит с нашего домена
        ext = detect_image_ext(content)
        if ext is None:
            raise HTTPException(400, "unsupported file type (jpg/png/webp)")

        pin_id = f"up-{uuid.uuid4().hex}"
        filename = f"{pin_id[3:]}.{ext}"
        filepath = UPLOADS_DIR / filename
        try:
            filepath.write_bytes(content)
        except OSError:
            raise HTTPException(500, "could not save file")

        clean_tags = _clean_tags(tags)
        now = time.time()
        with _db() as conn:
            conn.execute(
                "insert into pins (id, user_id, title, description, category, tags, width, height, file, created_at) "
                "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    pin_id,
                    user["id"],
                    (title.strip() or "Без названия")[:120],
                    description.strip()[:2000],
                    category.strip()[:40],
                    json.dumps(clean_tags, ensure_ascii=False),
                    max(1, min(width, 20000)),
                    max(1, min(height, 20000)),
                    filename,
                    now,
                ),
            )
            row = conn.execute("select * from pins where id = ?", (pin_id,)).fetchone()
            pin = _pin_json(conn, row)

        await _vectorize(pin)
        return {"pin": pin}

    @app.get("/api/uploads/{name}")
    def uploads_get(name: str):
        if not FILE_RE.match(name):
            raise HTTPException(404, "not found")
        filepath = UPLOADS_DIR / name
        if not filepath.exists():
            raise HTTPException(404, "not found")
        ext = name.rsplit(".", 1)[1]
        return FileResponse(
            filepath,
            media_type=EXT_TYPES[ext],
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                # содержимое загружает пользователь: запретить браузеру
                # угадывать тип и исполнять его как HTML/SVG
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": f'inline; filename="{name}"',
            },
        )

    @app.get("/api/user-pins")
    def user_pins_list(category: str | None = None, q: str | None = None, limit: int = 6):
        if q:
            return {"pins": search_user_pins(q, min(max(limit, 1), 20))}
        return {"pins": recent_user_pins(category, min(max(limit, 1), 20))}

    @app.get("/api/saves-count")
    def saves_count(ids: str = ""):
        """Счётчик сохранений для произвольных пинов (нужен Node-версии
        для SSR страниц Openverse/моков)."""
        result: dict[str, int] = {}
        with _db() as conn:
            for pin_id in ids.split(",")[:50]:
                pin_id = pin_id.strip()
                if not pin_id:
                    continue
                c = conn.execute(
                    "select count(*) as c from board_pins where pin_id = ?", (pin_id,)
                ).fetchone()["c"]
                result[pin_id] = c
        return {"counts": result}

    @app.patch("/api/pins/{pin_id}")
    async def pins_update(pin_id: str, body: PinUpdateBody, request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            row = conn.execute("select * from pins where id = ?", (pin_id,)).fetchone()
            if row is None or row["user_id"] != user["id"]:
                raise HTTPException(404, "pin not found")
            title = (body.title if body.title is not None else row["title"]).strip()[:120] or "Без названия"
            description = (body.description if body.description is not None else row["description"]).strip()[:2000]
            category = (body.category if body.category is not None else row["category"]).strip()[:40]
            tags = json.dumps(body.tags[:8] if body.tags is not None else json.loads(row["tags"]), ensure_ascii=False)
            conn.execute(
                "update pins set title = ?, description = ?, category = ?, tags = ? where id = ?",
                (title, description, category, tags, pin_id),
            )
            updated = conn.execute("select * from pins where id = ?", (pin_id,)).fetchone()
            pin = _pin_json(conn, updated)

        await _vectorize(pin)  # текст мог измениться
        return {"pin": pin}

    @app.delete("/api/pins/{pin_id}")
    def pins_delete(pin_id: str, request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            row = conn.execute("select * from pins where id = ?", (pin_id,)).fetchone()
            if row is None or row["user_id"] != user["id"]:
                raise HTTPException(404, "pin not found")
            conn.execute("delete from board_pins where pin_id = ?", (pin_id,))
            conn.execute("delete from likes where pin_id = ?", (pin_id,))
            # комментарии ссылаются на pin_id без FK — иначе они пережили бы пин
            conn.execute("delete from comments where pin_id = ?", (pin_id,))
            # уведомления о лайках/сохранениях/комментариях мёртвого пина не нужны
            conn.execute("delete from notifications where pin_id = ?", (pin_id,))
            conn.execute("delete from pins where id = ?", (pin_id,))
        # у пинов с внешней картинкой файла у нас нет
        keys = row.keys()
        if not (row["file"] == "" or ("source_url" in keys and row["source_url"])):
            try:
                (UPLOADS_DIR / row["file"]).unlink()
            except OSError:
                pass
        vector_store.remove(pin_id)
        try:
            vector_store.save()
        except OSError:
            pass
        return Response(status_code=204)

    # --- медиатека: личное хранилище картинок без создания пина ---

    def _media_json(row: sqlite3.Row) -> dict:
        keys = row.keys()
        external = row["external_url"] if "external_url" in keys else None
        return {
            "id": row["id"],
            "title": row["title"],
            # внешний хостинг хранит ссылку, локальный — файл у нас
            "url": external or f"/api/uploads/{row['file']}",
            "external": bool(external),
            "width": row["width"],
            "height": row["height"],
            "createdAt": int(row["created_at"] * 1000),
        }

    def _save_image(content: bytes, source: str) -> str:
        """Сохранить валидную картинку в uploads, вернуть имя файла."""
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "file too large (max 10 MB)")
        ext = detect_image_ext(content)
        if ext is None:
            raise HTTPException(400, f"unsupported file type in {source} (jpg/png/webp)")
        filename = f"{uuid.uuid4().hex}.{ext}"
        try:
            (UPLOADS_DIR / filename).write_bytes(content)
        except OSError:
            raise HTTPException(500, "could not save file")
        return filename

    class MediaUrlBody(BaseModel):
        url: str
        title: str = ""
        width: int = 0
        height: int = 0

    @app.post("/api/media")
    async def media_upload(
        request: Request,
        file: UploadFile = File(...),
        title: str = Form(""),
        width: int = Form(0),
        height: int = Form(0),
    ):
        user = _current_user_row(request)
        rate_limit(request, "media", limit=60, window_s=3600.0)
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if not content:
            raise HTTPException(400, "empty file")
        filename = _save_image(content, file.filename or "file")
        media_id = f"md-{uuid.uuid4().hex}"
        with _db() as conn:
            conn.execute(
                "insert into media (id, user_id, title, width, height, file, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                (media_id, user["id"], title.strip()[:120], max(0, min(width, 20000)), max(0, min(height, 20000)), filename, time.time()),
            )
            row = conn.execute("select * from media where id = ?", (media_id,)).fetchone()
        return {"item": _media_json(row)}

    @app.post("/api/media/url")
    async def media_from_url(body: MediaUrlBody, request: Request):
        """Забрать картинку по ссылке с любого хостинга в своё хранилище."""
        user = _current_user_row(request)
        rate_limit(request, "media", limit=60, window_s=3600.0)
        url = body.url.strip()
        if not url.startswith("https://"):
            raise HTTPException(400, "url must be https")
        # Wikimedia требует описательный UA с контактом (их robot policy):
        # маскировка под браузер получает 403, честный бот — 200
        async with httpx.AsyncClient(
            timeout=20, follow_redirects=True,
            headers={"User-Agent": "Pinly demo image fetcher / contact: pinly@test.local"},
        ) as client:
            try:
                res = await client.get(url)
            except httpx.HTTPError:
                raise HTTPException(502, "could not fetch url")
        if res.status_code >= 400:
            raise HTTPException(502, f"upstream {res.status_code}")
        content = res.content or b""
        if not content:
            raise HTTPException(400, "empty file")
        # тип проверяем по байтам: Content-Type хостинга врать не умеет только в наших мечтах
        filename = _save_image(content, url)
        media_id = f"md-{uuid.uuid4().hex}"
        with _db() as conn:
            conn.execute(
                "insert into media (id, user_id, title, width, height, file, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                (media_id, user["id"], body.title.strip()[:120], max(0, min(body.width, 20000)), max(0, min(body.height, 20000)), filename, time.time()),
            )
            row = conn.execute("select * from media where id = ?", (media_id,)).fetchone()
        return {"item": _media_json(row)}

    @app.get("/api/media")
    def media_list(request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            rows = conn.execute(
                "select * from media where user_id = ? order by created_at desc", (user["id"],)
            ).fetchall()
        return {"items": [_media_json(r) for r in rows]}

    @app.delete("/api/media/{media_id}")
    def media_delete(media_id: str, request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            row = conn.execute("select * from media where id = ?", (media_id,)).fetchone()
            if row is None or row["user_id"] != user["id"]:
                raise HTTPException(404, "not found")
            conn.execute("delete from media where id = ?", (media_id,))
        # у внешних картинок файла у нас нет
        if "external_url" not in row.keys() or not row["external_url"]:
            try:
                (UPLOADS_DIR / row["file"]).unlink()
            except OSError:
                pass
        return Response(status_code=204)

    # --- внешний бесплатный хостинг (ImgBB) ---

    @app.get("/api/media/external")
    def media_external_status():
        return {"enabled": bool(os.environ.get("IMGBB_API_KEY"))}

    @app.post("/api/media/external")
    async def media_upload_external(request: Request, file: UploadFile = File(...)):
        """Отправить картинку на ImgBB (бесплатный хостинг, hotlink разрешён).
        Требуется IMGBB_API_KEY в .env.local — ключ выдаётся бесплатно
        на api.imgbb.com. Картинка остаётся на ImgBB, у нас — только ссылка."""
        user = _current_user_row(request)
        rate_limit(request, "media", limit=60, window_s=3600.0)
        api_key = os.environ.get("IMGBB_API_KEY")
        if not api_key:
            raise HTTPException(501, "IMGBB_API_KEY not configured")

        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if not content:
            raise HTTPException(400, "empty file")
        ext = detect_image_ext(content)
        if ext is None:
            raise HTTPException(400, "unsupported file type (jpg/png/webp)")

        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ext]
        async with httpx.AsyncClient(timeout=60) as client:
            try:
                res = await client.post(
                    "https://api.imgbb.com/1/upload",
                    params={"key": api_key},
                    files={"image": (file.filename or f"image.{ext}", content, mime)},
                )
            except httpx.HTTPError:
                raise HTTPException(502, "imgbb unreachable")
        if res.status_code == 400:
            raise HTTPException(400, "imgbb rejected the file (invalid key or bad image)")
        if res.status_code >= 400:
            raise HTTPException(502, f"imgbb {res.status_code}")
        data = (res.json() or {}).get("data") or {}
        external_url = data.get("url")
        if not external_url:
            raise HTTPException(502, "imgbb returned no url")

        media_id = f"md-{uuid.uuid4().hex}"
        now = time.time()
        with _db() as conn:
            conn.execute(
                "insert into media (id, user_id, title, width, height, file, external_url, created_at) "
                "values (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    media_id,
                    user["id"],
                    (file.filename or "").rsplit(".", 1)[0][:120],
                    int(data.get("width") or 0),
                    int(data.get("height") or 0),
                    "",
                    external_url,
                    now,
                ),
            )
            row = conn.execute("select * from media where id = ?", (media_id,)).fetchone()
        return {"item": _media_json(row)}

    class PinFromUrlBody(BaseModel):
        source_url: str
        title: str = ""
        description: str = ""
        category: str = ""
        tags: list[str] = []
        width: int = 800
        height: int = 1000

    @app.post("/api/pins/from-url")
    async def pins_create_from_url(body: PinFromUrlBody, request: Request):
        """Пин с картинкой на внешнем хостинге: файл не скачиваем, только
        записываем ссылку. Хост картинки должен быть в разрешённых —
        раздача всё равно идёт через наш прокси /api/img."""
        user = _current_user_row(request)
        rate_limit(request, "pin", limit=30, window_s=3600.0)
        url = body.source_url.strip()
        if not url.startswith("https://"):
            raise HTTPException(400, "url must be https")
        from urllib.parse import urlsplit

        if not is_allowed_img_host(urlsplit(url).hostname):
            raise HTTPException(400, "host not allowed")

        pin_id = f"up-{uuid.uuid4().hex}"
        now = time.time()
        with _db() as conn:
            conn.execute(
                "insert into pins (id, user_id, title, description, category, tags, width, height, file, source_url, created_at) "
                "values (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)",
                (
                    pin_id,
                    user["id"],
                    (body.title.strip() or "Без названия")[:120],
                    body.description.strip()[:2000],
                    body.category.strip()[:40],
                    json.dumps(body.tags[:8], ensure_ascii=False),
                    max(1, min(body.width, 20000)),
                    max(1, min(body.height, 20000)),
                    url,
                    now,
                ),
            )
            row = conn.execute("select * from pins where id = ?", (pin_id,)).fetchone()
            pin = _pin_json(conn, row)

        await _vectorize(pin)
        return {"pin": pin}
