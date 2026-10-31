# Маршруты аккаунтов: /api/auth/* (вход, сессия, профиль, удаление).

import sqlite3

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile

from .. import accounts, erasure, ratelimit, session
from ..deps import current_user
from ..schemas import DisplayNameBody, LoginBody, RegisterBody

router = APIRouter()


@router.post("/api/auth/register")
def auth_register(body: RegisterBody, request: Request, response: Response) -> dict:
    ratelimit.rate_limit(request, "auth")
    row = accounts.register(
        body.email, body.password, body.display_name, body.consent, request.headers.get("user-agent")
    )
    session.set_session_cookie(request, response, row["id"], row["email"])
    return {"user": accounts.user_json(row)}


@router.post("/api/auth/login")
def auth_login(body: LoginBody, request: Request, response: Response) -> dict:
    """Неверная пара — 401, перебор — 429: оба статуса обязаны появляться,
    иначе лимит обходится бесконечными 401."""
    ratelimit.rate_limit(request, "auth")
    row = accounts.login(body.email, body.password)
    session.set_session_cookie(request, response, row["id"], row["email"])
    return {"user": accounts.user_json(row)}


@router.post("/api/auth/logout")
def auth_logout(response: Response) -> dict:
    session.clear_session_cookie(response)
    return {"ok": True}


@router.get("/api/auth/me")
def auth_me(user: sqlite3.Row = Depends(current_user)) -> dict:
    return {"user": accounts.user_json(user)}


@router.patch("/api/auth/me")
def auth_update_me(
    body: DisplayNameBody, user: sqlite3.Row = Depends(current_user)
) -> dict:
    return {"user": accounts.user_json(accounts.rename_user(user["id"], body.display_name))}


@router.post("/api/auth/avatar")
async def auth_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: sqlite3.Row = Depends(current_user),
) -> dict:
    ratelimit.rate_limit(request, "avatar", limit=10, window_s=3600.0)
    content = await file.read(accounts.MAX_AVATAR_BYTES + 1)
    return {"user": accounts.user_json(accounts.replace_avatar(user, content))}


@router.delete("/api/auth/account")
def auth_delete_account(
    response: Response, user: sqlite3.Row = Depends(current_user)
) -> dict:
    # 152-ФЗ: удаление аккаунта и персональных данных — строки, файлы и
    # векторы; каскад чужих таблиц собран в erasure.py.
    erasure.erase_account(user)
    session.clear_session_cookie(response)
    return {"ok": True}
