# Лайки: таблица likes — пара (user_id, pin_id).
#
# pin_id строковой и ни на что не ссылается: лайкают и внешние пины (ov-…,
# wc-…), у которых нет строки в pins. Поэтому каскад «удалить пин» не может
# положиться на FK и собирает строки сам (erasure.py).

import sqlite3
import time

from .db import connection


def list_pin_ids(user_id: str) -> list[str]:
    with connection() as conn:
        rows = conn.execute(
            "select pin_id from likes where user_id = ? order by created_at desc", (user_id,)
        ).fetchall()
        return [r["pin_id"] for r in rows]


def add(user_id: str, pin_id: str) -> None:
    with connection() as conn:
        conn.execute(
            "insert or ignore into likes (user_id, pin_id, created_at) values (?, ?, ?)",
            (user_id, pin_id, time.time()),
        )


def remove(user_id: str, pin_id: str) -> None:
    with connection() as conn:
        conn.execute("delete from likes where user_id = ? and pin_id = ?", (user_id, pin_id))


def count(conn: sqlite3.Connection, pin_id: str) -> int:
    """Счётчик для карточки пина: работает на чужом соединении, чтобы не
    плодить запросы внутри одного ответа."""
    return conn.execute(
        "select count(*) as c from likes where pin_id = ?", (pin_id,)
    ).fetchone()["c"]


def count_map(conn: sqlite3.Connection, pin_ids: list[str]) -> dict[str, int]:
    """Те же счётчики одним запросом на всю выборку: пины в ленте и на
    профиле идут списком, и по запросту на карточку их быстро не отдают."""
    if not pin_ids:
        return {}
    placeholders = ",".join("?" * len(pin_ids))
    rows = conn.execute(
        f"select pin_id, count(*) as c from likes where pin_id in ({placeholders}) group by pin_id",
        pin_ids,
    ).fetchall()
    found = {row["pin_id"]: row["c"] for row in rows}
    return {pin_id: found.get(pin_id, 0) for pin_id in pin_ids}


# --- чистка (вызывается из erasure.py) ---


def remove_pin_rows(conn: sqlite3.Connection, pin_id: str) -> None:
    conn.execute("delete from likes where pin_id = ?", (pin_id,))


def remove_user_rows(conn: sqlite3.Connection, user_id: str) -> None:
    """Свои лайки — в том числе под чужими пинами."""
    conn.execute("delete from likes where user_id = ?", (user_id,))


def remove_rows_of_user_pins(conn: sqlite3.Connection, user_id: str) -> None:
    """Чужие лайки под своими пинами."""
    conn.execute(
        "delete from likes where pin_id in (select id from pins where user_id = ?)",
        (user_id,),
    )
