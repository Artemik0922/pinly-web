# Маршруты досок: /api/boards* — свои доски, содержимое, секретность и
# публичный срез для чужих.

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import boards, notifications, ratelimit
from ..deps import current_user
from ..schemas import MAX_PIN_DATA_BYTES, BoardTitleBody, pin_card_json

router = APIRouter()


@router.get("/api/boards")
def boards_list(user: sqlite3.Row = Depends(current_user)) -> dict:
    return {"boards": boards.list_mine(user["id"])}


@router.post("/api/boards")
def boards_create(
    body: BoardTitleBody, request: Request, user: sqlite3.Row = Depends(current_user)
) -> dict:
    ratelimit.rate_limit(request, "board", limit=50, window_s=3600.0)
    return {
        "board": boards.create(user["id"], body.title, body.is_secret, body.if_missing)
    }


@router.patch("/api/boards/{board_id}")
def boards_rename(
    board_id: str, body: BoardTitleBody, user: sqlite3.Row = Depends(current_user)
) -> dict:
    return {"board": boards.rename(user["id"], board_id, body.title)}


@router.delete("/api/boards/{board_id}")
def boards_delete(board_id: str, user: sqlite3.Row = Depends(current_user)) -> Response:
    boards.delete(user["id"], board_id)
    return Response(status_code=204)


@router.put("/api/boards/{board_id}/pins/{pin_id}")
async def board_pins_put(
    board_id: str, pin_id: str, request: Request, user: sqlite3.Row = Depends(current_user)
) -> Response:
    """Положить карточку пина в доску: телом запроса приходит сам пин."""
    raw = await request.body()
    if len(raw) > MAX_PIN_DATA_BYTES:
        raise HTTPException(413, "pin_data too large")
    try:
        card = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "invalid json")
    boards.save_pin(user["id"], board_id, pin_id, pin_card_json(card, pin_id))
    # уведомление владельцу пина: его работу сохранили в доску
    notifications.notify_save(user["id"], pin_id)
    return Response(status_code=204)


@router.delete("/api/boards/{board_id}/pins/{pin_id}")
def board_pins_delete(
    board_id: str, pin_id: str, user: sqlite3.Row = Depends(current_user)
) -> Response:
    boards.unsave_pin(user["id"], board_id, pin_id)
    return Response(status_code=204)


@router.put("/api/boards/{board_id}/secret")
def board_secret(board_id: str, user: sqlite3.Row = Depends(current_user)) -> dict:
    return {"isSecret": boards.toggle_secret(user["id"], board_id)}


@router.get("/api/boards/{board_id}/public")
def board_public(board_id: str) -> dict:
    return {"board": boards.public_board(board_id)}
