# Маршруты событий: POST /api/ev и сводки /api/ev/*.

import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from .. import events, ratelimit
from ..deps import current_user

router = APIRouter()


@router.post("/api/ev")
def event_put(
    request: Request,
    name: str = "",
    board: str = "",
    pin: str = "",
    category: str = "",
    source: str = "",
) -> Response:
    """Приём события. Только query-параметры и никакой работы с телом:
    так отправку можно делать и fetch keepalive, и sendBeacon при уходе
    со страницы."""
    clean_name = events.check_name(name)
    ratelimit.rate_limit(request, "ev", limit=events.RATE_LIMIT, window_s=events.RATE_WINDOW_S)
    events.record(request, clean_name, board, pin, category, source)
    return Response(status_code=204)


@router.get("/api/ev/summary")
def event_summary(request: Request, days: int = 7) -> dict:
    """Сводка: события по дням и уникальные посетители. Агрегаты, ничего
    персонального. Доступ только сессии владельца — см. events.summary."""
    return events.summary(request, days)


@router.get("/api/ev/board")
def event_board(
    board: str = "", days: int = 14, me: sqlite3.Row = Depends(current_user)
) -> dict:
    """Цифры по одной доске — только её владельцу."""
    return events.board_stats(me["id"], board, days)
