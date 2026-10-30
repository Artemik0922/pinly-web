# Прокси TheMealDB: Node-клиент сайт получает от Cloudflare сайта tarpit
# на TLS-рукопожатии (проверено 2026-10-30: curl и httpx проходят, Node
# висит), поэтому запросы блюд идут через Python-бэкенд.
#
# Ключи кэша те же, что были в Node (meal:{id}, meal-list:{cat}) — обе
# стороны делят один дисковый кэш web/.cache.

import httpx
from fastapi import Query

try:
    from backend.cache import cached
except ImportError:  # запуск из каталога backend/
    from cache import cached

UA = {"User-Agent": "Pinly/1.0 (local demo)"}
MEALDB_API = "https://www.themealdb.com/api/json/v1/1"


def register_mealdb(app) -> None:
    @app.get("/api/mealdb/lookup")
    async def mealdb_lookup(i: str = Query(..., min_length=1, max_length=16)):
        async def fetch():
            async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
                r = await client.get(f"{MEALDB_API}/lookup.php", params={"i": i}, headers=UA)
                r.raise_for_status()
                return r.json()

        return await cached(f"meal:{i}", fetch)

    @app.get("/api/mealdb/list")
    async def mealdb_list(c: str = Query(..., min_length=1, max_length=40)):
        async def fetch():
            async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
                r = await client.get(f"{MEALDB_API}/filter.php", params={"c": c}, headers=UA)
                r.raise_for_status()
                return r.json()

        return await cached(f"meal-list:{c}", fetch)
