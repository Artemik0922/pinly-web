# Права доступа, каскады и ключи кэша: то, что молча ломает данные.

import sqlite3

from backend.accounts import DB_PATH

from conftest import PNG, upload


def db(sql, params=()):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def test_secret_board_is_invisible_to_others(client, user, register):
    owner_cookies = user["cookies"]
    secret = client.post(
        "/api/boards",
        json={"title": "Личное", "is_secret": True},
        cookies=owner_cookies,
    ).json()["board"]
    assert secret["isSecret"] is True

    other = register(display_name="Читатель")
    other_cookies = {"pinly_session": other.cookies["pinly_session"]}

    listed = client.get(f"/api/users/{user['id']}/boards", cookies=other_cookies)
    assert [b["id"] for b in listed.json()["boards"]] == []
    # для чужого аккаунта секретной доски не существует вообще
    assert client.get(f"/api/boards/{secret['id']}/public", cookies=other_cookies).status_code == 404
    # владелец видит её в своём списке
    mine = client.get("/api/boards", cookies=owner_cookies).json()["boards"]
    assert any(b["id"] == secret["id"] and b["isSecret"] for b in mine)


def test_seed_boards_are_idempotent(client, user):
    """Клиент создаёт стартовые доски при первом входе; повторный вызов не
    должен плодить копии с одинаковым названием."""
    first = client.post(
        "/api/boards", json={"title": "Идеи для дома", "if_missing": True}, cookies=user["cookies"]
    ).json()["board"]
    second = client.post(
        "/api/boards", json={"title": "Идеи для дома", "if_missing": True}, cookies=user["cookies"]
    ).json()["board"]
    assert first["id"] == second["id"]
    plain = client.post(
        "/api/boards", json={"title": "Идеи для дома"}, cookies=user["cookies"]
    ).json()["board"]
    assert plain["id"] != first["id"]


def test_taste_pins_requires_session_and_lists_both_sources(client, user):
    assert client.get("/api/taste/pins").json() == {"userId": None, "likeIds": [], "saveIds": []}

    pin = upload(user, content=PNG).json()["pin"]
    cookies = user["cookies"]
    client.put(f"/api/likes/{pin['id']}", cookies=cookies)
    board = client.post("/api/boards", json={"title": "Доска"}, cookies=cookies).json()["board"]["id"]
    client.put(
        f"/api/boards/{board}/pins/{pin['id']}",
        json={**pin},
        cookies=cookies,
    )
    taste = client.get("/api/taste/pins", cookies=cookies).json()
    assert taste["userId"] == user["id"]
    assert pin["id"] in taste["likeIds"]
    assert pin["id"] in taste["saveIds"]


def test_deleting_pin_removes_comments_likes_and_saves(client, user):
    pin = upload(user, content=PNG).json()["pin"]
    cookies = user["cookies"]
    client.post(f"/api/pin/{pin['id']}/comments", json={"text": "интересно"}, cookies=cookies)
    board = client.post("/api/boards", json={"title": "Доска"}, cookies=cookies).json()["board"]["id"]
    client.put(f"/api/boards/{board}/pins/{pin['id']}", json={**pin}, cookies=cookies)

    assert client.delete(f"/api/pins/{pin['id']}", cookies=cookies).status_code == 204
    assert db("select * from comments where pin_id = ?", (pin["id"],)) == []
    assert db("select * from board_pins where pin_id = ?", (pin["id"],)) == []
    assert db("select * from pins where id = ?", (pin["id"],)) == []


def test_deleting_account_removes_all_personal_rows(client, register):
    """152-ФЗ: по запросу удаляются и строки, и файлы. consent_log остаётся —
    это доказательство факта согласия, а не персональные данные."""
    account = register(display_name="Уходим")
    cookies = {"pinly_session": account.cookies["pinly_session"]}
    user_id = account.json()["user"]["id"]

    pin = client.post(
        "/api/pins",
        files={"file": ("a.png", PNG, "image/png")},
        data={"title": "Мой пин", "category": "Интерьер", "width": "800", "height": "1200"},
        cookies=cookies,
    ).json()["pin"]
    board = client.post("/api/boards", json={"title": "Доска"}, cookies=cookies).json()["board"]["id"]
    client.put(f"/api/boards/{board}/pins/{pin['id']}", json={**pin}, cookies=cookies)
    client.post(f"/api/pin/{pin['id']}/comments", json={"text": "комментарий"}, cookies=cookies)

    assert client.delete("/api/auth/account", cookies=cookies).status_code == 200
    assert db("select * from users where id = ?", (user_id,)) == []
    assert db("select * from pins where user_id = ?", (user_id,)) == []
    assert db("select * from boards where user_id = ?", (user_id,)) == []
    assert db("select * from comments where user_id = ?", (user_id,)) == []
    assert db("select * from comments where pin_id = ?", (pin["id"],)) == []
    assert db("select * from board_pins where pin_id = ?", (pin["id"],)) == []
    assert db("select * from likes where user_id = ?", (user_id,)) == []


def test_cache_keys_for_cyrillic_queries_do_not_collide():
    """Ключи чистились заменой всего кроме латиницы на «_» — два разных
    кириллических запроса попадали в один файл и отдавали чужую выдачу."""
    from backend.cache import cache_path

    a = cache_path("ov:кошки:1:20")
    b = cache_path("ov:собаки:1:20")
    assert a != b
    assert a.name.endswith(".json") and len(a.stem) == 40


def test_follow_is_its_own_toggle_and_counts_are_public(client, user, register):
    follower = register(display_name="Подписчик")
    cookies = {"pinly_session": follower.cookies["pinly_session"]}
    target = user["id"]

    assert client.post(f"/api/users/{target}/follow", cookies=cookies).status_code == 200
    profile = client.get(f"/api/users/{target}", cookies=cookies).json()["user"]
    assert profile["followers"] == 1 and profile["isFollowing"] is True
    # подписки видны подписчику в его ленте
    assert client.get("/api/feed/subscriptions", cookies=cookies).json()["boards"] is not None

    assert client.delete(f"/api/users/{target}/follow", cookies=cookies).status_code == 200
    assert client.get(f"/api/users/{target}").json()["user"]["followers"] == 0
