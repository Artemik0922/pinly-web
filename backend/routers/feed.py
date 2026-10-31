# Маршруты ленты: /api/feed, /api/pin/{id}, /api/pin/{id}/related.

from fastapi import APIRouter, HTTPException, Query

from .. import feed

router = APIRouter()


@router.get("/api/feed")
async def api_feed(category: str | None = None, q: str | None = None, cursor: int = Query(0, ge=0)) -> dict:
    return await feed.get_feed_page(category, q, cursor)


@router.get("/api/pin/{pin_id}")
async def api_pin(pin_id: str) -> dict:
    pin = await feed.get_pin_by_id(pin_id)
    if pin is None:
        raise HTTPException(404, "pin not found")
    return pin


@router.get("/api/pin/{pin_id}/related")
async def api_pin_related(pin_id: str, limit: int = Query(12, ge=1, le=50)) -> dict:
    pin = await feed.get_pin_by_id(pin_id)
    if pin is None:
        raise HTTPException(404, "pin not found")
    return {"pins": await feed.get_related(pin, limit)}
