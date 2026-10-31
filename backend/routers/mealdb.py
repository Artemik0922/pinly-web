# Маршруты прокси TheMealDB: /api/mealdb/*.

from fastapi import APIRouter, Query

from .. import mealdb

router = APIRouter()


@router.get("/api/mealdb/lookup")
async def mealdb_lookup(i: str = Query(..., min_length=1, max_length=16)) -> dict:
    return await mealdb.lookup(i)


@router.get("/api/mealdb/list")
async def mealdb_list(c: str = Query(..., min_length=1, max_length=40)) -> dict:
    return await mealdb.list_by_category(c)
