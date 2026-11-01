# Соцблок: подписки, комментарии и публичные профили (таблицы follows, comments).
#
# Email пользователей наружу не отдаётся никогда — только имя и аватар.
# Секретные доски (boards.is_secret) не видны никому, кроме владельца: для
# чужих их не существует, а не «доступ запрещён».

import sqlite3
import time
import uuid

from fastapi import HTTPException

from . import boards, pins
from .db import connection

MAX_COMMENT_LEN = 1000
COMMENTS_PAGE = 200
SUBSCRIPTIONS_PINS = 40
SUBSCRIPTIONS_BOARDS = 20


def require_user(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row:
    row = conn.execute("select * from users where id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "user not found")
    return row


def profile_json(conn: sqlite3.Connection, row: sqlite3.Row, viewer_id: str | None) -> dict:
    """Публичная карточка профиля: цифры и имя, никаких персональных полей."""
    return {
        "id": row["id"],
        # e-mail наружу не отдаём никогда — только имя, которое человек
        # ввёл сам (или «Пользователь», если имени нет)
        "displayName": row["display_name"] or "Пользователь",
        "avatarUrl": row["avatar_url"] if "avatar_url" in row.keys() else None,
        "pinsCount": conn.execute(
            "select count(*) as c from pins where user_id = ?", (row["id"],)
        ).fetchone()["c"],
        "boardsCount": boards.count_public(conn, row["id"]),
        "followers": followers_count(conn, row["id"]),
        "following": following_count(conn, row["id"]),
        "isFollowing": is_following(conn, viewer_id, row["id"]),
        "isSelf": viewer_id == row["id"],
        "createdAt": int(row["created_at"] * 1000),
    }


def profile(user_id: str, viewer_id: str | None) -> dict:
    with connection() as conn:
        return profile_json(conn, require_user(conn, user_id), viewer_id)


def user_pins(user_id: str, limit: int | None = None) -> list[dict]:
    with connection() as conn:
        require_user(conn, user_id)
        return pins.cards(conn, pins.pins_of_user(conn, user_id, limit))


def user_boards(user_id: str) -> list[dict]:
    with connection() as conn:
        require_user(conn, user_id)
        return boards.list_public(conn, user_id)


# --- подписки ---


def followers_count(conn: sqlite3.Connection, user_id: str) -> int:
    return conn.execute(
        "select count(*) as c from follows where followee_id = ?", (user_id,)
    ).fetchone()["c"]


def following_count(conn: sqlite3.Connection, user_id: str) -> int:
    return conn.execute(
        "select count(*) as c from follows where follower_id = ?", (user_id,)
    ).fetchone()["c"]


def is_following(conn: sqlite3.Connection, viewer_id: str | None, user_id: str) -> bool:
    if not viewer_id:
        return False
    return (
        conn.execute(
            "select 1 from follows where follower_id = ? and followee_id = ?",
            (viewer_id, user_id),
        ).fetchone()
        is not None
    )


def follow(me_id: str, user_id: str) -> None:
    with connection() as conn:
        if me_id == user_id:
            raise HTTPException(400, "cannot follow yourself")
        require_user(conn, user_id)
        conn.execute(
            "insert or ignore into follows (follower_id, followee_id, created_at) values (?, ?, ?)",
            (me_id, user_id, time.time()),
        )


def unfollow(me_id: str, user_id: str) -> None:
    with connection() as conn:
        conn.execute(
            "delete from follows where follower_id = ? and followee_id = ?", (me_id, user_id)
        )


def subscriptions_feed(me_id: str) -> dict:
    """Загрузки пользователей, на которых подписан + их публичные доски."""
    with connection() as conn:
        ids = [
            r["followee_id"]
            for r in conn.execute(
                "select followee_id from follows where follower_id = ?", (me_id,)
            ).fetchall()
        ]
        if not ids:
            return {"pins": [], "boards": []}
        placeholders = ",".join("?" for _ in ids)
        rows = conn.execute(
            f"select * from pins where user_id in ({placeholders}) "
            "order by created_at desc limit ?",
            [*ids, SUBSCRIPTIONS_PINS],
        ).fetchall()
        return {
            "pins": pins.cards(conn, rows),
            "boards": boards.recent_public_boards(conn, ids, SUBSCRIPTIONS_BOARDS),
        }


# --- комментарии ---


def list_comments(pin_id: str) -> list[dict]:
    with connection() as conn:
        rows = conn.execute(
            "select c.*, u.display_name, u.avatar_url from comments c "
            "join users u on u.id = c.user_id where c.pin_id = ? "
            "order by c.created_at asc limit ?",
            (pin_id, COMMENTS_PAGE),
        ).fetchall()
        return [
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


def add_comment(me_id: str, pin_id: str, raw_text: str) -> str:
    text = raw_text.strip()[:MAX_COMMENT_LEN]
    if not text:
        raise HTTPException(400, "empty comment")
    comment_id = str(uuid.uuid4())
    with connection() as conn:
        conn.execute(
            "insert into comments (id, pin_id, user_id, text, created_at) values (?, ?, ?, ?, ?)",
            (comment_id, pin_id, me_id, text, time.time()),
        )
    return comment_id


def delete_comment(me_id: str, comment_id: str) -> None:
    with connection() as conn:
        row = conn.execute("select * from comments where id = ?", (comment_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "not found")
        # автор комментария или владелец пина
        if row["user_id"] != me_id and pins.owner_id_of(conn, row["pin_id"]) != me_id:
            raise HTTPException(403, "not allowed")
        conn.execute("delete from comments where id = ?", (comment_id,))


# --- чистка (вызывается из erasure.py) ---


def remove_pin_rows(conn: sqlite3.Connection, pin_id: str) -> None:
    """Комментарии ссылаются на pin_id без FK — иначе они пережили бы пин."""
    conn.execute("delete from comments where pin_id = ?", (pin_id,))


def remove_user_rows(conn: sqlite3.Connection, user_id: str) -> None:
    conn.execute("delete from comments where user_id = ?", (user_id,))


def remove_rows_of_user_pins(conn: sqlite3.Connection, user_id: str) -> None:
    conn.execute(
        "delete from comments where pin_id in (select id from pins where user_id = ?)",
        (user_id,),
    )
