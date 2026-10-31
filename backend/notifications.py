# Личные уведомления: таблица notifications — лайки, сохранения в доску,
# подписки и комментарии на собственных пинах пользователя.
#
# Индивидуальность гарантируется сервером: список отдаётся только по сессии
# (me["id"]), чужие уведомления недоступны ни в каком виде. Свои действия
# уведомлений не создают; на внешние пины (не из таблицы pins) уведомлений
# нет — у них нет владельца-пользователя.
#
# Хуки notify_* вызывают маршруты (routers/likes, routers/boards,
# routers/social): сервисы друг о друге ничего не знают, а состав «действия,
# которые уведомляют» перечислен явно и без ленивых импортов-костылей.

import sqlite3
import time
import uuid

from . import pins
from .db import connection
from .schemas import MAX_PIN_ID_LEN

MAX_KEEP = 200  # на пользователя, старые вытесняются при добавлении


def _notify(conn: sqlite3.Connection, recipient_id: str, actor_id: str, ntype: str, pin_id: str | None) -> None:
    """Положить уведомление: себе — никогда, непрочитанный дубликат того же
    события — не плодим (лайк-анлайк-лайк не спамит)."""
    if recipient_id == actor_id or pin_id is not None and len(pin_id) > MAX_PIN_ID_LEN:
        return
    dup = conn.execute(
        "select 1 from notifications where user_id = ? and actor_id = ? and type = ? "
        "and ifnull(pin_id, '') = ifnull(?, '') and read = 0",
        (recipient_id, actor_id, ntype, pin_id),
    ).fetchone()
    if dup is not None:
        return
    conn.execute(
        "insert into notifications (id, user_id, actor_id, type, pin_id, created_at) "
        "values (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), recipient_id, actor_id, ntype, pin_id, time.time()),
    )
    conn.execute(
        "delete from notifications where user_id = ? and id not in "
        "(select id from notifications where user_id = ? order by created_at desc limit ?)",
        (recipient_id, recipient_id, MAX_KEEP),
    )


def _notify_pin_owner(actor_id: str, pin_id: str, ntype: str) -> None:
    """Уведомить владельца пина; внешнего пина (нет строки в pins) нет адресата."""
    with connection() as conn:
        owner = pins.owner_id_of(conn, pin_id)
        if owner is None:
            return
        _notify(conn, owner, actor_id, ntype, pin_id)


def notify_like(actor_id: str, pin_id: str) -> None:
    _notify_pin_owner(actor_id, pin_id, "like")


def notify_save(actor_id: str, pin_id: str) -> None:
    _notify_pin_owner(actor_id, pin_id, "save")


def notify_comment(actor_id: str, pin_id: str) -> None:
    _notify_pin_owner(actor_id, pin_id, "comment")


def notify_follow(actor_id: str, recipient_id: str) -> None:
    with connection() as conn:
        _notify(conn, recipient_id, actor_id, "follow", None)


def notification_json(conn: sqlite3.Connection, r: sqlite3.Row) -> dict:
    actor = conn.execute(
        "select display_name, avatar_url from users where id = ?", (r["actor_id"],)
    ).fetchone()
    pin_row = (
        conn.execute("select title from pins where id = ?", (r["pin_id"],)).fetchone()
        if r["pin_id"]
        else None
    )
    return {
        "id": r["id"],
        "type": r["type"],
        "createdAt": int(r["created_at"] * 1000),
        "read": bool(r["read"]),
        "actor": {
            "id": r["actor_id"],
            "name": (actor["display_name"] if actor else None) or "Пользователь",
            "avatarUrl": actor["avatar_url"] if actor else None,
        },
        "pin": (
            {"id": r["pin_id"], "title": (pin_row["title"] if pin_row else None)}
            if r["pin_id"]
            else None
        ),
    }


def list_items(me_id: str) -> dict:
    """Только свои уведомления: чужие по id не читаются никогда."""
    with connection() as conn:
        rows = conn.execute(
            "select * from notifications where user_id = ? order by created_at desc limit 100",
            (me_id,),
        ).fetchall()
        return {
            "items": [notification_json(conn, r) for r in rows],
            "unread": unread_count_of(conn, me_id),
        }


def unread_count(me_id: str) -> int:
    """Лёгкий счётчик для бейджа колокольчика."""
    with connection() as conn:
        return unread_count_of(conn, me_id)


def unread_count_of(conn: sqlite3.Connection, me_id: str) -> int:
    return conn.execute(
        "select count(*) as c from notifications where user_id = ? and read = 0", (me_id,)
    ).fetchone()["c"]


def mark_all_read(me_id: str) -> None:
    with connection() as conn:
        conn.execute("update notifications set read = 1 where user_id = ? and read = 0", (me_id,))


# --- чистка (вызывается из erasure.py) ---


def remove_pin_rows(conn: sqlite3.Connection, pin_id: str) -> None:
    """Уведомления о лайках/сохранениях/комментариях мёртвого пина не нужны."""
    conn.execute("delete from notifications where pin_id = ?", (pin_id,))
