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

from fastapi import HTTPException, Request

try:
    from backend.accounts import _db, rate_limit
except ImportError:  # запуск из каталога backend/
    from accounts import _db, rate_limit

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


def _day(ts: float) -> str:
    try:
        return date.fromtimestamp(ts).isoformat()
    except (OverflowError, OSError, ValueError):
        return date.today().isoformat()


def _urls(kind: str, limit: int) -> list[dict]:
    names = KINDS if kind == "all" else (kind,)
    urls: list[dict] = []
    with _db() as conn:
        for name in names:
            sql, prefix = QUERIES[name]
            for row in conn.execute(sql + " limit ?", (limit,)).fetchall():
                urls.append({"path": f"{prefix}{row['id']}", "lastmod": _day(row["created_at"])})
    return urls


def register_seo(app) -> None:
    @app.get("/api/seo/urls")
    def seo_urls(request: Request, kind: str = "all", limit: int = MAX_URLS):
        """Адреса для sitemap: `/pin/up-…`, `/board/<uuid>`, `/profile/<uuid>`."""
        if kind != "all" and kind not in QUERIES:
            raise HTTPException(400, "unknown kind")
        rate_limit(request, "seo", limit=RATE_LIMIT, window_s=RATE_WINDOW_S)
        return {"urls": _urls(kind, max(1, min(int(limit or MAX_URLS), MAX_URLS)))}
