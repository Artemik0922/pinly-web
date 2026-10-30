# События продукта: минимум, нужный, чтобы отличить «работает» от «мало трафика».
#
# Модель монетизации — реклама, то есть выручка = показы × CPM. Главный вопрос
#теперь не «заплатит ли мастер», а «приводит ли расшаренная доска чужих людей и
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
import sqlite3
import time
from datetime import date

from fastapi import HTTPException, Request, Response

try:
    from backend.accounts import SESSION_COOKIE, _client_ip, _db, _jwt_decode, _secret, rate_limit
except ImportError:  # запуск из каталога backend/
    from accounts import SESSION_COOKIE, _client_ip, _db, _jwt_decode, _secret, rate_limit

SCHEMA = """
create table if not exists events (
  id       integer primary key autoincrement,
  ts       real not null,
  day      text not null,
  name     text not null,
  visitor  text not null,
  user_id  text,
  board_id text,
  pin_id   text,
  category text,
  ref_host text,
  source   text
);
create index if not exists events_day_name_idx on events (day, name);
create index if not exists events_board_idx on events (board_id, day);
"""

# Белый список: name уходит и в SQL, и в сводку — произвольные строки тут не нужны.
EVENTS = ("visit", "board_view", "board_created", "pin_save", "share_copy", "signup_open")

MAX_ID_LEN = 64
MAX_REF_LEN = 80
# Одно лицо не должно накручивать показы: 300 событий за 5 минут с IP.
RATE_LIMIT = 300
RATE_WINDOW_S = 300.0


def _init() -> None:
    with _db() as conn:
        conn.executescript(SCHEMA)
        # миграция баз, созданных до появления явной метки источника
        try:
            conn.execute("alter table events add column source text")
        except sqlite3.OperationalError:
            pass  # колонка уже есть


def _visitor(request: Request) -> str:
    key = _secret() + f"{_client_ip(request)}|{date.today().isoformat()}".encode()
    return hashlib.sha256(key).hexdigest()[:24]


def _ref_host(request: Request) -> str | None:
    raw = request.headers.get("referer") or ""
    rest = raw.split("//", 1)
    if len(rest) < 2:
        return None
    return rest[1].split("/")[0][:MAX_REF_LEN] or None


def _session(request: Request) -> dict | None:
    return _jwt_decode(request.cookies.get(SESSION_COOKIE, ""))


def _user_id(request: Request) -> str | None:
    payload = _session(request)
    return str(payload["sub"])[:64] if payload and "sub" in payload else None


def _clean(value: str) -> str | None:
    trimmed = (value or "").strip()[:MAX_ID_LEN]
    return trimmed or None


def register_events(app):
    _init()

    @app.post("/api/ev")
    def event_put(
        request: Request,
        name: str = "",
        board: str = "",
        pin: str = "",
        category: str = "",
        source: str = "",
    ):
        """Приём события. Только query-параметры и никакой работы с телом:
        так отправку можно делать и fetch keepalive, и sendBeacon при уходе
        со страницы."""
        clean = (name or "").strip().lower()[:32]
        if clean not in EVENTS:
            raise HTTPException(400, "unknown event")
        rate_limit(request, "ev", limit=RATE_LIMIT, window_s=RATE_WINDOW_S)
        with _db() as conn:
            conn.execute(
                "insert into events (ts, day, name, visitor, user_id, board_id, pin_id, category, ref_host, source)"
                " values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    time.time(),
                    date.today().isoformat(),
                    clean,
                    _visitor(request),
                    _user_id(request),
                    _clean(board),
                    _clean(pin),
                    _clean(category),
                    _ref_host(request),
                    _clean(source),
                ),
            )
        return Response(status_code=204)

    @app.get("/api/ev/summary")
    def event_summary(request: Request, days: int = 7):
        """Сводка: события по дням и уникальные посетители. Агрегаты, ничего
        персонального. Доступ только сессии владельца — см. auth-проверку ниже."""
        # Сводка — про метрику, за которую платит рекламодатель: в проде её
        # видит только владелец (PINLY_OWNER_EMAIL), причём адрес не светится
        # в ответах. Локально без настроек — любой вошедший, иначе смоук
        # нельзя написать без внешнего конфига.
        payload = _session(request)
        if not payload or "sub" not in payload:
            raise HTTPException(401, "login required")
        owner = os.environ.get("PINLY_OWNER_EMAIL", "").strip().lower()
        production = os.environ.get("PINLY_ENV", "").strip().lower() == "production"
        if owner and str(payload.get("email", "")).lower() != owner:
            raise HTTPException(403, "not owner")
        if production and not owner:
            raise HTTPException(404, "summary disabled")
        window = max(1, min(int(days or 7), 90))
        since = f"-{window - 1} days"
        with _db() as conn:
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
