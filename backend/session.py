# Сессия Pinly: секрет подписи, JWT HS256 и кука `pinly_session`.
#
# Вынесено из модуля аккаунтов: токен нужен не только входу (deps.py, события,
# фид), а хранить криптографию рядом с таблицей users — значит заставлять любой
# запрос, которому нужен «кто это», импортировать ещё и регистрацию с аватарами.
#
# Env:
#   PINLY_JWT_SECRET — секрет подписи JWT; по умолчанию генерируется один раз
#                      и хранится в web/.data/secret.key (перезапуск сервера не
#                      разлогинивает пользователей).

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time

from fastapi import Request, Response

from .db import DATA_DIR

log = logging.getLogger("pinly.session")

SECRET_PATH = DATA_DIR / "secret.key"

SESSION_COOKIE = "pinly_session"
SESSION_TTL_S = 30 * 24 * 3600

# --- секрет подписи ---

def signing_secret() -> bytes:
    # Один секрет на всю жизнь .data: подпись должна переживать перезапуски.
    env = os.environ.get("PINLY_JWT_SECRET")
    if env:
        return env.encode("utf-8")
    try:
        return SECRET_PATH.read_bytes()
    except OSError:
        pass
    key = secrets.token_bytes(48)
    try:
        SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
        SECRET_PATH.write_bytes(key)
        os.chmod(SECRET_PATH, 0o600)  # хеш-подпись сессий не читается посторонними
    except OSError as err:
        # Эфемерный секрет разлогинивает всех при каждом рестарте. Локально
        # это терпимо, в проде — нет: пусть сервер не стартует молча.
        log.error("secret.key is not persistent (%s)", err)
        if os.environ.get("PINLY_ENV") == "production":
            raise RuntimeError("PINLY_JWT_SECRET или доступная .data обязательны в проде") from err
    return key


# --- JWT HS256 (stdlib, без зависимостей) ---

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def jwt_encode(payload: dict) -> str:
    header = _b64url(b'{"alg":"HS256","typ":"JWT"}')
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header}.{body}".encode("ascii")
    sig = _b64url(hmac.new(signing_secret(), signing_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


def jwt_decode(token: str) -> dict | None:
    try:
        header, body, sig = token.split(".")
        signing_input = f"{header}.{body}".encode("ascii")
        expected = _b64url(hmac.new(signing_secret(), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(body))
        # exp обязателен: «нет срока» = бессмертная кука, а не «срок не наступил»
        exp = payload.get("exp") if isinstance(payload, dict) else None
        if not isinstance(exp, (int, float)) or exp < time.time():
            return None
        return payload
    except (ValueError, TypeError):
        return None


# --- постановка сессионной куки ---


def is_https(request: Request) -> bool:
    # То же правило, что у client_ip: заголовки пишет прокси, и доверять им
    # можно только за своим (PINLY_TRUST_PROXY). Иначе один заголовок
    # x-forwarded-proto: http downgrade'ил бы Secure на куке сессии.
    if os.environ.get("PINLY_TRUST_PROXY"):
        proto = request.headers.get("x-forwarded-proto", "")
        return proto.split(",")[0].strip() == "https"
    return request.url.scheme == "https"


def set_session_cookie(request: Request, response: Response, user_id: str, email: str) -> None:
    """30 дней, httpOnly, SameSite=lax: кросс-пост запросы её не несут, а
    переход по ссылке из чата — несут, вход с сохранённой ссылки остаётся входом."""
    now = time.time()
    token = jwt_encode(
        {"sub": user_id, "email": email, "iat": int(now), "exp": int(now + SESSION_TTL_S)}
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_S,
        httponly=True,
        samesite="lax",
        path="/",
        secure=is_https(request),
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
