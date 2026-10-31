# Зависимости FastAPI: кто делает запрос.
#
# Единственный способ достать текущую сессию из маршрутов. Раньше каждый
# эндпоинт вызывал _current_user_row(request) руками (~40 мест); здесь три
# варианта названы явно и различаются тем, что происходит без сессии:
#   session_payload — только подписанный токен (события, сводка владельца);
#   optional_user   — профиль, если вошёл, иначе None (публичные страницы);
#   current_user    — профиль или 401 "no session".

import sqlite3

from fastapi import HTTPException, Request

from .accounts import user_by_id
from .session import SESSION_COOKIE, jwt_decode


def session_payload(request: Request) -> dict | None:
    """Разобрать куку сессии: подпись и срок действия проверены, пользователя
    в базе может уже и не быть."""
    token = request.cookies.get(SESSION_COOKIE, "")
    return jwt_decode(token) if token else None


def current_user(request: Request) -> sqlite3.Row:
    row = user_by_id((session_payload(request) or {}).get("sub", ""))
    if row is None:
        raise HTTPException(401, "no session")
    return row


def optional_user(request: Request) -> sqlite3.Row | None:
    payload = session_payload(request)
    if not payload or "sub" not in payload:
        return None
    return user_by_id(payload["sub"])
