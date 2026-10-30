# Личные уведомления: адресат, индивидуальность и жизненный цикл.
#
# Ключевые гарантии: чужие уведомления недоступны, свои действия не
# уведомляют, внешний пин (без владельца в pins) уведомлений не создаёт,
# повторные события не спамят, удаление пина чистит уведомления.

from conftest import PNG, upload


def _other(client, register):
    """Второй пользователь со своими куками."""
    other = register(display_name="Другой")
    return {"cookies": {"pinly_session": other.cookies["pinly_session"]}, "id": other.json()["user"]["id"]}


def test_like_and_comment_notify_owner(client, user, register):
    owner_cookies = user["cookies"]
    pin = upload(user, content=PNG).json()["pin"]

    other = _other(client, register)
    client.put(f"/api/likes/{pin['id']}", cookies=other["cookies"])
    client.post(
        f"/api/pin/{pin['id']}/comments",
        json={"text": "Отличный кадр"},
        cookies=other["cookies"],
    )

    items = client.get("/api/notifications", cookies=owner_cookies).json()["items"]
    types = [i["type"] for i in items]
    assert "like" in types and "comment" in types
    like = next(i for i in items if i["type"] == "like")
    assert like["actor"]["id"] == other["id"]
    assert like["pin"]["id"] == pin["id"]
    assert like["read"] is False


def test_follow_notifies_and_own_actions_do_not(client, user, register):
    other = _other(client, register)
    # чужая подписка на меня
    client.post(f"/api/users/{user['id']}/follow", cookies=other["cookies"])
    items = client.get("/api/notifications", cookies=user["cookies"]).json()["items"]
    assert any(i["type"] == "follow" and i["actor"]["id"] == other["id"] for i in items)

    # своё действие уведомления не создаёт: лайк своего пина
    pin = upload(user, content=PNG).json()["pin"]
    client.put(f"/api/likes/{pin['id']}", cookies=user["cookies"])
    items = client.get("/api/notifications", cookies=user["cookies"]).json()["items"]
    assert not any(i["type"] == "like" for i in items)


def test_notifications_are_individual(client, user, register):
    """Чужие уведомления не читаются ни по какому id: список строго по сессии."""
    pin = upload(user, content=PNG).json()["pin"]
    other = _other(client, register)
    client.put(f"/api/likes/{pin['id']}", cookies=other["cookies"])

    owner_items = client.get("/api/notifications", cookies=user["cookies"]).json()
    assert owner_items["unread"] >= 1
    # у «другого» ничего нет, без сессии — 401
    assert client.get("/api/notifications", cookies=other["cookies"]).json()["items"] == []
    assert client.get("/api/notifications").status_code == 401


def test_external_pin_like_creates_no_notification(client, user, register):
    """Лайк внешнего пина (нет строки в pins) — уведомление не создаётся."""
    other = _other(client, register)
    client.put("/api/likes/wc-123", cookies=other["cookies"])
    other2 = _other(client, register)
    assert client.get("/api/notifications", cookies=other2["cookies"]).json()["items"] == []


def test_save_to_board_notifies_once_until_read(client, user, register):
    pin = upload(user, content=PNG).json()["pin"]
    other = _other(client, register)
    board = client.post("/api/boards", json={"title": "Д"}, cookies=other["cookies"]).json()["board"]["id"]
    client.put(f"/api/boards/{board}/pins/{pin['id']}", json={**pin}, cookies=other["cookies"])
    client.delete(f"/api/boards/{board}/pins/{pin['id']}", cookies=other["cookies"])
    # повторное сохранение, пока старое не прочитано — второй записи нет
    client.put(f"/api/boards/{board}/pins/{pin['id']}", json={**pin}, cookies=other["cookies"])

    data = client.get("/api/notifications", cookies=user["cookies"]).json()
    saves = [i for i in data["items"] if i["type"] == "save"]
    assert len(saves) == 1

    # прочтение: счётчик обнуляется, записи остаются
    client.post("/api/notifications/read-all", cookies=user["cookies"])
    after = client.get("/api/notifications", cookies=user["cookies"]).json()
    assert after["unread"] == 0
    assert len([i for i in after["items"] if i["type"] == "save"]) == 1
    assert all(i["read"] for i in after["items"])


def test_pin_deletion_cleans_notifications(client, user, register):
    pin = upload(user, content=PNG).json()["pin"]
    other = _other(client, register)
    client.put(f"/api/likes/{pin['id']}", cookies=other["cookies"])
    assert client.get("/api/notifications", cookies=user["cookies"]).json()["unread"] == 1

    client.delete(f"/api/pins/{pin['id']}", cookies=user["cookies"])
    assert client.get("/api/notifications", cookies=user["cookies"]).json()["items"] == []


def test_count_endpoint_matches_list(client, user, register):
    assert client.get("/api/notifications/count").status_code == 401
    pin = upload(user, content=PNG).json()["pin"]
    other = _other(client, register)
    client.post(f"/api/users/{user['id']}/follow", cookies=other["cookies"])
    assert client.get("/api/notifications/count", cookies=user["cookies"]).json()["unread"] == 1
