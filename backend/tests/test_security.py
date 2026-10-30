# Валидация ввода и раздача чужих байтов: то, что должно быть закрыто на замок.

from backend import accounts

from conftest import FAKE_PNG, PNG, upload


def test_upload_rejects_fake_image_by_signature(client, user):
    """Расширение и Content-Type присылает клиент — верим только сигнатуре."""
    response = upload(user, content=FAKE_PNG, filename="evil.png")
    assert response.status_code == 400
    assert "unsupported file type" in response.text


def test_upload_names_file_by_signature_not_by_client(client, user):
    response = upload(user, content=PNG, filename="название-от-клиента.jpg")
    assert response.status_code == 200
    source = response.json()["pin"]["sourceUrl"]
    # имя генерирует сервер, расширение — из содержимого файла
    assert source.endswith(".png")
    assert "клиент" not in source


def test_uploads_are_served_with_nosniff(client, user):
    source = upload(user, content=PNG).json()["pin"]["sourceUrl"]
    response = client.get(source)
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"].startswith("inline")


def test_img_proxy_blocks_lookalike_hosts(client):
    """Раньше пропускало evil-flickr.com: allowlist матчил конец строки."""
    # чужой хост, хост-двойник и не-https: ничего из этого не проксируется
    for url in (
        "https://evil-flickr.com/a.jpg",
        "https://notupload.wikimedia.org/x.png",
        "https://example.com/a.jpg",
    ):
        assert client.get("/api/img", params={"u": url}).status_code == 403, url
    assert client.get("/api/img", params={"u": "http://staticflickr.com/a.jpg"}).status_code == 400


def test_public_pin_payload_has_no_email(client, register):
    """Локальная часть e-mail — персональные данные, а страница пина публична."""
    response = register(display_name="")
    email = response.json()["user"]["email"]
    cookies = {"pinly_session": response.cookies["pinly_session"]}
    created = client.post(
        "/api/pins",
        files={"file": ("a.png", PNG, "image/png")},
        data={"title": "Пин без имени", "category": "Интерьер", "width": "800", "height": "1200"},
        cookies=cookies,
    )
    pin_id = created.json()["pin"]["id"]
    anonymous = client.get(f"/api/pin/{pin_id}")
    assert anonymous.status_code == 200
    assert email not in anonymous.text
    assert email.split("@")[0] not in anonymous.text
    # пользователя без имени показывает как «Пользователь»
    assert anonymous.json()["author"] == "Пользователь"


def test_comments_do_not_expose_email(client, register, user):
    author = register(display_name="Комментатор")
    pin = upload(user, content=PNG).json()["pin"]
    email = author.json()["user"]["email"]
    client.post(
        f"/api/pin/{pin['id']}/comments",
        json={"text": "есть вопрос"},
        cookies={"pinly_session": author.cookies["pinly_session"]},
    )
    listing = client.get(f"/api/pin/{pin['id']}/comments")
    assert email not in listing.text
    assert listing.json()["comments"][0]["author"]["name"] == "Комментатор"


def test_board_pin_payload_is_validated(client, user):
    """В доску кладём только карточку пина: кривой JSON ломает её отрисовку
    надолго, а чинить потом нечем."""
    board = client.post("/api/boards", json={"title": "Доска"}, cookies=user["cookies"]).json()[
        "board"
    ]["id"]
    mismatch = client.put(
        f"/api/boards/{board}/pins/pin-9",
        json={"id": "pin-другой", "title": "Пин", "width": 800, "height": 1200},
        cookies=user["cookies"],
    )
    assert mismatch.status_code == 400
    no_size = client.put(
        f"/api/boards/{board}/pins/pin-9",
        json={"id": "pin-9", "title": "Пин"},
        cookies=user["cookies"],
    )
    assert no_size.status_code == 400
    ok = client.put(
        f"/api/boards/{board}/pins/pin-9",
        json={"id": "pin-9", "title": "Пин", "width": 800, "height": 1200},
        cookies=user["cookies"],
    )
    assert ok.status_code == 204


def test_login_rate_limit(client, register):
    """Брутфорс пароля должен упираться в лимит, а не перебирать бесконечно."""
    accounts._attempts.clear()  # счётчик в памяти: тесты не должны мешать друг другу
    email = register().json()["user"]["email"]
    codes = [
        client.post(
            "/api/auth/login", json={"email": email, "password": "не-тот-пароль"}
        ).status_code
        for _ in range(25)
    ]
    assert 401 in codes
    assert 429 in codes, codes
    accounts._attempts.clear()
