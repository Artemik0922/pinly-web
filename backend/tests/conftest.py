# Тестовый контур Python-бэкенда.
#
# Запуск из каталога web:
#   pip install -r backend/requirements-dev.txt
#   python -m pytest backend/tests -q
#
# Сеть не трогается намеренно: Openverse и эмбеддинги проверяются смоуком в
# браузере, а здесь — только то, что обязано работать и без них (валидация,
# права доступа, каскады, ключи кэша).

import itertools
import os
import tempfile

# Каталог данных подменяется ДО импорта приложения: пути вычисляются
# в момент импорта backend.accounts.
os.environ["PINLY_DATA_DIR"] = tempfile.mkdtemp(prefix="pinly-tests-")
os.environ["PINLY_JWT_SECRET"] = "test-secret-0123456789"
# 600k итераций PBKDF2 на каждый вход — это минута на прогон; в тестах хватает
# минимума, проверяется же логика, а не стойкость хеша.
os.environ["PINLY_PBKDF2_ITERS"] = "1000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app  # noqa: E402

def _png(width: int = 1, height: int = 1) -> bytes:
    """Настоящий PNG без внешних зависимостей: CRC должны сходиться, иначе
    detect_image_ext правомерно отклоняет файл."""
    import struct
    import zlib

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for _ in range(height):
        raw.append(0)
        raw += bytes((47, 191, 155)) * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


PNG = _png()
# не картинка с расширением .png — классическая подмена типа
FAKE_PNG = b"<html><script>alert(1)</script></html>"


@pytest.fixture(scope="session")
def client():
    """Один клиент на сессию: lifespan (настройка БД и логов) выполняется раз."""
    with TestClient(app) as c:
        yield c


# счётчик на весь прогон: почта должна быть уникальной и между тестами
_counter = itertools.count(1)


@pytest.fixture
def register(client):
    """Фабрика аккаунтов: каждый вызов — новый пользователь и свой cookie-джар."""

    def make(**fields):
        email = f"user{next(_counter)}@example.test"
        body = {"email": email, "password": "secret12345", "consent": True}
        body.update(fields)
        response = client.post("/api/auth/register", json=body)
        assert response.status_code == 200, response.text
        # джар общего клиента чистим: cookies передаются явно в каждом запросе,
        # иначе «анонимный» запрос оказывается авторизованным
        client.cookies.clear()
        return response

    return make


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """Счётчик rate-limit живёт в памяти процесса и общий на весь прогон:
    без сброса тесты, создающие по несколько аккаунтов, ловят 429 от
    регистраций предыдущих тестов. Тест, проверяющий лимит сам, чистит
    счётчик явно до и после."""
    from backend import accounts

    accounts._attempts.clear()
    yield
    accounts._attempts.clear()


@pytest.fixture
def user(client, register):
    """Вошедший пользователь по умолчанию (имя пустое — проверка PII)."""
    response = register()
    return {"client": client, "id": response.json()["user"]["id"], "cookies": response.cookies}


def upload(user, content=PNG, filename="a.png", **fields):
    data = {"title": "Тест", "category": "Интерьер", "width": "800", "height": "1200"}
    data.update(fields)
    return user["client"].post(
        "/api/pins",
        files={"file": (filename, content, "image/png")},
        data=data,
        cookies=user["cookies"],
    )
