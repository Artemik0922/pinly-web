# Адреса для поисковой карты: карта описывает сайт, а не витрину, поэтому
# проверяем, что в неё попадают реальные пины и открытые доски, секретные —
# нет, и что наружу не уходит ничего персонального.

from conftest import upload

from backend.seo import MAX_URLS


def board(client, user, title="Работы", **fields):
    body = {"title": title}
    body.update(fields)
    return client.post("/api/boards", json=body, cookies=user["cookies"]).json()["board"]["id"]


def urls(client, **params):
    return client.get("/api/seo/urls", params=params).json()["urls"]


def test_seo_lists_public_board(client, user):
    board_id = board(client, user)
    paths = [u["path"] for u in urls(client, kind="boards")]
    assert f"/board/{board_id}" in paths


def test_seo_hides_secret_board(client, user):
    """Секретная доска для чужих не существует — и в карте её быть не должно:
    файл читается кем угодно, включая поисковик."""
    secret_id = board(client, user, title="Черновики", is_secret=True)
    paths = [u["path"] for u in urls(client, kind="boards")]
    assert f"/board/{secret_id}" not in paths


def test_seo_lists_user_pin(client, user):
    response = upload(user)
    assert response.status_code == 200, response.text
    pin_id = response.json()["pin"]["id"]
    paths = [u["path"] for u in urls(client, kind="pins")]
    assert f"/pin/{pin_id}" in paths


def test_seo_all_kinds_and_lastmod_shape(client, user):
    board(client, user)
    upload(user)
    items = urls(client)
    prefixes = {u["path"].split("/")[1] for u in items}
    assert {"board", "pin", "profile"} <= prefixes
    for item in items:
        # lastmod нужен краулеру, но выдумывать дату нельзя: это день создания
        assert len(item["lastmod"]) == 10 and item["lastmod"][4] == "-"
        assert set(item) == {"path", "lastmod"}


def test_seo_rejects_unknown_kind(client):
    assert client.get("/api/seo/urls", params={"kind": "users; drop table"}).status_code == 400


def test_seo_caps_limit(client, user):
    for i in range(3):
        board(client, user, title=f"Доска {i}")
    assert len(urls(client, kind="boards", limit=2)) <= 2
    # завышенный лимит режется на уровне бэкенда, а не клиента
    assert len(urls(client, kind="boards", limit=999999)) <= MAX_URLS


def test_seo_leaks_no_personal_data(client, user):
    """Файл публичный: в нём не должно быть ни email, ни имени, ни хешей
    посетителей — только пути и даты."""
    board(client, user, title="Доска с адресом почтовым")
    body = client.get("/api/seo/urls").text
    assert "@" not in body
    assert "example.test" not in body
