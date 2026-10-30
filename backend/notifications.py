# Личные уведомления: лайки, сохранения в доску, подписки и комментарии
# на собственных пинах пользователя.
#
# Индивидуальность гарантируется сервером: список отдаётся только по
# сессии (me["id"]), чужие уведомления недоступны ни в каком виде.
# Свои действия уведомлений не создают; на внешние пины (не из таблицы
# pins) уведомлений нет — у них нет владельца-пользователя.
#
# accounts.py вызывает хуки notify_like/notify_save изнутри эндпоинтов
# (ленивый импорт — иначе цикл: notifications -> accounts -> notifications).

import time
import uuid

from fastapi import HTTPException, Request
from fastapi.responses import Response

try:
    from backend.accounts import _current_user_row, _db, rate_limit
except ImportError:  # запуск из каталога backend/
    from accounts import _current_user_row, _db, rate_limit

SCHEMA = """
create table if not exists notifications (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  actor_id   text not null references users(id) on delete cascade,
  type       text not null,
  pin_id     text,
  created_at real not null,
  read       integer not null default 0
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
"""

MAX_KEEP = 200  # на пользователя, старые вытесняются при добавлении


def _notify(conn, recipient_id: str, actor_id: str, ntype: str, pin_id: str | None) -> None:
    """Положить уведомление: себе — никогда, непрочитанный дубликат того же
    события — не плодим (лайк-анлайк-лайк не спамит)."""
    if recipient_id == actor_id or pin_id is not None and len(pin_id) > 128:
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


def notify_like(actor_id: str, pin_id: str) -> None:
    with _db() as conn:
        row = conn.execute("select user_id from pins where id = ?", (pin_id,)).fetchone()
        if row is None:
            return  # внешний пин — адресата нет
        _notify(conn, row["user_id"], actor_id, "like", pin_id)


def notify_save(actor_id: str, pin_id: str) -> None:
    with _db() as conn:
        row = conn.execute("select user_id from pins where id = ?", (pin_id,)).fetchone()
        if row is None:
            return
        _notify(conn, row["user_id"], actor_id, "save", pin_id)


def notify_follow(actor_id: str, recipient_id: str) -> None:
    with _db() as conn:
        _notify(conn, recipient_id, actor_id, "follow", None)


def notify_comment(actor_id: str, pin_id: str) -> None:
    with _db() as conn:
        row = conn.execute("select user_id from pins where id = ?", (pin_id,)).fetchone()
        if row is None:
            return
        _notify(conn, row["user_id"], actor_id, "comment", pin_id)


def _item_json(conn, r) -> dict:
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


def register_notifications(app) -> None:
    with _db() as conn:
        conn.executescript(SCHEMA)

    @app.get("/api/notifications")
    def notifications_list(request: Request):
        """Только свои уведомления: чужие по id не читаются никогда."""
        me = _current_user_row(request)
        with _db() as conn:
            rows = conn.execute(
                "select * from notifications where user_id = ? order by created_at desc limit 100",
                (me["id"],),
            ).fetchall()
            unread = conn.execute(
                "select count(*) as c from notifications where user_id = ? and read = 0",
                (me["id"],),
            ).fetchone()["c"]
            return {"items": [_item_json(conn, r) for r in rows], "unread": unread}

    @app.get("/api/notifications/count")
    def notifications_count(request: Request):
        """Лёгкий счётчик для бейджа колокольчика."""
        me = _current_user_row(request)
        with _db() as conn:
            unread = conn.execute(
                "select count(*) as c from notifications where user_id = ? and read = 0",
                (me["id"],),
            ).fetchone()["c"]
            return {"unread": unread}

    @app.post("/api/notifications/read-all")
    def notifications_read_all(request: Request):
        me = _current_user_row(request)
        rate_limit(request, "notify-read", limit=60, window_s=3600.0)
        with _db() as conn:
            conn.execute(
                "update notifications set read = 1 where user_id = ? and read = 0", (me["id"],)
            )
        return Response(status_code=204)
