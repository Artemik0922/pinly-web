# События продукта: таблица events. Минимум, нужный, чтобы отличить
# «работает» от «мало трафика».
#
# Модель монетизации — реклама, то есть выручка = показы × CPM. Главный вопрос
# теперь не «заплатит ли мастер», а «приводит ли расшаренная доска чужих людей и
# остаются ли они». Без счётчика на это нельзя ответить даже примерно.
#
# Приватность (152-ФЗ; свой SQLite-контур без третьих сторон):
#   - IP, email и произвольные строки клиента не сохраняются;
#   - посетитель = sha256(секрет + IP + дата): счётчик уникальных за день,
#     который нельзя склеить в историю одного человека;
#   - идентификатор пользователя пишется только для вошедших и только как UUID;
#   - из реферера остаётся только хост.

import hashlib
import os
import time
from datetime import date

from fastapi import HTTPException, Request

from . import boards
from .ratelimit import client_ip
from .session import signing_secret
from .db import connection
from .deps import session_payload

# Белый список: name уходит и в SQL, и в сводку — произвольные строки тут не нужны.
EVENTS = ("visit", "board_view", "board_created", "pin_save", "share_copy", "signup_open")

MAX_ID_LEN = 64
MAX_REF_LEN = 80
MAX_USER_ID_LEN = 64
# Одно лицо не должно накручивать показы: 300 событий за 5 минут с IP.
RATE_LIMIT = 300
RATE_WINDOW_S = 300.0
MAX_WINDOW_DAYS = 90


def clean(value: str) -> str | None:
    trimmed = (value or "").strip()[:MAX_ID_LEN]
    return trimmed or None


def check_name(name: str) -> str:
    """Имя события проверяется до лимита и до записи: мусор не должен ни
    попадать в SQL, ни расходовать счётчик клиента."""
    clean_name = (name or "").strip().lower()[:32]
    if clean_name not in EVENTS:
        raise HTTPException(400, "unknown event")
    return clean_name


def visitor(request: Request) -> str:
    key = signing_secret() + f"{client_ip(request)}|{date.today().isoformat()}".encode()
    return hashlib.sha256(key).hexdigest()[:24]


def ref_host(request: Request) -> str | None:
    raw = request.headers.get("referer") or ""
    rest = raw.split("//", 1)
    if len(rest) < 2:
        return None
    return rest[1].split("/")[0][:MAX_REF_LEN] or None


def user_id(request: Request) -> str | None:
    payload = session_payload(request)
    return str(payload["sub"])[:MAX_USER_ID_LEN] if payload and "sub" in payload else None


def record(request: Request, name: str, board: str, pin: str, category: str, source: str) -> None:
    """Записать событие. Только query-параметры и никакой работы с телом:
    так отправку можно делать и fetch keepalive, и sendBeacon при уходе
    со страницы. name — уже проверен check_name()."""
    with connection() as conn:
        conn.execute(
            "insert into events (ts, day, name, visitor, user_id, board_id, pin_id, category, ref_host, source)"
            " values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                time.time(),
                date.today().isoformat(),
                name,
                visitor(request),
                user_id(request),
                clean(board),
                clean(pin),
                clean(category),
                ref_host(request),
                clean(source),
            ),
        )


def window_days(days: int, default: int) -> int:
    """Потолок важнее, чем придирчивость к нулю: окно растёт до 90 дней и не
    больше, а days=0 означает «не указал» и берёт значение по умолчанию."""
    return max(1, min(int(days or default), MAX_WINDOW_DAYS))


def summary(request: Request, days: int) -> dict:
    """Сводка: события по дням и уникальные посетители. Агрегаты, ничего
    персонального.

    Сводка — про метрику, за которую платит рекламодатель: в проде её видит
    только владелец (PINLY_OWNER_EMAIL), причём адрес не светится в ответах.
    Локально без настроек — любой вошедший, иначе смоук нельзя написать без
    внешнего конфига.
    """
    payload = session_payload(request)
    if not payload or "sub" not in payload:
        raise HTTPException(401, "login required")
    owner = os.environ.get("PINLY_OWNER_EMAIL", "").strip().lower()
    production = os.environ.get("PINLY_ENV", "").strip().lower() == "production"
    if owner and str(payload.get("email", "")).lower() != owner:
        raise HTTPException(403, "not owner")
    if production and not owner:
        raise HTTPException(404, "summary disabled")
    window = window_days(days, 7)
    since = f"-{window - 1} days"
    with connection() as conn:
        rows = conn.execute(
            "select day, name, count(*) as c, count(distinct visitor) as visitors"
            " from events where day >= date('now', ?)"
            " group by day, name order by day desc, name",
            (since,),
        ).fetchall()
        sources = conn.execute(
            "select source, count(*) as c, count(distinct visitor) as visitors"
            " from events where name = 'board_view' and source is not null"
            " and day >= date('now', ?)"
            " group by source order by c desc limit 10",
            (since,),
        ).fetchall()
        refs = conn.execute(
            "select ref_host, count(*) as c from events"
            " where name = 'board_view' and ref_host is not null and day >= date('now', ?)"
            " group by ref_host order by c desc limit 10",
            (since,),
        ).fetchall()
    return {
        "days": window,
        "events": [
            {"day": r["day"], "name": r["name"], "count": r["c"], "visitors": r["visitors"]}
            for r in rows
        ],
        # источник (?from=) и хост реферера — два способа узнать, что доску
        # открыли не сами: ровно то, на чём стоит рекламная модель
        "boardViewSources": [
            {"source": r["source"], "count": r["c"], "visitors": r["visitors"]} for r in sources
        ],
        "boardViewReferrers": [{"host": r["ref_host"], "count": r["c"]} for r in refs],
    }


def board_stats(me_id: str, board_id_raw: str, days: int) -> dict:
    """Цифры по одной доске — только её владельцу.

    Мастеру нужен не общий трафик сайта, а ответ на один вопрос: привела ли
    расшаренная ссылка чужих людей. Поэтому свои просмотры отделены от
    чужих (иначе человек меряет себя), а в ответе только счётчики: хеш
    посетителя, ip и реферер наружу не уходят.
    """
    board_id = clean(board_id_raw)
    if not board_id:
        raise HTTPException(400, "board required")
    owner = boards.owner_id(board_id)
    if owner is None:
        raise HTTPException(404, "board not found")
    if owner != me_id:
        raise HTTPException(403, "not your board")
    window = window_days(days, 14)
    since = f"-{window - 1} days"
    external = "(user_id is null or user_id != ?)"
    with connection() as conn:
        # один проход по дням: всего показов, чужих, чужих уникальных и своих
        rows = conn.execute(
            "select day,"
            " count(*) as views,"
            f" sum(case when {external} then 1 else 0 end) as foreign_views,"
            f" count(distinct case when {external} then visitor end) as visitors"
            " from events where name = 'board_view' and board_id = ?"
            " and day >= date('now', ?)"
            " group by day order by day desc",
            (me_id, me_id, board_id, since),
        ).fetchall()
        channels = conn.execute(
            "select coalesce(source, ref_host, 'напрямую') as channel,"
            " count(*) as views, count(distinct visitor) as visitors"
            " from events where name = 'board_view' and board_id = ?"
            f" and day >= date('now', ?) and {external}"
            " group by channel order by views desc limit 8",
            (board_id, since, me_id),
        ).fetchall()
        shares = conn.execute(
            "select count(*) as c from events"
            " where name = 'share_copy' and board_id = ? and day >= date('now', ?)",
            (board_id, since),
        ).fetchone()["c"]
    return {
        "board": board_id,
        "days": window,
        "daily": [
            {
                "day": r["day"],
                "views": r["views"],
                "foreignViews": r["foreign_views"],
                "visitors": r["visitors"],
            }
            for r in rows
        ],
        "totals": {
            "views": sum(r["views"] for r in rows),
            "foreignViews": sum(r["foreign_views"] for r in rows),
            # уникальные считаются по дням: хеш посетителя привязан к дате,
            # поэтому за окно это человеко-дни, а не люди
            "visitorDays": sum(r["visitors"] for r in rows),
            "activeDays": sum(1 for r in rows if r["foreign_views"] > 0),
            "shares": shares,
        },
        "sources": [
            {"channel": r["channel"], "views": r["views"], "visitors": r["visitors"]}
            for r in channels
        ],
    }
