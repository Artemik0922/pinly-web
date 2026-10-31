# Лента: Openverse + моки + смысловой поиск по векторам (перенос lib/feed.ts).
#
# Совместимость с Node-версией: тот же дисковый кэш web/.cache (формат
# {at, data}), тот же векторный магазин .cache/vectors.json, тот же ключ
# кэша эмбеддингов (FNV-1a base36). Моки — backend/mock-pins.json, выгруженные
# из src/data/pins.ts.

import json
import os
import re
import urllib.parse
from pathlib import Path

import httpx

from .cache import cached
from .embeddings import embed_texts, embeddings_enabled, search_vectors, store
from .pins import get_user_pin, recent_user_pins, search_user_pins

PAGE_SIZE = 20
OPENVERSE_API = "https://api.openverse.org/v1/images/"  # slash обязателен: без него 301
TIMEOUT_S = 8.0
BROKEN_HOSTS = re.compile(r"images\.rawpixel\.com$")

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

ALL_PINS: list[dict] = json.loads(
    (Path(__file__).parent / "mock-pins.json").read_text(encoding="utf-8")
)["pins"]


def mock_page(category: str | None, cursor: int) -> dict:
    source = [p for p in ALL_PINS if p["category"] == category] if category else ALL_PINS
    pins = source[cursor * PAGE_SIZE:(cursor + 1) * PAGE_SIZE]
    nxt = cursor + 1
    return {"pins": pins, "nextCursor": nxt if nxt * PAGE_SIZE < len(source) else None}


def queries_for(category: str | None) -> list[str]:
    if not category:
        return [q for qs in CATEGORY_QUERIES.values() for q in qs]
    return CATEGORY_QUERIES.get(category, [category])


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
