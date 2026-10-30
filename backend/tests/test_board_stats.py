# Цифры по доске для её владельца. Это единственный способ проверить главное
# допущение рекламной модели — «расшаренная доска приводит чужих людей», —
# поэтому проверяем разделение своих и чужих показов и доступ.

from backend.accounts import SESSION_COOKIE


def board(client, user, title="Работы", **fields):
    body = {"title": title}
    body.update(fields)
    return client.post("/api/boards", json=body, cookies=user["cookies"]).json()["board"]["id"]


def view(client, board_id, cookies=None, **params):
    client.post(
        "/api/ev",
        params={"name": "board_view", "board": board_id, **params},
        **({"cookies": cookies} if cookies is not None else {}),
    )


def test_board_stats_requires_login(client, user):
    board_id = board(client, user)
    assert client.get("/api/ev/board", params={"board": board_id}).status_code == 401


def test_board_stats_hidden_for_foreign_board(client, user):
    other = client.post(
        "/api/auth/register",
        json={"email": "second@example.test", "password": "secret12345", "consent": True},
    )
    client.cookies.clear()
    board_id = board(client, user)
    assert (
        client.get(
            "/api/ev/board", params={"board": board_id}, cookies=other.cookies
        ).status_code
        == 403
    )


def test_board_stats_unknown_board(client, user):
    assert (
        client.get("/api/ev/board", params={"board": "0" * 36}, cookies=user["cookies"]).status_code
        == 404
    )


def test_board_stats_requires_board_param(client, user):
    assert client.get("/api/ev/board", cookies=user["cookies"]).status_code == 400


def test_board_stats_separates_owner_views(client, user):
    """Мастер, открывший свою доску, не должен засчитываться как приведённый
    человек: иначе цифры льстят владельцу."""
    board_id = board(client, user)
    view(client, board_id, cookies=user["cookies"])
    view(client, board_id, cookies=user["cookies"])
    view(client, board_id)
    view(client, board_id)
    view(client, board_id)

    body = client.get("/api/ev/board", params={"board": board_id}, cookies=user["cookies"]).json()
    assert body["totals"]["views"] == 5
    assert body["totals"]["foreignViews"] == 3
    assert body["totals"]["activeDays"] == 1
    # все три чужих открытия приходят с одного тестового адреса в один день,
    # а посетитель — хеш «соль + ip + дата»: ровно один уникальный за сутки
    assert body["daily"][0]["visitors"] == 1
    assert body["daily"][0]["foreignViews"] == 3


def test_board_stats_counts_shared_link_source(client, user):
    board_id = board(client, user)
    view(client, board_id, source="link")
    view(client, board_id, source="link")

    body = client.get("/api/ev/board", params={"board": board_id}, cookies=user["cookies"]).json()
    hits = [s for s in body["sources"] if s["channel"] == "link"]
    assert hits and hits[0]["views"] == 2


def test_board_stats_counts_share_copies(client, user):
    board_id = board(client, user)
    client.post("/api/ev", params={"name": "share_copy", "board": board_id}, cookies=user["cookies"])

    body = client.get("/api/ev/board", params={"board": board_id}, cookies=user["cookies"]).json()
    assert body["totals"]["shares"] >= 1


def test_board_stats_exposes_no_identifiers(client, user):
    """Ответ публичен для владельца доски, но visitor — это суточный хеш,
    а реферер — чужой адрес: ни то, ни другое наружу отдавать нельзя."""
    board_id = board(client, user)
    view(client, board_id, source="vk")

    response = client.get("/api/ev/board", params={"board": board_id}, cookies=user["cookies"])
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"board", "days", "daily", "totals", "sources"}
    assert set(body["daily"][0]) == {"day", "views", "foreignViews", "visitors"}
    assert set(body["sources"][0]) == {"channel", "views", "visitors"}
    text = response.text
    for row in body["daily"]:
        assert row["day"] in text
    # хеш посетителя — 24 шестнадцатеричных знака; ни одного в ответе быть не
    # должно, независимо от того, чужой он или свой
    import re

    assert not re.search(r"\b[0-9a-f]{24}\b", text)
    assert "testclient" not in text


def test_board_stats_window_is_bounded(client, user):
    board_id = board(client, user)
    # потолок важнее, чем придирчивость к нулю: окно растёт до 90 дней и
    # не больше, а days=0 означает «не указал» и берёт значение по умолчанию
    # (тот же приём у /api/ev/summary)
    assert client.get(
        "/api/ev/board", params={"board": board_id, "days": 100000}, cookies=user["cookies"]
    ).json()["days"] == 90
    assert client.get(
        "/api/ev/board", params={"board": board_id, "days": 0}, cookies=user["cookies"]
    ).json()["days"] == 14
    assert client.get(
        "/api/ev/board", params={"board": board_id, "days": 3}, cookies=user["cookies"]
    ).json()["days"] == 3
