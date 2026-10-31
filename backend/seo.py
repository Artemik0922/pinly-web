# Список URL для поисковой карты (sitemap.ts).
#
# Node-слой не имеет доступа к SQLite бэкенда, а карте нужны реальные
# адреса: пины пользователей, открытые доски, профили. Без этого эндпоинта
# sitemap остаётся списком мок-пинов из src/data/pins.ts, то есть описанием
# витрины, а не сайта.
#
# В ответе только пути и даты: ни названий досок, ни имён авторов, ни email —
# файл публичный и читается кем угодно.

from datetime import date

from fastapi import HTTPException

from .db import connection

# Google принимает до 50 000 адресов в карте; столько здесь нет и не будет
# долго, но потолок нужен, чтобы один запрос не вытаскивал всю базу.
MAX_URLS = 5000
RATE_LIMIT = 30
RATE_WINDOW_S = 3600.0

# Секретные доски исключены тем же условием, что в social.user_boards: для
# чужих их не существует, и в карте их быть не должно.
QUERIES = {
    "pins": ("select id, created_at from pins order by created_at desc", "/pin/"),
    "boards": (
        "select id, created_at from boards where (is_secret = 0 or is_secret is null) "
        "order by created_at desc",
        "/board/",
    ),
    "users": ("select id, created_at from users order by created_at desc", "/profile/"),
}

KINDS = tuple(QUERIES)


def check_kind(kind: str) -> None:
    if kind != "all" and kind not in QUERIES:
        raise HTTPException(400, "unknown kind")


def cap_limit(limit: int) -> int:
    """Завышенный лимит режется на стороне сервера, а не клиента."""
    return max(1, min(int(limit or MAX_URLS), MAX_URLS))


def day(ts: float) -> str:
    try:
        return date.fromtimestamp(ts).isoformat()
    except (OverflowError, OSError, ValueError):
        return date.today().isoformat()


def urls(kind: str, limit: int) -> list[dict]:
    names = KINDS if kind == "all" else (kind,)
    result: list[dict] = []
    with connection() as conn:
        for name in names:
            sql, prefix = QUERIES[name]
            for row in conn.execute(sql + " limit ?", (limit,)).fetchall():
                result.append({"path": f"{prefix}{row['id']}", "lastmod": day(row["created_at"])})
    return result
