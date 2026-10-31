# Маршруты уведомлений: /api/notifications*.

import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from .. import notifications, ratelimit
from ..deps import current_user

router = APIRouter()


@router.get("/api/notifications")
def notifications_list(me: sqlite3.Row = Depends(current_user)) -> dict:
    """Только свои уведомления: чужие по id не читаются никогда."""
    return notifications.list_items(me["id"])


@router.get("/api/notifications/count")
def notifications_count(me: sqlite3.Row = Depends(current_user)) -> dict:
    """Лёгкий счётчик для бейджа колокольчика."""
    return {"unread": notifications.unread_count(me["id"])}


@router.post("/api/notifications/read-all")
def notifications_read_all(request: Request, me: sqlite3.Row = Depends(current_user)) -> Response:
    ratelimit.rate_limit(request, "notify-read", limit=60, window_s=3600.0)
    notifications.mark_all_read(me["id"])
    return Response(status_code=204)
