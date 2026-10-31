# Маршруты лайков и «вкуса»: /api/likes*, /api/taste/pins.

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import boards, likes, notifications
from ..deps import current_user, session_payload
from ..schemas import MAX_PIN_ID_LEN

router = APIRouter()


@router.get("/api/likes")
def likes_list(user: sqlite3.Row = Depends(current_user)) -> dict:
    return {"likes": likes.list_pin_ids(user["id"])}


@router.put("/api/likes/{pin_id}")
def likes_put(
    pin_id: str, user: sqlite3.Row = Depends(current_user)
) -> Response:
    if len(pin_id) > MAX_PIN_ID_LEN:
        raise HTTPException(400, "bad pin_id")
    likes.add(user["id"], pin_id)
    # уведомление владельцу пина
    notifications.notify_like(user["id"], pin_id)
    return Response(status_code=204)


@router.delete("/api/likes/{pin_id}")
def likes_delete(pin_id: str, user: sqlite3.Row = Depends(current_user)) -> Response:
    likes.remove(user["id"], pin_id)
    return Response(status_code=204)


@router.get("/api/taste/pins")
def taste_pins(request: Request) -> dict:
    """Лайки и сохранения пользователя: по этим id Node-лента строит
    вектор вкуса (умная лента). Без сессии — пустой список, не 401."""
    payload = session_payload(request)
    if not payload or "sub" not in payload:
        return {"userId": None, "likeIds": [], "saveIds": []}
    user_id = payload["sub"]
    return {
        "userId": user_id,
        "likeIds": likes.list_pin_ids(user_id),
        "saveIds": boards.saved_pin_ids(user_id),
    }
