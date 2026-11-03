# Модели запросов: весь JSON, который принимает бэкенд, собран здесь.
#
# Ключи намеренно такие, какие присылает клиент: часть в snake_case (историче-
# ские эндпоинты аккаунтов и досок), часть в camelCase (чаты). Переименование
# ломает фронтенд, поэтому это контракт, а не стиль.
#
# Проверки, у которых есть свой HTTP-код (400 invalid_email, 413 pin_data too
# large, 401 bad_credentials), живут не в валидаторах pydantic, а рядом с
# вызывающим кодом: pydantic умеет только 422, а клиент ожидает другие статусы.

import json
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError

# Потолок снапшота карточки пина: и в доске, и в сообщении это одна запись,
# разрастаться ей некуда.
MAX_PIN_DATA_BYTES = 64 * 1024
# pin_id подчинён тому же лимиту, что и колонки событий: длинные строки — это
# чужие id, а не наши (наши умещаются с запасом).
MAX_PIN_ID_LEN = 128


class RegisterBody(BaseModel):
    email: str
    password: str
    display_name: str = ""
    consent: bool = False


class LoginBody(BaseModel):
    email: str
    password: str


class DisplayNameBody(BaseModel):
    display_name: str


class BoardTitleBody(BaseModel):
    title: str
    is_secret: bool = False
    # «создать, если ещё нет»: стартовые доски клиент заводит при первом
    # входе, и без этого флага двойное монтирование (StrictMode, две вкладки)
    # плодило копии «Идеи для дома»
    if_missing: bool = False


class CommentBody(BaseModel):
    text: str


class ChatStartBody(BaseModel):
    userId: str


class ChatMessageBody(BaseModel):
    kind: str = "text"
    text: str | None = None
    pinId: str | None = None
    pinData: dict | None = None


class PinUpdateBody(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None


class MediaUrlBody(BaseModel):
    url: str
    title: str = ""
    width: int = 0
    height: int = 0


class PinFromUrlBody(BaseModel):
    source_url: str
    title: str = ""
    description: str = ""
    category: str = ""
    tags: list[str] = []
    width: int = 800
    height: int = 1000


class PinCard(BaseModel):
    """Каркас снапшота карточки пина (доска и сообщение чата — одно и то же).

    Строгая проверка типов: кривая запись ломает отрисовку (next/image
    требует размеры) и превращается в мусор на годы, а чинить потом нечем.
    """

    model_config = ConfigDict(strict=True, extra="allow")

    id: str
    title: str
    width: int
    height: int


# Поля-ссылки снапшота: карточка приходит от клиента, а рисуется у чужих
# людей (публичная доска, сообщение чата). Схема должна остаться ссылкой —
# иначе «источник» превращается в javascript: или data: и ждёт первого
# компонента, который выведет его в href.
URL_FIELDS = ("sourceUrl", "pageUrl", "authorAvatar", "url")
ALLOWED_URL_PREFIXES = ("http://", "https://", "/")


def _check_url(value) -> None:
    if value is None:
        return
    if not isinstance(value, str) or not value.startswith(ALLOWED_URL_PREFIXES):
        raise HTTPException(400, "invalid pin_data")


def check_url_fields(card: dict) -> None:
    for field in URL_FIELDS:
        _check_url(card.get(field))
    # Носители лежат внутри карточки и доезжают до чужой доски тем же
    # бороздом, что и обложка: их схемы проверяются точно так же, иначе
    # снапшот принёс бы javascript: или data: в обход проверки.
    for slide in card.get("slides") or []:
        if isinstance(slide, dict):
            for field in ("url", "posterUrl"):
                _check_url(slide.get(field))


def pin_card_json(card: Any, pin_id: str) -> str:
    """Проверить карточку и вернуть JSON для хранения."""
    if not isinstance(card, dict):
        raise HTTPException(400, "invalid pin_data")
    try:
        raw = json.dumps(card, ensure_ascii=False)
    except (TypeError, ValueError):
        raise HTTPException(400, "invalid pin_data")
    if len(raw.encode("utf-8")) > MAX_PIN_DATA_BYTES:
        raise HTTPException(413, "pin_data too large")
    try:
        PinCard.model_validate(card)
    except ValidationError:
        raise HTTPException(400, "invalid pin_data")
    if card.get("id") != pin_id:
        raise HTTPException(400, "invalid pin_data")
    check_url_fields(card)
    return raw


def chat_pin_card_json(pin_id: str | None, card: dict | None) -> str:
    """Снапшот пина в сообщении: id проверяется раньше, он приходит отдельно."""
    if not pin_id or not isinstance(pin_id, str) or len(pin_id) > MAX_PIN_ID_LEN:
        raise HTTPException(400, "invalid pin_id")
    if card is None:
        raise HTTPException(400, "pin_data required")
    return pin_card_json(card, pin_id)
