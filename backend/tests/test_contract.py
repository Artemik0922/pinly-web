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


# ── Замороженный контракт: менять можно только сознательно ────────────────

# Инвентарь маршрутов. Часть путей проксирует сайт (rewrites в
# next.config.ts), часть (:8000) сейчас не зовёт никто. Без снимка удаление
# маршрута выглядит как «ничего не сломалось», потому что упавший вызов
# где-то в Node-слое в pytest не виден.
ROUTES = (
    ("DELETE", "/api/auth/account"),
    ("DELETE", "/api/boards/{board_id}"),
    ("DELETE", "/api/boards/{board_id}/pins/{pin_id}"),
    ("DELETE", "/api/comments/{comment_id}"),
    ("DELETE", "/api/likes/{pin_id}"),
    ("DELETE", "/api/media/{media_id}"),
    ("DELETE", "/api/messages/{message_id}"),
    ("DELETE", "/api/pins/{pin_id}"),
    ("DELETE", "/api/users/{user_id}/follow"),
    ("GET", "/api/auth/me"),
    ("GET", "/api/boards"),
    ("GET", "/api/boards/{board_id}/public"),
    ("GET", "/api/chats"),
    ("GET", "/api/chats/unread"),
    ("GET", "/api/chats/{chat_id}"),
    ("GET", "/api/chats/{chat_id}/messages"),
    ("GET", "/api/ev/board"),
    ("GET", "/api/ev/summary"),
    ("GET", "/api/feed"),
    ("GET", "/api/feed/subscriptions"),
    ("GET", "/api/img"),
    ("GET", "/api/img/download"),
    ("GET", "/api/likes"),
    ("GET", "/api/mealdb/list"),
    ("GET", "/api/mealdb/lookup"),
    ("GET", "/api/media"),
    ("GET", "/api/media/external"),
    ("GET", "/api/notifications"),
    ("GET", "/api/notifications/count"),
    ("GET", "/api/pin/{pin_id}"),
    ("GET", "/api/pin/{pin_id}/comments"),
    ("GET", "/api/pin/{pin_id}/related"),
    ("GET", "/api/saves-count"),
    ("GET", "/api/seo/urls"),
    ("GET", "/api/taste/pins"),
    ("GET", "/api/uploads/{name}"),
    ("GET", "/api/user-pins"),
    ("GET", "/api/users/{user_id}"),
    ("GET", "/api/users/{user_id}/boards"),
    ("GET", "/api/users/{user_id}/pins"),
    ("GET", "/healthz"),
    ("PATCH", "/api/auth/me"),
    ("PATCH", "/api/boards/{board_id}"),
    ("PATCH", "/api/pins/{pin_id}"),
    ("POST", "/api/auth/avatar"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/boards"),
    ("POST", "/api/chats"),
    ("POST", "/api/chats/{chat_id}/messages"),
    ("POST", "/api/chats/{chat_id}/read"),
    ("POST", "/api/ev"),
    ("POST", "/api/media"),
    ("POST", "/api/media/external"),
    ("POST", "/api/media/url"),
    ("POST", "/api/notifications/read-all"),
    ("POST", "/api/pin/{pin_id}/comments"),
    ("POST", "/api/pins"),
    ("POST", "/api/pins/from-url"),
    ("POST", "/api/users/{user_id}/follow"),
    ("PUT", "/api/boards/{board_id}/pins/{pin_id}"),
    ("PUT", "/api/boards/{board_id}/secret"),
    ("PUT", "/api/likes/{pin_id}"),
)


def test_route_inventory_is_frozen(client):
    spec = client.get("/openapi.json").json()
    got = {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops}
    assert got == set(ROUTES), f"маршрутов стало больше/меньше: {got ^ set(ROUTES)}"


def test_event_names_are_frozen():
    """name уходит и в SQL, и в сводку — произвольные строки тут не нужны.
    Добавление события (pin_view, report) = правка этого кортежа и строки
    выше, а не тихий сдвиг."""
    from backend import events

    assert events.EVENTS == (
        "visit",
        "pin_view",
        "board_view",
        "board_created",
        "pin_save",
        "share_copy",
        "signup_open",
    )


def test_public_board_card_shape(client, user):
    """На этот ответ соберётся серверный рендер доски: имена ключей
    load-bearing, их разбирают и meta.ts, и BoardView."""
    pin = upload(user, content=PNG).json()["pin"]
    board_id = client.post(
        "/api/boards", json={"title": "Витрина"}, cookies=user["cookies"]
    ).json()["board"]["id"]
    client.put(f"/api/boards/{board_id}/pins/{pin['id']}", json={**pin}, cookies=user["cookies"])

    # анонимом, без сессии: публичная доска доступна чужим (и краулеру)
    data = client.get(f"/api/boards/{board_id}/public").json()["board"]
    assert set(data) == {"id", "title", "createdAt", "isSecret", "pinsCount", "pins", "owner"}
    assert data["isSecret"] is False and data["pinsCount"] == 1
    assert data["pins"] == [pin]
    # имя при регистрации не заполняли — наружу идёт заглушка, а не почта
    assert data["owner"]["name"] == "Пользователь"


def test_secret_board_is_404_even_for_owner(client, user):
    """Секретная доска не существует для /public ни для кого — серверный
    рендер не должен это «чинить»."""
    board_id = client.post(
        "/api/boards", json={"title": "Личное", "is_secret": True}, cookies=user["cookies"]
    ).json()["board"]["id"]
    assert client.get(f"/api/boards/{board_id}/public").status_code == 404
    assert client.get(f"/api/boards/{board_id}/public", cookies=user["cookies"]).status_code == 404


def test_profile_card_has_no_personal_fields(client, register):
    account = register(display_name="Мастер")
    cookies = {"pinly_session": account.cookies["pinly_session"]}
    uid = client.get("/api/auth/me", cookies=cookies).json()["user"]["id"]

    profile = client.get(f"/api/users/{uid}").json()["user"]
    assert set(profile) == {
        "id",
        "displayName",
        "avatarUrl",
        "pinsCount",
        "boardsCount",
        "followers",
        "following",
        "isFollowing",
        "isSelf",
        "createdAt",
    }
    assert profile["displayName"] == "Мастер"
    assert profile["isSelf"] is False  # аноним — никогда не «сам себе»
    assert "email" not in str(profile)


def test_user_pins_without_limit_returns_everything(client, user):
    """Отсутствие ?limit= = все пины, как до появления параметра. Это дефолт,
    на него опираются клиентские экраны (свой профиль показывает загрузки
    целиком), поэтому он под замком даже теперь, когда кадрирование есть.
    Порядок (created_at desc) при одинаковых таймстампах неустойчив,
    поэтому сравниваем множество, а не последовательность."""
    ids = {upload(user, title=f"Пин {i}").json()["pin"]["id"] for i in range(3)}
    got = client.get(f"/api/users/{user['id']}/pins").json()["pins"]
    assert {p["id"] for p in got} == ids and len(got) == 3


def test_user_pins_limit_trims_but_does_not_reorder(client, user):
    """?limit= только режет хвост: первые N — те же самые пины, что и без
    параметра. Профиль рендерится этим срезом, и «первая страница» обязана
    совпадать с тем, что отдаёт полный список."""
    for i in range(5):
        upload(user, title=f"Пин {i}")
    full = client.get(f"/api/users/{user['id']}/pins").json()["pins"]
    page = client.get(f"/api/users/{user['id']}/pins", params={"limit": 3}).json()["pins"]
    assert len(page) == 3
    assert [p["id"] for p in page] == [p["id"] for p in full[:3]]


def test_user_pins_limit_bounds(client, user):
    """За пределом потолка — 422, а не тихое «вернули 200»: молчаливое
    округление клиент прочитал бы как «у мастера всего 200 пинов»."""
    assert client.get(f"/api/users/{user['id']}/pins", params={"limit": 201}).status_code == 422
    assert client.get(f"/api/users/{user['id']}/pins", params={"limit": 0}).status_code == 422
