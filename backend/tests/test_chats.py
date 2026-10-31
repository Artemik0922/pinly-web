# Личные сообщения: права (чужой чат не читается), find-or-create,
# валидация текста и снапшота пина, непрочитанные, каскад удаления аккаунта.

import sqlite3

from conftest import PNG, upload

from backend.db import DB_PATH


def _start(client, cookies, user_id):
    return client.post("/api/chats", json={"userId": user_id}, cookies=cookies)


def test_start_chat_idempotent(client, register):
    a, b = register(), register()
    aid, bid = a.json()["user"]["id"], b.json()["user"]["id"]
    r1 = _start(client, a.cookies, bid)
    assert r1.status_code == 200, r1.text
    chat = r1.json()["chat"]
    assert chat["member"]["id"] == bid
    # повторно и с другой стороны — тот же чат, дублей нет
    assert _start(client, a.cookies, bid).json()["chat"]["id"] == chat["id"]
    assert _start(client, b.cookies, aid).json()["chat"]["id"] == chat["id"]
    with sqlite3.connect(DB_PATH) as conn:
        assert conn.execute("select count(*) from chats where id = ?", (chat["id"],)).fetchone()[0] == 1


def test_start_chat_guards(client, register):
    a = register()
    uid = a.json()["user"]["id"]
    assert _start(client, a.cookies, uid).status_code == 400  # сам себе
    assert _start(client, a.cookies, "no-such-user").status_code == 404
    # гость без сессии не начинает чаты
    assert client.post("/api/chats", json={"userId": uid}).status_code == 401


def test_send_text_and_pin(client, register, user):
    b = register()
    bid = b.json()["user"]["id"]
    chat_id = _start(client, user["cookies"], bid).json()["chat"]["id"]

    r = client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "text", "text": "Привет!"},
        cookies=user["cookies"],
    )
    assert r.status_code == 200, r.text
    text_msg = r.json()["message"]
    assert text_msg["kind"] == "text" and text_msg["text"] == "Привет!"
    assert text_msg["senderId"] == user["id"]

    pin = upload(user, content=PNG).json()["pin"]
    r = client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "pin", "pinId": pin["id"], "pinData": pin},
        cookies=user["cookies"],
    )
    assert r.status_code == 200, r.text
    pin_msg = r.json()["message"]
    assert pin_msg["kind"] == "pin" and pin_msg["pin"]["id"] == pin["id"]
    assert pin_msg["pin"]["card"]["title"] == pin["title"]

    # получатель видит оба сообщения по возрастанию времени
    r = client.get(f"/api/chats/{chat_id}/messages", cookies=b.cookies)
    assert r.status_code == 200, r.text
    items = r.json()["messages"]
    assert [m["id"] for m in items] == [text_msg["id"], pin_msg["id"]]


def test_send_validation(client, register, user):
    b = register()
    chat_id = _start(client, user["cookies"], b.json()["user"]["id"]).json()["chat"]["id"]
    send = lambda body: client.post(  # noqa: E731
        f"/api/chats/{chat_id}/messages", json=body, cookies=user["cookies"]
    )
    assert send({"kind": "text", "text": "   "}).status_code == 400
    assert send({"kind": "text", "text": "х" * 2001}).status_code == 400
    assert send({"kind": "pin", "pinId": "up-1"}).status_code == 400  # нет снапшота
    pin = upload(user, content=PNG).json()["pin"]
    # снапшот чужого/перепутанного id не пройдёт
    broken = dict(pin, id="up-other")
    r = send({"kind": "pin", "pinId": pin["id"], "pinData": broken})
    assert r.status_code == 400
    assert send({"kind": "sticker", "text": "?"}).status_code == 400


def test_third_user_cannot_access(client, register, user):
    b, outsider = register(), register()
    chat_id = _start(client, user["cookies"], b.json()["user"]["id"]).json()["chat"]["id"]
    for method, url in (
        ("get", f"/api/chats/{chat_id}"),
        ("get", f"/api/chats/{chat_id}/messages"),
    ):
        r = getattr(client, method)(url, cookies=outsider.cookies)
        assert r.status_code == 403, (method, url, r.text)
    r = client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "text", "text": "я не участник"},
        cookies=outsider.cookies,
    )
    assert r.status_code == 403
    # несуществующий чат — 404 даже у участника
    assert (
        client.get("/api/chats/no-such-chat", cookies=user["cookies"]).status_code == 404
    )


def test_unread_and_read(client, register, user):
    b = register()
    bid = b.json()["user"]["id"]
    chat_id = _start(client, user["cookies"], bid).json()["chat"]["id"]

    def unread(cookies):
        return client.get("/api/chats/unread", cookies=cookies).json()["unread"]

    assert unread(user["cookies"]) == 0
    assert unread(b.cookies) == 0
    client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "text", "text": "раз"},
        cookies=user["cookies"],
    )
    client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "text", "text": "два"},
        cookies=user["cookies"],
    )
    # у отправителя своих сообщений непрочитанных нет
    assert unread(user["cookies"]) == 0
    assert unread(b.cookies) == 2

    # в списке чатов у получателя тот же счётчик и превью
    items = client.get("/api/chats", cookies=b.cookies).json()["items"]
    assert len(items) == 1 and items[0]["unread"] == 2
    assert items[0]["lastMessage"]["text"] == "два"

    # после отметки — ноль, и повторная отметка не ломается
    r = client.post(f"/api/chats/{chat_id}/read", cookies=b.cookies)
    assert r.status_code == 204
    assert unread(b.cookies) == 0

    # поллинг after отдаёт только новые сообщения
    last_ms = items[0]["lastMessage"]["createdAt"]
    r = client.get(
        f"/api/chats/{chat_id}/messages", params={"after": last_ms}, cookies=b.cookies
    )
    assert r.json()["messages"] == []
    client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "text", "text": "три"},
        cookies=user["cookies"],
    )
    r = client.get(
        f"/api/chats/{chat_id}/messages", params={"after": last_ms}, cookies=b.cookies
    )
    new = r.json()["messages"]
    assert len(new) == 1 and new[0]["text"] == "три"


def test_delete_message(client, register, user):
    b = register()
    chat_id = _start(client, user["cookies"], b.json()["user"]["id"]).json()["chat"]["id"]
    msg = client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "text", "text": "удли меня"},
        cookies=user["cookies"],
    ).json()["message"]

    # чужой удалить не может
    r = client.delete(f"/api/messages/{msg['id']}", cookies=b.cookies)
    assert r.status_code == 403
    # свой — может, повторно уже 404
    assert client.delete(f"/api/messages/{msg['id']}", cookies=user["cookies"]).status_code == 204
    assert client.delete(f"/api/messages/{msg['id']}", cookies=user["cookies"]).status_code == 404
    left = client.get(f"/api/chats/{chat_id}/messages", cookies=user["cookies"]).json()
    assert left["messages"] == []


def test_account_deletion_cleans_chats(client, register, user):
    b = register()
    bid = b.json()["user"]["id"]
    chat_id = _start(client, user["cookies"], bid).json()["chat"]["id"]
    client.post(
        f"/api/chats/{chat_id}/messages",
        json={"kind": "text", "text": "привет"},
        cookies=user["cookies"],
    )
    # удаление одного участника: сообщения отправителя ушли по cascade,
    # чат жив для второго
    assert client.delete("/api/auth/account", cookies=user["cookies"]).status_code == 200
    with sqlite3.connect(DB_PATH) as conn:
        # база общая на весь прогон — считаем только свой чат
        assert (
            conn.execute(
                "select count(*) from messages where chat_id = ?", (chat_id,)
            ).fetchone()[0]
            == 0
        )
        assert (
            conn.execute(
                "select count(*) from chat_members where chat_id = ?", (chat_id,)
            ).fetchone()[0]
            == 1
        )
    items = client.get("/api/chats", cookies=b.cookies).json()["items"]
    assert items == []
    # удаление второго: чат без участников подчищается
    assert client.delete("/api/auth/account", cookies=b.cookies).status_code == 200
    with sqlite3.connect(DB_PATH) as conn:
        assert (
            conn.execute(
                "select count(*) from chats where id = ?", (chat_id,)
            ).fetchone()[0]
            == 0
        )
