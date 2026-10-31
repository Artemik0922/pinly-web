# Прокси TheMealDB: Node-клиент сайт получает от Cloudflare сайта tarpit
# на TLS-рукопожатии (проверено 2026-10-30: curl и httpx проходят, Node
# висит), поэтому запросы блюд идут через Python-бэкенд.
#
# Ключи кэша те же, что были в Node (meal:{id}, meal-list:{cat}) — обе
# стороны делят один дисковый кэш web/.cache.

import httpx

from .cache import cached

MEALDB_API = "https://www.themealdb.com/api/json/v1/1"
USER_AGENT = {"User-Agent": "Pinly/1.0 (local demo)"}
TIMEOUT_S = 15.0


async def lookup(meal_id: str) -> dict:
    return await _fetch_cached(f"meal:{meal_id}", "lookup.php", {"i": meal_id})


async def list_by_category(category: str) -> dict:
    return await _fetch_cached(f"meal-list:{category}", "filter.php", {"c": category})


async def _fetch_cached(key: str, path: str, params: dict) -> dict:
    """Ответ upstream-а кэшируется на сутки: список блюд меняется реже."""

    async def fetch():
        async with httpx.AsyncClient(follow_redirects=True, timeout=TIMEOUT_S) as client:
            res = await client.get(f"{MEALDB_API}/{path}", params=params, headers=USER_AGENT)
            res.raise_for_status()
            return res.json()

    return await cached(key, fetch)
