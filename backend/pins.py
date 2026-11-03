# Пины пользователей: таблица pins и её артефакты (файл картинки + вектор).
#
# id вида "up-<uuid hex>"; файлы в web/.data/uploads/<uuid>.<ext>, имя
# генерирует сервер. Лайки (likes) и сохранения (board_pins) — общие таблицы
# со всеми пинами, работают по строковому pin_id, каскад по ним — в erasure.py.
#
# Node-версия сайта (lib/feed.ts) подтягивает свежие загрузки и детали пинов
# через GET /api/user-pins и GET /api/pin/{id} — поэтому они публичные и без
# авторизации.

import json
import sqlite3
import time
import urllib.parse
import uuid

from fastapi import HTTPException

from . import accounts, boards, likes, slides, uploads, video
from .db import connection
from .embeddings import embed_texts, embeddings_enabled, store as vector_store
from .images import is_allowed_img_host
from .schemas import PinFromUrlBody, PinUpdateBody


def pin_json(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    """Карточка одного пина: профиль автора и оба счётчика."""
    return build_cards(conn, [row])[0]


def cards(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[dict]:
    """Карточки списком. Профили и счётчики снимаются одним запросом на всю
    выборку: по три запроса на карточку превращали ленту из 20 пинов в 61."""
    return build_cards(conn, list(rows))


def build_cards(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[dict]:
    """Сборка карточек: e-mail наружу не отдаём (локальная часть адреса —
    персональные данные, а страница пина доступна без авторизации)."""
    if not rows:
        return []

    pin_ids = [row["id"] for row in rows]
    users = accounts.users_by_ids(conn, sorted({row["user_id"] for row in rows}))
    like_counts = likes.count_map(conn, pin_ids)
    save_counts = boards.save_count_map(conn, pin_ids)
    slides_map = slides.json_map(conn, pin_ids)

    result: list[dict] = []
    for row in rows:
        user = users.get(row["user_id"])
        author = (user["display_name"] or "").strip() if user else ""
        if not author:
            author = "Пользователь"
        keys = row.keys()
        # пин может держать картинку локально (uploads) или на внешнем хостинге
        if "source_url" in keys and row["source_url"]:
            source = row["source_url"]
        else:
            source = uploads.public_url(row["file"])
        result.append(
            {
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
                "likes": like_counts[row["id"]],
                "saves": save_counts[row["id"]],
                "sourceUrl": source,
                # пустой массив = пин без носителей (внешний, созданный до
                # функции слайдов): клиент тогда живёт на sourceUrl
                "slides": slides_map.get(row["id"], []),
            }
        )
    return result


def row_by_id(conn: sqlite3.Connection, pin_id: str) -> sqlite3.Row | None:
    return conn.execute("select * from pins where id = ?", (pin_id,)).fetchone()


def owner_id(pin_id: str) -> str | None:
    """Чей это пин; None — пин внешний (ov-…, wc-…), владельца нет."""
    with connection() as conn:
        return owner_id_of(conn, pin_id)


def owner_id_of(conn: sqlite3.Connection, pin_id: str) -> str | None:
    row = conn.execute("select user_id from pins where id = ?", (pin_id,)).fetchone()
    return row["user_id"] if row else None


def count_of_user(conn: sqlite3.Connection, user_id: str) -> int:
    return conn.execute(
        "select count(*) as c from pins where user_id = ?", (user_id,)
    ).fetchone()["c"]


def get_user_pin(pin_id: str) -> dict | None:
    if not pin_id.startswith("up-"):
        return None
    with connection() as conn:
        row = row_by_id(conn, pin_id)
        return pin_json(conn, row) if row else None


def recent_user_pins(category: str | None = None, limit: int = 6) -> list[dict]:
    with connection() as conn:
        if category:
            rows = conn.execute(
                "select * from pins where category = ? order by created_at desc limit ?",
                (category, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "select * from pins order by created_at desc limit ?", (limit,)
            ).fetchall()
        return cards(conn, rows)


def search_user_pins(q: str, limit: int = 4) -> list[dict]:
    query = (q or "").strip()
    if not query:
        return []
    like = f"%{query.lower()}%"
    with connection() as conn:
        rows = conn.execute(
            "select * from pins where lower(title) like ? or lower(description) like ? "
            "or lower(tags) like ? or lower(category) like ? "
            "order by created_at desc limit ?",
            (like, like, like, like, limit),
        ).fetchall()
        return cards(conn, rows)


def pins_of_user(conn: sqlite3.Connection, user_id: str, limit: int | None = None) -> list[sqlite3.Row]:
    """Все пины автора (так их вычитывает стирание аккаунта) либо первые `limit`.

    Потолок нужен серверному рендеру профиля: без него страница мастера с
    тысячей загрузок отдаёт тысячу карточек в HTML.
    """
    query = "select * from pins where user_id = ? order by created_at desc"
    args: list = [user_id]
    if limit is not None:
        query += " limit ?"
        args.append(limit)
    return conn.execute(query, args).fetchall()


def clean_tags(raw: str) -> list[str]:
    tags = [t.strip().lstrip("#") for t in (raw or "").split(",")]
    return [t for t in tags if t][:8]


def create_media(
    user_id: str,
    names: list[str],
    sizes: list[dict] | None,
    title: str,
    description: str,
    category: str,
    tags: str,
) -> dict:
    """Завести пин из уже сохранённых файлов: один — обычный, несколько —
    перелистываемые слайды, и среди них может быть видео.

    Тип каждого файла уже определён по сигнатуре байтов (это делает сохранение),
    поэтому «видео» здесь — факт о содержимом, а не о том, что прислал браузер.
    Для видео добавляются два серверных артефакта: размеры и длительность из
    ffprobe и постер из ffmpeg — обложка пина обязана оставаться картинкой,
    иначе og:image, сетка и превью в мессенджере видят пустоту.
    """
    if not names:
        raise HTTPException(400, "file required")
    if len(names) > uploads.MAX_SLIDES_PER_PIN:
        raise HTTPException(400, f"too many slides (max {uploads.MAX_SLIDES_PER_PIN})")

    items: list[dict] = []
    for index, name in enumerate(names):
        declared = (sizes or [])[index] if sizes and index < len(sizes) else {}
        item = {
            "kind": "video" if uploads.is_video(name) else "image",
            "file": name,
            "width": int(declared.get("width") or 0),
            "height": int(declared.get("height") or 0),
            "durationMs": 0,
            "poster": "",
        }
        if item["kind"] == "video":
            probed = video.probe(name)
            item["width"] = probed.get("width") or item["width"]
            item["height"] = probed.get("height") or item["height"]
            item["durationMs"] = probed.get("durationMs") or 0
            item["poster"] = video.make_poster(name) or ""
        items.append(item)

    cover = items[0]
    # обложка — картинка: у видео это постер, а если ffmpeg на машине нет, то
    # сам файл; карточка тогда всё равно берёт кадр из slides[0]
    cover_file = cover["poster"] or cover["file"]

    pin_id = f"up-{uuid.uuid4().hex}"
    now = time.time()
    with connection() as conn:
        conn.execute(
            "insert into pins (id, user_id, title, description, category, tags, width, height, file, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                pin_id,
                user_id,
                (title.strip() or "Без названия")[:120],
                description.strip()[:2000],
                category.strip()[:40],
                json.dumps(clean_tags(tags), ensure_ascii=False),
                max(1, min(cover["width"] or 800, 20000)),
                max(1, min(cover["height"] or 1200, 20000)),
                cover_file,
                now,
            ),
        )
        slides.add(conn, pin_id, items)
        row = row_by_id(conn, pin_id)
        pin = pin_json(conn, row)
    return pin


def create_from_url(user_id: str, body: PinFromUrlBody) -> dict:
    """Пин с картинкой на внешнем хостинге: файл не скачиваем, только
    записываем ссылку. Хост картинки должен быть в разрешённых —
    раздача всё равно идёт через наш прокси /api/img."""
    url = body.source_url.strip()
    if not url.startswith("https://"):
        raise HTTPException(400, "url must be https")
    if not is_allowed_img_host(urllib.parse.urlsplit(url).hostname):
        raise HTTPException(400, "host not allowed")

    pin_id = f"up-{uuid.uuid4().hex}"
    with connection() as conn:
        conn.execute(
            "insert into pins (id, user_id, title, description, category, tags, width, height, file, source_url, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)",
            (
                pin_id,
                user_id,
                (body.title.strip() or "Без названия")[:120],
                body.description.strip()[:2000],
                body.category.strip()[:40],
                json.dumps(body.tags[:8], ensure_ascii=False),
                max(1, min(body.width, 20000)),
                max(1, min(body.height, 20000)),
                url,
                time.time(),
            ),
        )
        row = row_by_id(conn, pin_id)
        pin = pin_json(conn, row)
    return pin


def update(user_id: str, pin_id: str, body: PinUpdateBody) -> dict:
    """Править текст/теги своего пина; чужой или отсутствующий — 404."""
    with connection() as conn:
        row = row_by_id(conn, pin_id)
        if row is None or row["user_id"] != user_id:
            raise HTTPException(404, "pin not found")
        title = (body.title if body.title is not None else row["title"]).strip()[:120] or "Без названия"
        description = (body.description if body.description is not None else row["description"]).strip()[:2000]
        category = (body.category if body.category is not None else row["category"]).strip()[:40]
        tags = json.dumps(
            body.tags[:8] if body.tags is not None else json.loads(row["tags"]), ensure_ascii=False
        )
        conn.execute(
            "update pins set title = ?, description = ?, category = ?, tags = ? where id = ?",
            (title, description, category, tags, pin_id),
        )
        updated = row_by_id(conn, pin_id)
        return pin_json(conn, updated)


def deletable(user_id: str, pin_id: str) -> sqlite3.Row:
    """Строка пина для удаления: право владельца проверяется здесь же."""
    with connection() as conn:
        row = row_by_id(conn, pin_id)
        if row is None or row["user_id"] != user_id:
            raise HTTPException(404, "pin not found")
        return row


def remove_row(conn: sqlite3.Connection, pin_id: str) -> None:
    conn.execute("delete from pins where id = ?", (pin_id,))


def upload_name(row: sqlite3.Row) -> str | None:
    """Имя файла картинки пина: у пина с внешней ссылкой файла у нас нет."""
    file = row["file"]
    if not file:
        return None
    if "source_url" in row.keys() and row["source_url"]:
        return None
    return file


def forget_files(rows: list[sqlite3.Row]) -> None:
    for row in rows:
        name = upload_name(row)
        if name:
            uploads.discard(name)


def slide_files(pin_ids: list[str]) -> list[str]:
    """Файлы носителей: видео и постеры. Собирать ДО удаления строк пина —
    после каскада по pin_slides перечислять будет нечего."""
    if not pin_ids:
        return []
    with connection() as conn:
        return [name for pin_id in pin_ids for name in slides.filenames_of(conn, pin_id)]


def forget_vectors(pin_ids: list[str]) -> None:
    """Эмбеддинги живут в .cache/vectors.json вне SQLite — иначе там навсегда
    остаются векторы удалённого контента."""
    if not pin_ids:
        return
    for pin_id in pin_ids:
        vector_store.remove(pin_id)
    try:
        vector_store.save()
    except OSError:
        pass


async def vectorize(pin: dict) -> None:
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
