# Событийный контур: advertising-модель не имеет смысла без счётчика, поэтому
# проверяем то, что делает цифры честными, — валидацию, обезличивание и доступ
# к сводке.

import sqlite3

from backend.accounts import DB_PATH

def db(sql, params=()):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def test_unknown_event_rejected(client):
    assert client.post("/api/ev", params={"name": "drop_table"}).status_code == 400
    assert client.post("/api/ev", params={"name": ""}).status_code == 400


def test_event_stored_anonymously(client):
    before = db("select count(*) c from events")[0]["c"]
    assert client.post(
        "/api/ev",
        params={"name": "board_view", "board": "b-1", "source": "vk"},
    ).status_code == 204

    rows = db("select * from events order by id desc limit 1")
    assert len(rows) == 1
    row = rows[0]
    assert db("select count(*) c from events")[0]["c"] == before + 1
    assert row["name"] == "board_view"
    assert row["board_id"] == "b-1"
    assert row["source"] == "vk"
    # анонимный запрос не порождает идентификатора пользователя
    assert row["user_id"] is None
    # посетитель — короткий хеш, а не IP и не кука
    assert len(row["visitor"]) == 24 and row["visitor"].isalnum()


def test_event_attributes_known_user(client, user):
    client.post("/api/ev", params={"name": "share_copy", "board": "b-2"}, cookies=user["cookies"])
    row = db("select * from events where board_id = 'b-2'")[-1]
    assert row["user_id"] == user["id"]


def test_long_identifiers_are_truncated(client):
    needle = "x" * 300
    client.post("/api/ev", params={"name": "pin_save", "pin": needle, "category": needle})
    row = db("select * from events where name = 'pin_save' order by id desc limit 1")[0]
    assert len(row["pin_id"]) <= 64
    assert len(row["category"]) <= 64


def test_summary_breaks_board_views_by_source(client, user):
    """«Мастер приводит людей» — это источник перехода на доску. Если сводка
    его не показывает, допущение рекламной модели неизмеримо."""
    client.post(
        "/api/ev",
        params={"name": "board_view", "board": "b-src", "source": "vk"},
        cookies=user["cookies"],
    )
    body = client.get("/api/ev/summary", params={"days": 2}, cookies=user["cookies"]).json()
    hits = [x for x in body["boardViewSources"] if x["source"] == "vk"]
    assert hits and hits[0]["count"] >= 1
    assert set(hits[0]) == {"source", "count", "visitors"}


def test_summary_requires_login(client):
    assert client.get("/api/ev/summary").status_code == 401


def test_summary_locks_non_owner_and_opens_for_owner(client, user, monkeypatch):
    """Владелец сводки задаётся адресом; проверка идёт по подписанной сессии,
    поэтому лишние регистрации не троим лимит /api/auth."""
    from backend.accounts import SESSION_COOKIE, _jwt_decode

    email = _jwt_decode(user["cookies"][SESSION_COOKIE])["email"]
    monkeypatch.setenv("PINLY_OWNER_EMAIL", "vladelets@example.test")
    assert client.get("/api/ev/summary", cookies=user["cookies"]).status_code == 403

    monkeypatch.setenv("PINLY_OWNER_EMAIL", email)
    assert client.get("/api/ev/summary", cookies=user["cookies"]).status_code == 200


def test_summary_disabled_in_production_without_owner(client, user, monkeypatch):
    monkeypatch.setenv("PINLY_ENV", "production")
    monkeypatch.delenv("PINLY_OWNER_EMAIL", raising=False)
    assert client.get("/api/ev/summary", cookies=user["cookies"]).status_code == 404


def test_summary_aggregates_by_day(client, user):
    client.post("/api/ev", params={"name": "visit"}, cookies=user["cookies"])
    today = db("select day from events where name = 'visit' order by id desc limit 1")[0]["day"]

    body = client.get("/api/ev/summary", params={"days": 7}, cookies=user["cookies"]).json()
    assert body["days"] == 7
    visit = [e for e in body["events"] if e["name"] == "visit" and e["day"] == today]
    assert visit and visit[0]["count"] >= 1
    # уникальные посетители считаются отдельно от показов
    assert visit[0]["visitors"] >= 1
    # сводка не отдаёт персональных полей
    assert set(visit[0]) == {"day", "name", "count", "visitors"}
