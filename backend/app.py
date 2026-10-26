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
# Env (как в .env.local): OPENVERSE_API_KEY, VOYAGE_API_KEY, VOYAGE_BASE_URL.

import asyncio
import hashlib
import json
import math
import os
import re
import time
import urllib.parse
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

WEB_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = WEB_ROOT / ".cache"
CACHE_DIR.mkdir(exist_ok=True)

PAGE_SIZE = 20
CACHE_TTL_S = 24 * 60 * 60
OPENVERSE_API = "https://api.openverse.org/v1/images"
TIMEOUT_S = 20.0
BROKEN_HOSTS = re.compile(r"images\.rawpixel\.com$")
ALLOWED_IMG_HOSTS = re.compile(r"(staticflickr\.com|wikimedia\.org|flickr\.com)$")
RATIO = {"tall": "tall", "square": "square", "wide": "wide"}

app = FastAPI(title="Pinly Python backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# --- кэш: тот же формат и файлы, что у Node-версии ---

_mem_cache: dict[str, tuple[float, object]] = {}

def cache_path(key: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", key)[:120]
    return CACHE_DIR / f"{safe}.json"

async def cached(key: str, fetcher):
    now = time.time() * 1000
    hit = _mem_cache.get(key)
    if hit and now - hit[0] < CACHE_TTL_S:
        return hit[1]
    try:
        entry = json.loads(cache_path(key).read_text(encoding="utf-8"))
        if now - entry["at"] < CACHE_TTL_S:
            _mem_cache[key] = (entry["at"], entry["data"])
            return entry["data"]
    except (OSError, KeyError, ValueError):
        pass
    data = await fetcher()
    _mem_cache[key] = (now, data)
    try:
        cache_path(key).write_text(json.dumps({"at": now, "data": data}), encoding="utf-8")
    except OSError:
        pass
    return data

# --- мок-пины ---

_pins_data = json.loads((Path(__file__).parent / "mock-pins.json").read_text(encoding="utf-8"))
ALL_PINS: list[dict] = _pins_data["pins"]

def mock_page(category: str | None, cursor: int) -> dict:
    source = [p for p in ALL_PINS if p["category"] == category] if category else ALL_PINS
    pins = source[cursor * PAGE_SIZE:(cursor + 1) * PAGE_SIZE]
    nxt = cursor + 1
    return {"pins": pins, "nextCursor": nxt if nxt * PAGE_SIZE < len(source) else None}

# --- векторный магазин (.cache/vectors.json) ---

class VectorStore:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def load(self) -> None:
        try:
            store = json.loads((CACHE_DIR / "vectors.json").read_text(encoding="utf-8"))
            self.items = store.get("items", [])
        except (OSError, ValueError):
            self.items = []

store = VectorStore()

def search_vectors(vector: list[float], top_k: int, exclude_id: str | None = None):
    scored = []
    for it in store.items:
        pin = it["pin"]
        if pin.get("id") == exclude_id:
            continue
        scored.append((cosine(vector, it["vector"]), pin))
    scored.sort(key=lambda s: -s[0])
    return [{"score": sc, "pin": pin} for sc, pin in scored[:top_k]]

def cosine(a: list[float], b: list[float]) -> float:
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    denom = math.sqrt(na) * math.sqrt(nb)
    return dot / denom if denom else 0.0

# --- эмбеддинги voyage (тот же ключ кэша, что у Node-версии) ---

def fnv1a(text: str) -> str:
    h = 0x811C9DC5
    for ch in text.encode("utf-8"):
        h ^= ch
        h = (h * 0x01000193) & 0xFFFFFFFF
    return base36(h)

def base36(n: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        out = digits[n % 36] + out
        n //= 36
    return out or "0"

def voyage_enabled() -> bool:
    return bool(os.environ.get("VOYAGE_API_KEY"))

async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    if not voyage_enabled():
        return None
    base = os.environ.get("VOYAGE_BASE_URL", "https://routerai.ru/api/v1")
    async with httpx.AsyncClient(timeout=30) as client:
        out: list[list[float] | None] = [None] * len(texts)
        for i in range(0, len(texts), 32):
            batch = texts[i:i + 32]
            key = f"emb-batch:{fnv1a('\0'.join(batch))}"

            async def call():
                res = await client.post(
                    f"{base}/embeddings",
                    headers={"Authorization": f"Bearer {os.environ.get('VOYAGE_API_KEY')}"},
                    json={"model": "voyageai/voyage-multimodal-3.5", "input": batch, "encoding_format": "float"},
                )
                res.raise_for_status()
                data = res.json()
                return [d["embedding"][:512] for d in data["data"]]

            vectors = await cached(key, call)
            for j in range(len(batch)):
                out[i + j] = vectors[j]
    return out  # type: ignore[return-value]

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
            img = await cached(f"ov-id:{uuid}", lambda: fetch_json(client, f"{OPENVERSE_API}/{uuid}"))
        except httpx.HTTPError:
            return None
    return normalize(img, "открытый контент")

async def get_openverse_related(uuid: str, fallback_query: str, limit: int = 12) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        try:
            data = await cached(
                f"ov-rel:{uuid}",
                lambda: fetch_json(client, f"{OPENVERSE_API}/{uuid}/related?page_size={limit}"),
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

async def get_feed_page(category: str | None = None, q: str | None = None, cursor: int = 0) -> dict:
    if q and q.strip():
        query = q.strip()
        lower = query.lower()

        # приоритет — векторный (смысловой) поиск
        if voyage_enabled() and store.items:
            try:
                embs = await embed_texts([query])
                if embs and embs[0]:
                    hits = search_vectors(embs[0], 20)
                    if hits:
                        return {"pins": [h["pin"] for h in hits], "nextCursor": None}
            except Exception:
                pass  # обычные ветки ниже

        try:
            page = await search_openverse(query, cursor + 1, PAGE_SIZE)
            if page["pins"]:
                return {"pins": page["pins"], "nextCursor": cursor + 1 if cursor + 1 < page["pageCount"] else None}
        except httpx.HTTPError:
            pass

        matches = [
            p for p in ALL_PINS
            if lower in p["title"].lower()
            or any(lower in t.lower() for t in p["tags"])
            or lower in p["category"].lower()
        ]
        pins = matches[cursor * PAGE_SIZE:(cursor + 1) * PAGE_SIZE]
        return {"pins": pins, "nextCursor": cursor + 1 if (cursor + 1) * PAGE_SIZE < len(matches) else None}

    # лента: запросы категории по ротации
    queries = queries_for(category)
    query = queries[cursor % len(queries)]
    openverse_page = cursor // len(queries) + 1
    try:
        page = await search_openverse(query, openverse_page, PAGE_SIZE)
        if page["pins"]:
            last = openverse_page >= page["pageCount"]
            return {"pins": page["pins"], "nextCursor": None if last else cursor + 1}
    except httpx.HTTPError:
        pass
    return mock_page(category, cursor)

async def get_pin_by_id(pin_id: str) -> dict | None:
    if pin_id.startswith("ov-"):
        return await get_openverse_pin(pin_id[3:])
    return next((p for p in ALL_PINS if p["id"] == pin_id), None)

async def get_related(pin: dict, limit: int = 12) -> list[dict]:
    if voyage_enabled() and store.items:
        try:
            text = ". ".join([pin["title"], pin.get("description") or "", pin["category"], *pin["tags"]])
            embs = await embed_texts([text])
            if embs and embs[0]:
                hits = search_vectors(embs[0], limit + 1, pin["id"])
                if hits:
                    return [h["pin"] for h in hits]
        except Exception:
            pass
    if pin["id"].startswith("ov-"):
        query = pin["tags"][0] if pin["tags"] else " ".join(pin["title"].split()[:3]) or pin["category"]
        return await get_openverse_related(pin["id"][3:], query, limit)
    same_category = [p for p in ALL_PINS if p["id"] != pin["id"] and p["category"] == pin["category"]]
    shared_tags = [
        p for p in ALL_PINS
        if p["id"] != pin["id"] and p["category"] != pin["category"] and set(p["tags"]) & set(pin["tags"])
    ]
    return (same_category + shared_tags)[:limit]

# --- маршруты ---

@app.on_event("startup")
def _startup() -> None:
    store.load()

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

@app.get("/api/img")
async def api_img(u: str = Query(...)):
    if not u.startswith("https://"):
        raise HTTPException(400, "bad url")
    host = urllib.parse.urlsplit(u).hostname or ""
    if not ALLOWED_IMG_HOSTS.search(host):
        raise HTTPException(403, "host not allowed")

    digest = hashlib.md5(u.encode("utf-8")).hexdigest()
    file = CACHE_DIR / "img" / f"{digest}.bin"
    if not file.exists():
        file.parent.mkdir(parents=True, exist_ok=True)
        # не следуем редиректам: он мог бы увести на неразрешённый хост
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            try:
                res = await client.get(u)
            except httpx.HTTPError:
                raise HTTPException(504, "fetch failed")
            if 300 <= res.status_code < 400:
                raise HTTPException(502, "upstream redirect")
            if res.status_code >= 400:
                raise HTTPException(502, f"upstream {res.status_code}")
            try:
                file.write_bytes(res.content)
            except OSError:
                return RedirectResponse(f"/api/img?u={urllib.parse.quote(u)}")  # не должно случиться
    return FileResponse(
        file,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
