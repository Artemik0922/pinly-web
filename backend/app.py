# Python-бэкенд Pinly (частичная замена Next.js API).
#
# Перенесены маршруты:
#   GET /api/feed?category=&q=&cursor=  — лента/поиск (аналог src/app/api/feed)
#   GET /api/pin/{id}                   — один пин (аналог lib/feed.getPinById)
#   GET /api/pin/{id}/related           — похожие (аналог lib/feed.getRelated)
#   GET /api/img?u=                     — прокси картинок (аналог src/app/api/img)
#
# Совместимость с Node-версией: тот же дисковый кэш web/.cache (формат
# {at, data}), тот же векторный магазин .cache/vectors.json, тот же ключ
# кэша эмбеддингов (FNV-1a base36). Моки — backend/mock-pins.json,
# выгруженные из src/data/pins.ts.
#
# Запуск (из каталога web, чтобы кэш и env-файл совпадали с Node-версией):
#   pip install -r backend/requirements.txt
#   python -m uvicorn backend.app:app --port 8000
#
# Env (как в .env.local): OPENVERSE_API_KEY, EMBED_API_KEY (или VOYAGE_API_KEY),
# EMBED_MODEL, EMBED_DIMENSIONS, EMBED_BASE_URL.

import hashlib
import json
import logging
import os
import re
import time
import urllib.parse
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

try:
    from backend.accounts import DATA_DIR, _db, register_accounts
    from backend.cache import CACHE_DIR, cached
    from backend.events import register_events
    from backend.embeddings import (
        embed_texts,
        embeddings_enabled,
        search_vectors,
        store,
    )
    from backend.images import detect_image_ext
    from backend.pins import (
        get_user_pin,
        recent_user_pins,
        register_pins,
        search_user_pins,
    )
    from backend.mealdb import register_mealdb
    from backend.notifications import register_notifications
    from backend.social import register_social
    from backend.seo import register_seo
except ImportError:  # запуск из каталога backend/
    from accounts import DATA_DIR, _db, register_accounts
    from cache import CACHE_DIR, cached
    from events import register_events
    from embeddings import embed_texts, embeddings_enabled, search_vectors, store
    from images import detect_image_ext
    from pins import get_user_pin, recent_user_pins, register_pins, search_user_pins
    from mealdb import register_mealdb
    from notifications import register_notifications
    from social import register_social
    from seo import register_seo

WEB_ROOT = Path(__file__).resolve().parent.parent

PAGE_SIZE = 20
OPENVERSE_API = "https://api.openverse.org/v1/images/"  # slash обязателен: без него 301
TIMEOUT_S = 8.0
BROKEN_HOSTS = re.compile(r"images\.rawpixel\.com$")
# Разрешённые хосты картинок живут в images.py (общие с pins.py)
from backend.images import is_allowed_img_host  # noqa: E402
MAX_IMG_BYTES = 15 * 1024 * 1024
IMG_HEADERS = {
    "Cache-Control": "public, max-age=31536000, immutable",
    # содержимое приходит с чужого хоста — браузеру нечего угадывать
    "X-Content-Type-Options": "nosniff",
}
RATIO = {"tall": "tall", "square": "square", "wide": "wide"}

log = logging.getLogger("pinly")


def configure_logging() -> None:
    """Один корневой логгер вместо молчаливых except по всему коду.

    Формат с уровнем и именем модуля: в journalctl/логах VPS этого хватает,
    чтобы найти причину, не включая трейсер.
    """
    level = os.environ.get("PINLY_LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    )
    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(handler)
    root.setLevel(level)


@asynccontextmanager
async def lifespan(_app):
    configure_logging()
    store.load()
    log.info("pinly backend ready (data dir %s)", DATA_DIR)
    yield


# Разрешённые источники запросов: по умолчанию локальный сайт, в проде
# задаётся через PINLY_CORS_ORIGINS (через запятую).
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("PINLY_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(
        ","
    )
    if o.strip()
]

app = FastAPI(title="Pinly Python backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def access_log(request: Request, call_next):
    """Request-id + длительность: без этого в логах нельзя связать жалобу
    пользователя с конкретным запросом."""
    path = request.url.path
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.monotonic()
    try:
        response: Response = await call_next(request)
    except Exception:
        log.exception("%s %s -> 500 (%s)", request.method, path, request_id)
        raise
    ms = (time.monotonic() - started) * 1000
    response.headers["X-Request-Id"] = request_id
    # картинки не логируем: это шум, а не события приложения
    if not path.startswith(("/api/uploads", "/api/img")):
        log.info(
            "%s %s -> %s %.0fms %s",
            request.method,
            path,
            response.status_code,
            ms,
            request_id,
        )
    return response

# Аккаунты: /api/auth/*, /api/boards*, /api/likes* (см. accounts.py).
# Пины пользователей: /api/pins, /api/uploads/* (см. pins.py).
# Соцблок: /api/users/*, комментарии, подписки (см. social.py).
# Фронтенд попадает сюда через rewrites в next.config.ts.
register_accounts(app)
register_pins(app)
register_social(app)
register_mealdb(app)
register_notifications(app)
register_events(app)
# /api/seo/urls — адреса для sitemap.ts (см. seo.py)
register_seo(app)

# --- env из web/.env.local (простая загрузка, без внешних зависимостей) ---

def load_dotenv(path: Path) -> None:
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip("'\"")
            os.environ.setdefault(k, v)
    except OSError:
        pass

load_dotenv(WEB_ROOT / ".env.local")

# --- мок-пины ---

_pins_data = json.loads((Path(__file__).parent / "mock-pins.json").read_text(encoding="utf-8"))
ALL_PINS: list[dict] = _pins_data["pins"]

def mock_page(category: str | None, cursor: int) -> dict:
    source = [p for p in ALL_PINS if p["category"] == category] if category else ALL_PINS
    pins = source[cursor * PAGE_SIZE:(cursor + 1) * PAGE_SIZE]
    nxt = cursor + 1
    return {"pins": pins, "nextCursor": nxt if nxt * PAGE_SIZE < len(source) else None}

# --- Openverse ---

async def fetch_json(client: httpx.AsyncClient, url: str) -> dict:
    headers = {"Accept": "application/json"}
    key = os.environ.get("OPENVERSE_API_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    for attempt in range(2):  # холодный TLS иногда выходит за таймаут
        try:
            res = await client.get(url, headers=headers)
            res.raise_for_status()
            return res.json()
        except httpx.TimeoutException:
            # источник не отвечает: вторая попытка только удваивает задержку,
            # а fallback на моки есть и так
            raise
        except (httpx.HTTPError, ValueError):
            if attempt == 1:
                raise
    raise RuntimeError("unreachable")

def normalize(img: dict, category: str) -> dict | None:
    try:
        host = urllib.parse.urlsplit(img["url"]).hostname or ""
    except (KeyError, ValueError):
        return None
    if BROKEN_HOSTS.search(host):
        return None
    tags = [(t or {}).get("name") for t in (img.get("tags") or [])]
    return {
        "id": f"ov-{img.get('id')}",
        "title": (img.get("title") or "").strip() or "Без названия",
        "description": "",
        "category": category,
        "tags": [t for t in tags if t and len(t) <= 24][:6],
        "author": img.get("creator") or img.get("provider") or "Неизвестный автор",
        "width": img.get("width") or 800,
        "height": img.get("height") or 1200,
        "seed": img.get("id"),
        "likes": 0,
        "sourceUrl": img.get("url"),
        "pageUrl": img.get("foreign_landing_url"),
        "license": f"{img.get('license', '')} {img.get('license_version', '')}".strip(),
        "provider": img.get("provider"),
    }

async def search_openverse(query: str, page: int, page_size: int = 20) -> dict:
    params = urllib.parse.urlencode({
        "q": query, "page": page, "page_size": page_size,
        "aspect_ratio": "tall,square,wide", "mature": "false",
    })
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        data = await cached(f"ov:{query}:{page}:{page_size}", lambda: fetch_json(client, f"{OPENVERSE_API}?{params}"))
    page_count = min(data.get("page_count") or 1, 20)
    return {
        "pins": [p for p in (normalize(img, query) for img in data.get("results") or []) if p],
        "pageCount": max(page_count, 1),
    }

async def get_openverse_pin(uuid: str) -> dict | None:
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        try:
            img = await cached(f"ov-id:{uuid}", lambda: fetch_json(client, f"{OPENVERSE_API}{uuid}"))
        except httpx.HTTPError:
            return None
    return normalize(img, "открытый контент")

async def get_openverse_related(uuid: str, fallback_query: str, limit: int = 12) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        try:
            data = await cached(
                f"ov-rel:{uuid}",
                lambda: fetch_json(client, f"{OPENVERSE_API}{uuid}/related?page_size={limit}"),
            )
            if data.get("results"):
                return [p for p in (normalize(img, "похожее") for img in data["results"]) if p]
        except httpx.HTTPError:
            pass
    alt = await search_openverse(fallback_query, 1, limit)
    return [p for p in alt["pins"] if p["id"] != f"ov-{uuid}"]

# --- лента (перенос lib/feed.ts) ---

CATEGORY_QUERIES = {
    "Интерьер": ["cozy interior design", "scandinavian living room", "wooden kitchen interior"],
    "Рецепты": ["homemade food plating", "pasta dish", "baking bread"],
    "Путешествия": ["mountain landscape travel", "old town europe street", "sea coast village"],
    "Мода": ["street style fashion", "autumn outfit", "minimal fashion look"],
    "Искусство": ["watercolor painting", "linocut print", "sketchbook art"],
    "Природа": ["foggy forest", "mountain lake sunrise", "flower field"],
    "Архитектура": ["brutalist architecture", "modern villa", "staircase architecture"],
    "Рукоделие": ["knitting wool", "ceramics handmade pottery", "macrame"],
    "Фитнес": ["yoga pose", "outdoor running trail", "gym workout"],
    "Книги и рабочее место": ["reading nook books", "home library shelf", "desk workspace"],
}

def queries_for(category: str | None) -> list[str]:
    if not category:
        return [q for qs in CATEGORY_QUERIES.values() for q in qs]
    return CATEGORY_QUERIES.get(category, [category])

def merge_user_pins(user_pins: list[dict], page_pins: list[dict], limit: int = PAGE_SIZE) -> list[dict]:
    """Пины пользователей идут первыми на странице, добор — из источника."""
    seen = {p["id"] for p in user_pins}
    out = list(user_pins)
    for p in page_pins:
        if p["id"] not in seen:
            out.append(p)
            seen.add(p["id"])
    return out[:limit]

async def get_feed_page(category: str | None = None, q: str | None = None, cursor: int = 0) -> dict:
    if q and q.strip():
        query = q.strip()
        lower = query.lower()

        # приоритет — векторный (смысловой) поиск
        if embeddings_enabled() and store.items:
            try:
                embs = await embed_texts([query])
                if embs and embs[0]:
                    hits = search_vectors(embs[0], 20)
                    if hits:
                        return {"pins": [h["pin"] for h in hits], "nextCursor": None}
            except Exception:
                pass  # обычные ветки ниже

        # свои пины по названию/описанию/тегам — наверх выдачи
        user_hits = search_user_pins(query, 4)

        try:
            page = await search_openverse(query, cursor + 1, PAGE_SIZE)
            if page["pins"]:
                return {
                    "pins": merge_user_pins(user_hits, page["pins"]),
                    "nextCursor": cursor + 1 if cursor + 1 < page["pageCount"] else None,
                }
        except httpx.HTTPError:
            pass

        matches = [
            p for p in ALL_PINS
            if lower in p["title"].lower()
            or any(lower in t.lower() for t in p["tags"])
            or lower in p["category"].lower()
        ]
        pins = matches[cursor * PAGE_SIZE:(cursor + 1) * PAGE_SIZE]
        return {
            "pins": merge_user_pins(user_hits, pins),
            "nextCursor": cursor + 1 if (cursor + 1) * PAGE_SIZE < len(matches) else None,
        }

    # лента: запросы категории по ротации; свежие загрузки — на первой странице
    uploads = recent_user_pins(category, 6) if cursor == 0 else []
    queries = queries_for(category)
    query = queries[cursor % len(queries)]
    openverse_page = cursor // len(queries) + 1
    try:
        page = await search_openverse(query, openverse_page, PAGE_SIZE)
        if page["pins"]:
            last = openverse_page >= page["pageCount"]
            return {
                "pins": merge_user_pins(uploads, page["pins"]),
                "nextCursor": None if last else cursor + 1,
            }
    except httpx.HTTPError:
        pass
    mock = mock_page(category, cursor)
    return {"pins": merge_user_pins(uploads, mock["pins"]), "nextCursor": mock["nextCursor"]}

async def get_pin_by_id(pin_id: str) -> dict | None:
    if pin_id.startswith("up-"):
        return get_user_pin(pin_id)
    if pin_id.startswith("ov-"):
        return await get_openverse_pin(pin_id[3:])
    return next((p for p in ALL_PINS if p["id"] == pin_id), None)

async def get_related(pin: dict, limit: int = 12) -> list[dict]:
    if embeddings_enabled() and store.items:
        try:
            text = ". ".join([pin["title"], pin.get("description") or "", pin["category"], *pin["tags"]])
            embs = await embed_texts([text])
            if embs and embs[0]:
                hits = search_vectors(embs[0], limit + 1, pin["id"])
                if hits:
                    return [h["pin"] for h in hits]
        except Exception:
            pass
    if pin["id"].startswith("up-"):
        same_user = [p for p in recent_user_pins(pin["category"], limit + 1) if p["id"] != pin["id"]]
        if same_user:
            return same_user[:limit]
        # своих пинов в категории больше нет — моки ниже
    elif pin["id"].startswith("ov-"):
        query = pin["tags"][0] if pin["tags"] else " ".join(pin["title"].split()[:3]) or pin["category"]
        return await get_openverse_related(pin["id"][3:], query, limit)
    same_category = [p for p in ALL_PINS if p["id"] != pin["id"] and p["category"] == pin["category"]]
    shared_tags = [
        p for p in ALL_PINS
        if p["id"] != pin["id"] and p["category"] != pin["category"] and set(p["tags"]) & set(pin["tags"])
    ]
    return (same_category + shared_tags)[:limit]

# --- маршруты ---

@app.get("/healthz")
def healthz():
    """Healthcheck для контейнера и мониторинга: жив ли процесс и доступна ли БД."""
    with _db() as conn:
        conn.execute("select 1").fetchone()
    return {"ok": True}

@app.get("/api/feed")
async def api_feed(
    category: str | None = None,
    q: str | None = None,
    cursor: int = Query(0, ge=0),
):
    return await get_feed_page(category, q, cursor)

@app.get("/api/pin/{pin_id}")
async def api_pin(pin_id: str):
    pin = await get_pin_by_id(pin_id)
    if pin is None:
        raise HTTPException(404, "pin not found")
    return pin

@app.get("/api/pin/{pin_id}/related")
async def api_pin_related(pin_id: str, limit: int = Query(12, ge=1, le=50)):
    pin = await get_pin_by_id(pin_id)
    if pin is None:
        raise HTTPException(404, "pin not found")
    return {"pins": await get_related(pin, limit)}

def _check_img_url(u: str) -> str:
    """Проверить https-URL источника и вернуть хост.

    Матчим домен или поддомен точно: поиск по хвосту пропускал evil-flickr.com,
    а `wikimedia.org` в хвосте — любой хост, на него заканчивающийся.
    """
    if not u.startswith("https://"):
        raise HTTPException(400, "bad url")
    host = urllib.parse.urlsplit(u).hostname or ""
    if not is_allowed_img_host(host):
        raise HTTPException(403, "host not allowed")
    return host


async def _cached_img(u: str) -> Path:
    """Оригинал картинки в дисковом кэше: скачивается ровно один раз на URL."""
    file = CACHE_DIR / "img" / f"{hashlib.md5(u.encode('utf-8')).hexdigest()}.bin"
    if file.exists():
        return file
    file.parent.mkdir(parents=True, exist_ok=True)
    # не следуем редиректам: он мог бы увести на неразрешённый хост.
    # UA описательный, как требует robot policy Wikimedia: маскировка
    # под браузер у них даёт 403.
    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT_S,
            follow_redirects=False,
            headers={"User-Agent": "Pinly demo image fetcher / contact: pinly@test.local"},
        ) as client:
            async with client.stream("GET", u) as res:
                if 300 <= res.status_code < 400:
                    raise HTTPException(502, "upstream redirect")
                if res.status_code >= 400:
                    raise HTTPException(502, f"upstream {res.status_code}")
                media = res.headers.get("content-type", "").split(";")[0].strip()
                if not media.startswith("image/"):
                    raise HTTPException(502, "upstream is not an image")
                body = bytearray()
                async for chunk in res.aiter_bytes(64 * 1024):
                    body += chunk
                    # потолок: иначе один запрос забивает диск кэша
                    if len(body) > MAX_IMG_BYTES:
                        raise HTTPException(502, "image too large")
    except httpx.HTTPError as err:
        raise HTTPException(504, "fetch failed") from err
    try:
        file.write_bytes(bytes(body))
    except OSError as err:
        raise HTTPException(500, "could not cache image") from err
    return file


def _img_kind(file: Path) -> str:
    """Тип по сигнатуре байтов: .bin не хранит заголовки апстрима."""
    with file.open("rb") as fh:
        return detect_image_ext(fh.read(16)) or "jpg"


@app.get("/api/img")
async def api_img(u: str = Query(...)):
    _check_img_url(u)
    file = await _cached_img(u)
    kind = _img_kind(file)
    return FileResponse(
        file,
        media_type=f"image/{'jpeg' if kind == 'jpg' else kind}",
        headers=IMG_HEADERS,
    )


@app.get("/api/img/download")
async def api_img_download(u: str = Query(...)):
    """Скачать оригинал: тот же кэш, но с Content-Disposition: attachment."""
    _check_img_url(u)
    file = await _cached_img(u)
    kind = _img_kind(file)
    return FileResponse(
        file,
        media_type=f"image/{'jpeg' if kind == 'jpg' else kind}",
        filename=f"pinly-{file.stem[:10]}.{kind}",
        headers={**IMG_HEADERS, "Content-Disposition": f'attachment; filename="pinly-{file.stem[:10]}.{kind}"'},
    )
