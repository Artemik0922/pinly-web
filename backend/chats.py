# Личные сообщения: таблицы chats, chat_members, messages — чаты один на один,
# текст и пины-карточки в сообщениях.
#
# Права — как в notifications.py: список и переписка отдаются только по сессии
# (me["id"]), чужой чат не читается ни по каким id. Пин в сообщении — снапшот
# карточки в pin_data (как board_pins в досках): пин может быть внешним (ov-…),
# строковой ссылки без FK достаточно, а карточка обязана остаться валидной
# навсегда, даже если пин потом удалят.
#
# Обновление на клиенте — опросом: открытый чат спрашивает ?after= каждые
# пару секунд, бейдж в шапке — GET /api/chats/unread раз в минуту.

import json
import sqlite3
import time
import uuid

from fastapi import HTTPException

from .db import connection
from .schemas import chat_pin_card_json

MAX_TEXT_LEN = 2000
MAX_PAGE = 100


def message_json(conn: sqlite3.Connection, r: sqlite3.Row) -> dict:
    pin = None
    if r["pin_id"]:
        card = None
        if r["pin_data"]:
            try:
                card = json.loads(r["pin_data"])
            except ValueError:
                card = None
        pin = {"id": r["pin_id"], "card": card}
    return {
        "id": r["id"],
        "chatId": r["chat_id"],
        "senderId": r["sender_id"],
        "kind": r["kind"],
        "text": r["text"],
        "pin": pin,
        "createdAt": int(r["created_at"] * 1000),
    }


def chat_json(conn: sqlite3.Connection, chat_row: sqlite3.Row, me_id: str) -> dict | None:
    """Карточка одного чата (заголовок переписки). Список строится пакетом —
    см. chat_cards."""
    cards = chat_cards(conn, [chat_row], me_id)
    return cards[0] if cards else None


def chat_cards(
    conn: sqlite3.Connection, chat_rows: list[sqlite3.Row], me_id: str
) -> list[dict]:
    """Карточки чатов списком: пять запросов на всю выборку вместо пяти на
    каждый чат. Список пересобирается поллингом каждые 15 секунд, и 1+5N
    запросов на этом пути заметен сразу.

    None-строка (собеседник удалён, а чистка опустевших чатов не добежала)
    пропускается — как и раньше.
    """
    if not chat_rows:
        return []

    ids = [row["id"] for row in chat_rows]
    ph = ",".join("?" * len(ids))

    peers = {
        row["chat_id"]: row
        for row in conn.execute(
            "select cm.chat_id, u.id as peer_id, u.display_name, u.avatar_url "
            "from chat_members cm join users u on u.id = cm.user_id "
            f"where cm.chat_id in ({ph}) and cm.user_id != ?",
            (*ids, me_id),
        ).fetchall()
    }
    unreads = {
        row["chat_id"]: row["c"]
        for row in conn.execute(
            "select m.chat_id, count(*) as c from messages m "
            "join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = ? "
            f"where m.chat_id in ({ph}) and m.sender_id != ? "
            "and m.created_at > cm.last_read_at group by m.chat_id",
            (me_id, *ids, me_id),
        ).fetchall()
    }
    lasts = {}
    for row in conn.execute(
        "select m.chat_id, m.kind, m.text, m.sender_id, m.created_at, m.pin_id, m.pin_data "
        "from messages m join (select chat_id, max(created_at) as mx from messages "
        f"where chat_id in ({ph}) group by chat_id) t "
        "on t.chat_id = m.chat_id and t.mx = m.created_at",
        ids,
    ).fetchall():
        # двух сообщений с идентичным created_at в одном чате быть не может
        # (пишем time.time()), но словарь перестраховывается сам
        lasts.setdefault(row["chat_id"], row)

    cards: list[dict] = []
    for row in chat_rows:
        peer = peers.get(row["id"])
        if peer is None:
            continue
        last = lasts.get(row["id"])
        pin_title = None
        if last is not None and last["pin_id"] and last["pin_data"]:
            # название пина — из снапшота: превью не должно зависеть от того,
            # жив ли пин на момент показа списка
            try:
                pin_title = json.loads(last["pin_data"]).get("title")
            except ValueError:
                pin_title = None
        cards.append(
            {
                "id": row["id"],
                "member": {
                    "id": peer["peer_id"],
                    "displayName": ((peer["display_name"] or "").strip() or "Пользователь"),
                    "avatarUrl": peer["avatar_url"],
                },
                "lastMessage": None
                if last is None
                else {
                    "kind": last["kind"],
                    "text": last["text"],
                    "senderId": last["sender_id"],
                    "createdAt": int(last["created_at"] * 1000),
                    "pinTitle": pin_title,
                },
                "unread": unreads.get(row["id"], 0),
                "updatedAt": int((row["last_message_at"] or row["created_at"]) * 1000),
            }
        )
    return cards


def find_pair_chat(conn: sqlite3.Connection, user_a: str, user_b: str) -> str | None:
    """Личный чат ровно на двоих: участник-третий делал бы его групповым."""
    row = conn.execute(
        "select cm.chat_id from chat_members cm "
        "join chats c on c.id = cm.chat_id "
        "where cm.user_id in (?, ?) group by cm.chat_id "
        "having count(*) = 2 and count(distinct cm.user_id) = 2",
        (user_a, user_b),
    ).fetchone()
    return row["chat_id"] if row else None


def require_member(conn: sqlite3.Connection, chat_id: str, user_id: str) -> None:
    """Чат существует и пользователь в нём участник; иначе 404/403."""
    chat = conn.execute("select id from chats where id = ?", (chat_id,)).fetchone()
    if chat is None:
        raise HTTPException(404, "chat not found")
    member = conn.execute(
        "select 1 from chat_members where chat_id = ? and user_id = ?",
        (chat_id, user_id),
    ).fetchone()
    if member is None:
        raise HTTPException(403, "not a chat member")


def start_chat(me_id: str, other_id: str) -> dict:
    """Найти личный чат с пользователем или завести. Идемпотентно."""
    with connection() as conn:
        if other_id == me_id:
            raise HTTPException(400, "self chat")
        target = conn.execute("select id from users where id = ?", (other_id,)).fetchone()
        if target is None:
            raise HTTPException(404, "user not found")
        chat_id = find_pair_chat(conn, me_id, other_id)
        if chat_id is None:
            chat_id = str(uuid.uuid4())
            conn.execute("insert into chats (id, created_at) values (?, ?)", (chat_id, time.time()))
            conn.executemany(
                "insert into chat_members (chat_id, user_id) values (?, ?)",
                [(chat_id, me_id), (chat_id, other_id)],
            )
        row = conn.execute("select * from chats where id = ?", (chat_id,)).fetchone()
        return chat_json(conn, row, me_id)


def list_chats(me_id: str) -> list[dict]:
    """Свои чаты: собеседник, превью последнего сообщения, непрочитанные."""
    with connection() as conn:
        rows = conn.execute(
            "select c.* from chats c join chat_members cm on cm.chat_id = c.id "
            "where cm.user_id = ? order by ifnull(c.last_message_at, c.created_at) desc",
            (me_id,),
        ).fetchall()
        return chat_cards(conn, rows, me_id)


def get_chat(chat_id: str, me_id: str) -> dict:
    with connection() as conn:
        require_member(conn, chat_id, me_id)
        row = conn.execute("select * from chats where id = ?", (chat_id,)).fetchone()
        return chat_json(conn, row, me_id)


def list_messages(
    chat_id: str, me_id: str, limit: int, after: str | None, before: str | None
) -> list[dict]:
    """Страница сообщений по возрастанию времени. after (мс) — новые для
    поллинга, before (мс) — догрузка истории вглубь."""
    limit = max(1, min(limit, MAX_PAGE))
    with connection() as conn:
        require_member(conn, chat_id, me_id)
        sql = "select * from messages where chat_id = ?"
        params: list = [chat_id]
        if after and after.isdigit():
            sql += " and created_at > ?"
            params.append(int(after) / 1000.0)
        if before and before.isdigit():
            sql += " and created_at < ?"
            params.append(int(before) / 1000.0)
        sql += " order by created_at desc limit ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        rows.reverse()  # возрастание: старые сверху
        return [message_json(conn, r) for r in rows]


def send_message(
    chat_id: str,
    me_id: str,
    kind: str,
    raw_text: str | None,
    pin_id: str | None,
    pin_data: dict | None,
) -> dict:
    text = (raw_text or "").strip()
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(400, "message too long")
    if kind == "text" and not text:
        raise HTTPException(400, "empty message")
    pin_raw = None
    if kind == "pin":
        pin_raw = chat_pin_card_json(pin_id, pin_data)
    elif kind != "text":
        raise HTTPException(400, "unknown kind")
    with connection() as conn:
        require_member(conn, chat_id, me_id)
        # Время — в миллисекундах и строго монотонно внутри чата: клиент
        # поллит ?after=<мс последнего сообщения>, суб-мс дробь или
        # совпадение в одной мс теряли бы/дублировали сообщения.
        chat = conn.execute("select last_message_at from chats where id = ?", (chat_id,)).fetchone()
        now_ms = max(int(time.time() * 1000), int((chat["last_message_at"] or 0) * 1000) + 1)
        created = now_ms / 1000.0
        message_id = str(uuid.uuid4())
        conn.execute(
            "insert into messages (id, chat_id, sender_id, kind, text, pin_id, pin_data, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                message_id,
                chat_id,
                me_id,
                kind,
                text or None,
                pin_id if kind == "pin" else None,
                pin_raw,
                created,
            ),
        )
        conn.execute("update chats set last_message_at = ? where id = ?", (created, chat_id))
        # своё сообщение само прочитано: бейдж не должен мигать
        mark_read(conn, chat_id, me_id, created)
        row = conn.execute("select * from messages where id = ?", (message_id,)).fetchone()
        return message_json(conn, row)


def mark_read(conn: sqlite3.Connection, chat_id: str, me_id: str, moment: float) -> None:
    conn.execute(
        "update chat_members set last_read_at = max(last_read_at, ?) "
        "where chat_id = ? and user_id = ?",
        (moment, chat_id, me_id),
    )


def read_chat(chat_id: str, me_id: str) -> None:
    """Отметить чат прочитанным до последнего сообщения."""
    with connection() as conn:
        require_member(conn, chat_id, me_id)
        last = conn.execute(
            "select max(created_at) as m from messages where chat_id = ?", (chat_id,)
        ).fetchone()["m"]
        if last is not None:
            mark_read(conn, chat_id, me_id, last)


def unread_total(me_id: str) -> int:
    """Лёгкий счётчик непрочитанных сообщений для бейджа в шапке."""
    with connection() as conn:
        return conn.execute(
            "select count(*) as c from messages m "
            "join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = ? "
            "where m.sender_id != ? and m.created_at > cm.last_read_at",
            (me_id, me_id),
        ).fetchone()["c"]


def delete_message(message_id: str, me_id: str) -> None:
    with connection() as conn:
        row = conn.execute("select sender_id from messages where id = ?", (message_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "message not found")
        if row["sender_id"] != me_id:
            raise HTTPException(403, "not your message")
        conn.execute("delete from messages where id = ?", (message_id,))


# --- чистка (вызывается из erasure.py) ---


def remove_empty_chats(conn: sqlite3.Connection) -> None:
    """Участия и сообщения уходят по каскаду FK users(id); остаётся чат,
    у которого после удаления не осталось ни одного участника."""
    conn.execute("delete from chats where id not in (select chat_id from chat_members)")
