# Контракт после рефакторинга: форма ответов и общий каркас проверки
# снапшота карточки пина (доска и сообщение чата теперь один и тот же код).
# Порядок маршрутов тоже под защитой: статические сегменты обязаны объявляться
# раньше параметрических.

from conftest import PNG, upload

BIG = "x" * (70 * 1024)


def test_register_returns_the_same_user_card_as_me(client, register):
    """Ответ регистрации идёт тем же сериализатором, что и /api/auth/me:
    поле avatarUrl в нём есть всегда, клиент не разбирает два разных профиля."""
    account = register(display_name="Ася")
    cookies = {"pinly_session": account.cookies["pinly_session"]}
    me = client.get("/api/auth/me", cookies=cookies).json()["user"]
    assert account.json()["user"] == me


def test_board_rename_returns_full_card(client, user):
    cookies = user["cookies"]
    pin = upload(user, content=PNG).json()["pin"]
    board_id = client.post("/api/boards", json={"title": "Доска"}, cookies=cookies).json()["board"]["id"]
    client.put(f"/api/boards/{board_id}/pins/{pin['id']}", json={**pin}, cookies=cookies)

    renamed = client.patch(f"/api/boards/{board_id}", json={"title": "Новое"}, cookies=cookies).json()["board"]
    listed = next(b for b in client.get("/api/boards", cookies=cookies).json()["boards"] if b["id"] == board_id)
    renamed["title"] = listed["title"] = "одно и то же"
    assert renamed == listed


def test_pin_snapshot_rule_is_shared_between_board_and_chat(client, user, register):
    """Один и тот же брак карточки отбивается одинаково в доске и в чате."""
    other = register(display_name="Собеседник")
    chat_id = client.post(
        "/api/chats", json={"userId": other.json()["user"]["id"]}, cookies=user["cookies"]
    ).json()["chat"]["id"]
    board_id = client.post("/api/boards", json={"title": "Д"}, cookies=user["cookies"]).json()["board"]["id"]

    def send(card, pin_id="pin-9"):
        return client.put(
            f"/api/boards/{board_id}/pins/{pin_id}", json=card, cookies=user["cookies"]
        ).status_code, client.post(
            f"/api/chats/{chat_id}/messages",
            json={"kind": "pin", "pinId": pin_id, "pinData": card},
            cookies=user["cookies"],
        ).status_code

    # чужой id карточки и размеры строкой — оба эндпоинта отвечают 400
    assert send({"id": "pin-другой", "title": "Пин", "width": 800, "height": 1200}) == (400, 400)
    assert send({"id": "pin-9", "title": "Пин", "width": "800", "height": 1200}) == (400, 400)
    # перекормленная карточка — 413, а не 400: потолок важнее формы
    assert send({"id": "pin-9", "title": "Пин", "width": 800, "height": 1200, "blob": BIG}) == (413, 413)


def test_static_paths_win_over_param_paths(client, user):
    """Порядок регистрации маршрутов load-bearing: эти два ответа теряются,
    если /api/chats/{chat_id} или /api/media/{media_id} окажутся раньше."""
    assert client.get("/api/chats/unread", cookies=user["cookies"]).json() == {"unread": 0}
    assert client.get("/api/media/external").json() == {"enabled": False}
