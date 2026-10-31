# Маршруты личных сообщений: /api/chats*, /api/messages/*.

import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from .. import chats, ratelimit
from ..deps import current_user
from ..schemas import ChatMessageBody, ChatStartBody

router = APIRouter()


# Порядок важен: статический /api/chats/unread объявлен раньше
# /api/chats/{chat_id}, иначе «unread» съедается как id чата.
@router.get("/api/chats/unread")
def chats_unread(me: sqlite3.Row = Depends(current_user)) -> dict:
    """Лёгкий счётчик непрочитанных сообщений для бейджа в шапке."""
    return {"unread": chats.unread_total(me["id"])}


@router.get("/api/chats")
def chats_list(me: sqlite3.Row = Depends(current_user)) -> dict:
    """Свои чаты: собеседник, превью последнего сообщения, непрочитанные."""
    return {"items": chats.list_chats(me["id"])}


@router.post("/api/chats")
def chats_start(body: ChatStartBody, request: Request, me: sqlite3.Row = Depends(current_user)) -> dict:
    """Найти личный чат с пользователем или завести. Идемпотентно."""
    ratelimit.rate_limit(request, "chat-start", limit=30, window_s=300.0)
    return {"chat": chats.start_chat(me["id"], body.userId)}


@router.get("/api/chats/{chat_id}")
def chat_get(chat_id: str, me: sqlite3.Row = Depends(current_user)) -> dict:
    return {"chat": chats.get_chat(chat_id, me["id"])}


@router.get("/api/chats/{chat_id}/messages")
def messages_list(
    chat_id: str, request: Request, limit: int = 50, me: sqlite3.Row = Depends(current_user)
) -> dict:
    """Страница сообщений по возрастанию времени. after (мс) — новые для
    поллинга, before (мс) — догрузка истории вглубь."""
    return {
        "messages": chats.list_messages(
            chat_id, me["id"], limit, request.query_params.get("after"), request.query_params.get("before")
        )
    }


@router.post("/api/chats/{chat_id}/messages")
def messages_send(
    chat_id: str, body: ChatMessageBody, request: Request, me: sqlite3.Row = Depends(current_user)
) -> dict:
    ratelimit.rate_limit(request, "chat-send", limit=30, window_s=300.0)
    return {
        "message": chats.send_message(
            chat_id, me["id"], body.kind, body.text, body.pinId, body.pinData
        )
    }


@router.post("/api/chats/{chat_id}/read")
def chat_read(chat_id: str, request: Request, me: sqlite3.Row = Depends(current_user)) -> Response:
    """Отметить чат прочитанным до последнего сообщения."""
    ratelimit.rate_limit(request, "chat-read", limit=120, window_s=300.0)
    chats.read_chat(chat_id, me["id"])
    return Response(status_code=204)


@router.delete("/api/messages/{message_id}")
def message_delete(message_id: str, me: sqlite3.Row = Depends(current_user)) -> Response:
    chats.delete_message(message_id, me["id"])
    return Response(status_code=204)
