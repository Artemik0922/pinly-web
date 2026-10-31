# Доски и их содержимое: таблицы boards и board_pins.
#
# board_pins хранит снапшот карточки пина (pin_data), а не ссылку: пин может
# быть внешним (ov-…) или вообще удалённым, а доска обязана остаться
# читаемой. Снапшот проверяется в schemas.pin_card_json — тот же каркас, что
# у пинов в сообщениях чата.
#
# Функции без conn открывают своё соединение (их зовёт слой маршрутов), функции
# с conn работают внутри уже начатой транзакции — так их зовут соседи по домену
# и erasure.py.

import json
import sqlite3
import time
import uuid

from fastapi import HTTPException

from . import accounts
from .db import connection

# Сколько пинов доски отдаёт список /api/boards: контекст досок живёт на
# каждой странице, поэтому полный payload большой доски не должен весить
# мегабайты. (Страница доски показывает эти же пины; свыше лимита — только
# в счётчике.)
BOARD_PREVIEW_PINS = 60
MAX_TITLE_LEN = 80


def board_title(raw: str) -> str:
    return raw.strip()[:MAX_TITLE_LEN] or "Новая доска"


def is_secret(board: sqlite3.Row) -> bool:
    return bool(board["is_secret"]) if "is_secret" in board.keys() else False


def board_json(conn: sqlite3.Connection, board: sqlite3.Row) -> dict:
    pins = conn.execute(
        "select pin_id, pin_data from board_pins where board_id = ? order by added_at desc limit ?",
        (board["id"], BOARD_PREVIEW_PINS),
    ).fetchall()
    total = conn.execute(
        "select count(*) as c from board_pins where board_id = ?", (board["id"],)
    ).fetchone()["c"]
    return {
        "id": board["id"],
        "title": board["title"],
        "createdAt": int(board["created_at"] * 1000),
        "isSecret": is_secret(board),
        # pins — срез до BOARD_PREVIEW_PINS, поэтому счётчик показываем по
        # полному количеству, а не по длине среза
        "pinsCount": total,
        "pins": [json.loads(p["pin_data"]) for p in pins],
    }


def own_board(conn: sqlite3.Connection, user_id: str, board_id: str) -> sqlite3.Row:
    board = conn.execute(
        "select * from boards where id = ? and user_id = ?", (board_id, user_id)
    ).fetchone()
    if board is None:
        raise HTTPException(404, "board not found")
    return board


def owner_id(board_id: str) -> str | None:
    """Владелец доски; None — доски нет (нужно статистике событий)."""
    with connection() as conn:
        row = conn.execute("select user_id from boards where id = ?", (board_id,)).fetchone()
        return row["user_id"] if row else None


def list_mine(user_id: str) -> list[dict]:
    with connection() as conn:
        boards = conn.execute(
            "select * from boards where user_id = ? order by created_at asc", (user_id,)
        ).fetchall()
        return [board_json(conn, b) for b in boards]


def list_public(conn: sqlite3.Connection, user_id: str) -> list[dict]:
    """Публичные (не секретные) доски пользователя."""
    boards = conn.execute(
        "select * from boards where user_id = ? and (is_secret = 0 or is_secret is null) "
        "order by created_at asc",
        (user_id,),
    ).fetchall()
    return [board_json(conn, b) for b in boards]


def public_user_boards(user_id: str) -> list[dict]:
    with connection() as conn:
        return list_public(conn, user_id)


def create(user_id: str, title_raw: str, secret: bool, if_missing: bool) -> dict:
    """Завести доску; if_missing — «найти такую же по названию и вернуть».

    Повтор нужен потому, что стартовые доски клиент заводит при первом входе,
    а двойное монтирование страницы плодит копии с одинаковым названием.
    """
    title = board_title(title_raw)
    board_id = str(uuid.uuid4())
    with connection() as conn:
        if if_missing:
            existing = conn.execute(
                "select * from boards where user_id = ? and title = ?", (user_id, title)
            ).fetchone()
            if existing is not None:
                return board_json(conn, existing)
        conn.execute(
            "insert into boards (id, user_id, title, created_at, is_secret) values (?, ?, ?, ?, ?)",
            (board_id, user_id, title, time.time(), 1 if secret else 0),
        )
        board = conn.execute("select * from boards where id = ?", (board_id,)).fetchone()
        return board_json(conn, board)


def rename(user_id: str, board_id: str, title_raw: str) -> dict:
    with connection() as conn:
        own_board(conn, user_id, board_id)
        conn.execute("update boards set title = ? where id = ?", (board_title(title_raw), board_id))
        board = conn.execute("select * from boards where id = ?", (board_id,)).fetchone()
        return board_json(conn, board)


def delete(user_id: str, board_id: str) -> None:
    """Строки board_pins уходят по каскаду FK boards(id)."""
    with connection() as conn:
        own_board(conn, user_id, board_id)
        conn.execute("delete from boards where id = ?", (board_id,))


def save_pin(user_id: str, board_id: str, pin_id: str, card: str) -> None:
    with connection() as conn:
        own_board(conn, user_id, board_id)
        conn.execute(
            "insert into board_pins (board_id, pin_id, pin_data, added_at) values (?, ?, ?, ?) "
            "on conflict (board_id, pin_id) do update set pin_data = excluded.pin_data",
            (board_id, pin_id, card, time.time()),
        )


def unsave_pin(user_id: str, board_id: str, pin_id: str) -> None:
    with connection() as conn:
        own_board(conn, user_id, board_id)
        conn.execute("delete from board_pins where board_id = ? and pin_id = ?", (board_id, pin_id))


def public_board(board_id: str) -> dict:
    """Доска для read-only просмотра чужими: секретных для них не существует."""
    with connection() as conn:
        board = conn.execute("select * from boards where id = ?", (board_id,)).fetchone()
        if board is None or is_secret(board):
            raise HTTPException(404, "board not found")
        owner = accounts.user_row(conn, board["user_id"])
        data = board_json(conn, board)
        data["owner"] = {"id": owner["id"], "name": owner["display_name"] or "Пользователь"}
        return data


def toggle_secret(user_id: str, board_id: str) -> bool:
    """Переключить секретность своей доски."""
    with connection() as conn:
        board = own_board(conn, user_id, board_id)
        new_val = 0 if is_secret(board) else 1
        conn.execute("update boards set is_secret = ? where id = ?", (new_val, board_id))
        return bool(new_val)


def saved_pin_ids(user_id: str) -> list[str]:
    """Id пинов, сохранённых в доски пользователя (вектор вкуса)."""
    with connection() as conn:
        rows = conn.execute(
            "select distinct bp.pin_id from board_pins bp "
            "join boards b on b.id = bp.board_id where b.user_id = ?",
            (user_id,),
        ).fetchall()
        return [r["pin_id"] for r in rows]


def count_saves(conn: sqlite3.Connection, pin_id: str) -> int:
    return conn.execute(
        "select count(*) as c from board_pins where pin_id = ?", (pin_id,)
    ).fetchone()["c"]

def save_count_map(conn: sqlite3.Connection, pin_ids: list[str]) -> dict[str, int]:
    """Сохранения списком: один группировочный запрос вместо N."""
    if not pin_ids:
        return {}
    placeholders = ",".join("?" * len(pin_ids))
    rows = conn.execute(
        f"select pin_id, count(*) as c from board_pins where pin_id in ({placeholders}) "
        "group by pin_id",
        pin_ids,
    ).fetchall()
    found = {row["pin_id"]: row["c"] for row in rows}
    return {pin_id: found.get(pin_id, 0) for pin_id in pin_ids}


def save_counts(pin_ids: list[str]) -> dict[str, int]:
    """Счётчик сохранений для произвольных пинов: нужен Node-версии для SSR
    страниц Openverse/моков."""
    with connection() as conn:
        return save_count_map(conn, pin_ids)


def count_public(conn: sqlite3.Connection, user_id: str) -> int:
    return conn.execute(
        "select count(*) as c from boards where user_id = ? and (is_secret = 0 or is_secret is null)",
        (user_id,),
    ).fetchone()["c"]


def recent_public_boards(conn: sqlite3.Connection, user_ids: list[str], limit: int) -> list[dict]:
    """Доски пользователей из подписок — лента /api/feed/subscriptions."""
    placeholders = ",".join("?" for _ in user_ids)
    rows = conn.execute(
        f"select * from boards where user_id in ({placeholders}) "
        "and (is_secret = 0 or is_secret is null) order by created_at desc limit ?",
        [*user_ids, limit],
    ).fetchall()
    return [board_json(conn, b) for b in rows]


# --- чистка (вызывается из erasure.py) ---


def remove_pin_rows(conn: sqlite3.Connection, pin_id: str) -> None:
    conn.execute("delete from board_pins where pin_id = ?", (pin_id,))


def remove_rows_of_user_pins(conn: sqlite3.Connection, user_id: str) -> None:
    """Вложения своих пинов в чужих досках: board_pins не имеет FK на pins."""
    conn.execute(
        "delete from board_pins where pin_id in (select id from pins where user_id = ?)",
        (user_id,),
    )
