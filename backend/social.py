# Соцблок: подписки, комментарии, публичные профили и доски.
#
# Email пользователей наружу не отдаётся никогда — только имя и аватар.
# Секретные доски (boards.is_secret) не видны никому, кроме владельца.

import json
import time
import uuid

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel

try:
    from backend.accounts import (
        SESSION_COOKIE,
        _board_json,
        _db,
        _current_user_row,
        _jwt_decode,
        rate_limit,
    )
    from backend.notifications import notify_comment, notify_follow
    from backend.pins import _pin_json
except ImportError:  # запуск из каталога backend/
    from accounts import (
        SESSION_COOKIE,
        _board_json,
        _db,
        _current_user_row,
        _jwt_decode,
        rate_limit,
    )
    from notifications import notify_comment, notify_follow
    from pins import _pin_json

SCHEMA = """
create table if not exists follows (
  follower_id text not null references users(id) on delete cascade,
  followee_id text not null references users(id) on delete cascade,
  created_at  real not null,
  primary key (follower_id, followee_id)
);
create table if not exists comments (
  id         text primary key,
  pin_id     text not null,
  user_id    text not null references users(id) on delete cascade,
  text       text not null,
  created_at real not null
);
create index if not exists comments_pin_idx on comments (pin_id, created_at asc);
create index if not exists follows_followee_idx on follows (followee_id);
"""


def _init() -> None:
    with _db() as conn:
        conn.executescript(SCHEMA)
        # is_secret добавляет accounts._init(): схема принадлежит ему


def _optional_user_row(request: Request):
    """Текущий пользователь или None (для публичных эндпоинтов)."""
    token = request.cookies.get(SESSION_COOKIE, "")
    payload = _jwt_decode(token) if token else None
    if not payload or "sub" not in payload:
        return None
    with _db() as conn:
        return conn.execute("select * from users where id = ?", (payload["sub"],)).fetchone()


def _public_user_json(conn, row, viewer_id: str | None) -> dict:
    followers = conn.execute(
        "select count(*) as c from follows where followee_id = ?", (row["id"],)
    ).fetchone()["c"]
    following = conn.execute(
        "select count(*) as c from follows where follower_id = ?", (row["id"],)
    ).fetchone()["c"]
    pins_count = conn.execute(
        "select count(*) as c from pins where user_id = ?", (row["id"],)
    ).fetchone()["c"]
    boards_count = conn.execute(
        "select count(*) as c from boards where user_id = ? and (is_secret = 0 or is_secret is null)",
        (row["id"],),
    ).fetchone()["c"]
    is_following = False
    if viewer_id:
        is_following = (
            conn.execute(
                "select 1 from follows where follower_id = ? and followee_id = ?",
                (viewer_id, row["id"]),
            ).fetchone()
            is not None
        )
    return {
        "id": row["id"],
        # e-mail наружу не отдаём никогда — только имя, которое человек
        # ввёл сам (или «Пользователь», если имени нет)
        "displayName": row["display_name"] or "Пользователь",
        "avatarUrl": row["avatar_url"] if "avatar_url" in row.keys() else None,
        "pinsCount": pins_count,
        "boardsCount": boards_count,
        "followers": followers,
        "following": following,
        "isFollowing": is_following,
        "isSelf": viewer_id == row["id"],
        "createdAt": int(row["created_at"] * 1000),
    }


class CommentBody(BaseModel):
    text: str


def register_social(app) -> None:
    _init()

    # --- публичный профиль и его контент ---

    @app.get("/api/users/{user_id}")
    def user_profile(user_id: str, request: Request):
        viewer = _optional_user_row(request)
        with _db() as conn:
            row = conn.execute("select * from users where id = ?", (user_id,)).fetchone()
            if row is None:
                raise HTTPException(404, "user not found")
            return {"user": _public_user_json(conn, row, viewer["id"] if viewer else None)}

    @app.get("/api/users/{user_id}/pins")
    def user_pins(user_id: str):
        with _db() as conn:
            row = conn.execute("select id from users where id = ?", (user_id,)).fetchone()
            if row is None:
                raise HTTPException(404, "user not found")
            rows = conn.execute(
                "select * from pins where user_id = ? order by created_at desc", (user_id,)
            ).fetchall()
            return {"pins": [_pin_json(conn, r) for r in rows]}

    @app.get("/api/users/{user_id}/boards")
    def user_boards(user_id: str):
        """Публичные (не секретные) доски пользователя."""
        with _db() as conn:
            row = conn.execute("select id from users where id = ?", (user_id,)).fetchone()
            if row is None:
                raise HTTPException(404, "user not found")
            boards = conn.execute(
                "select * from boards where user_id = ? and (is_secret = 0 or is_secret is null) "
                "order by created_at asc",
                (user_id,),
            ).fetchall()
            return {"boards": [_board_json(conn, b) for b in boards]}

    # --- подписки ---

    @app.post("/api/users/{user_id}/follow")
    def follow(user_id: str, request: Request):
        me = _current_user_row(request)
        rate_limit(request, "follow", limit=60, window_s=3600.0)
        if me["id"] == user_id:
            raise HTTPException(400, "cannot follow yourself")
        with _db() as conn:
            if conn.execute("select 1 from users where id = ?", (user_id,)).fetchone() is None:
                raise HTTPException(404, "user not found")
            conn.execute(
                "insert or ignore into follows (follower_id, followee_id, created_at) values (?, ?, ?)",
                (me["id"], user_id, time.time()),
            )
        notify_follow(me["id"], user_id)
        return {"ok": True}

    @app.delete("/api/users/{user_id}/follow")
    def unfollow(user_id: str, request: Request):
        me = _current_user_row(request)
        with _db() as conn:
            conn.execute(
                "delete from follows where follower_id = ? and followee_id = ?",
                (me["id"], user_id),
            )
        return {"ok": True}

    @app.get("/api/feed/subscriptions")
    def subscriptions_feed(request: Request):
        """Загрузки пользователей, на которых подписан + их публичные доски."""
        me = _current_user_row(request)
        with _db() as conn:
            ids = [
                r["followee_id"]
                for r in conn.execute(
                    "select followee_id from follows where follower_id = ?", (me["id"],)
                ).fetchall()
            ]
            if not ids:
                return {"pins": [], "boards": []}
            placeholders = ",".join("?" for _ in ids)
            pins = conn.execute(
                f"select * from pins where user_id in ({placeholders}) order by created_at desc limit 40",
                ids,
            ).fetchall()
            boards = conn.execute(
                f"select * from boards where user_id in ({placeholders}) "
                "and (is_secret = 0 or is_secret is null) order by created_at desc limit 20",
                ids,
            ).fetchall()
            return {
                "pins": [_pin_json(conn, p) for p in pins],
                "boards": [_board_json(conn, b) for b in boards],
            }

    # --- комментарии ---

    @app.get("/api/pin/{pin_id}/comments")
    def comments_list(pin_id: str):
        with _db() as conn:
            rows = conn.execute(
                "select c.*, u.display_name, u.avatar_url from comments c "
                "join users u on u.id = c.user_id where c.pin_id = ? "
                "order by c.created_at asc limit 200",
                (pin_id,),
            ).fetchall()
            return {
                "comments": [
                    {
                        "id": r["id"],
                        "text": r["text"],
                        "createdAt": int(r["created_at"] * 1000),
                        "author": {
                            "id": r["user_id"],
                            "name": r["display_name"] or "Пользователь",
                            "avatarUrl": r["avatar_url"],
                        },
                    }
                    for r in rows
                ]
            }

    @app.post("/api/pin/{pin_id}/comments")
    def comments_create(pin_id: str, body: CommentBody, request: Request):
        me = _current_user_row(request)
        rate_limit(request, "comment", limit=30, window_s=3600.0)
        text = body.text.strip()[:1000]
        if not text:
            raise HTTPException(400, "empty comment")
        comment_id = str(uuid.uuid4())
        with _db() as conn:
            conn.execute(
                "insert into comments (id, pin_id, user_id, text, created_at) values (?, ?, ?, ?, ?)",
                (comment_id, pin_id, me["id"], text, time.time()),
            )
        notify_comment(me["id"], pin_id)
        return {"ok": True, "id": comment_id}

    @app.delete("/api/comments/{comment_id}")
    def comments_delete(comment_id: str, request: Request):
        me = _current_user_row(request)
        with _db() as conn:
            row = conn.execute("select * from comments where id = ?", (comment_id,)).fetchone()
            if row is None:
                raise HTTPException(404, "not found")
            # автор комментария или владелец пина
            pin_owner = conn.execute(
                "select user_id from pins where id = ?", (row["pin_id"],)
            ).fetchone()
            if row["user_id"] != me["id"] and (pin_owner is None or pin_owner["user_id"] != me["id"]):
                raise HTTPException(403, "not allowed")
            conn.execute("delete from comments where id = ?", (comment_id,))
        return Response(status_code=204)

    # --- публичная доска (для read-only просмотра другим пользователем) ---

    @app.get("/api/boards/{board_id}/public")
    def board_public(board_id: str):
        with _db() as conn:
            board = conn.execute("select * from boards where id = ?", (board_id,)).fetchone()
            if board is None:
                raise HTTPException(404, "board not found")
            if board["is_secret"] if "is_secret" in board.keys() else False:
                raise HTTPException(404, "board not found")  # секретные не существуют для чужих
            owner = conn.execute(
                "select display_name, id from users where id = ?", (board["user_id"],)
            ).fetchone()
            data = _board_json(conn, board)
            data["owner"] = {
                "id": owner["id"],
                "name": owner["display_name"] or "Пользователь",
            }
            return {"board": data}

    # --- секретность доски (флаг при создании/переименовании) ---

    @app.put("/api/boards/{board_id}/secret")
    def board_secret(board_id: str, request: Request):
        """Переключить секретность своей доски."""
        me = _current_user_row(request)
        with _db() as conn:
            board = conn.execute(
                "select * from boards where id = ? and user_id = ?", (board_id, me["id"])
            ).fetchone()
            if board is None:
                raise HTTPException(404, "board not found")
            new_val = 0 if (board["is_secret"] if "is_secret" in board.keys() else 0) else 1
            conn.execute("update boards set is_secret = ? where id = ?", (new_val, board_id))
        return {"isSecret": bool(new_val)}
