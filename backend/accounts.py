# Учётные записи Pinly: пароли (PBKDF2) и таблица users с журналом согласий.
#
# Сессия (JWT + кука) — в session.py, частота действий — в ratelimit.py.
#
# Самодостаточная замена Supabase GoTrue для локальной работы и VPS:
# SQLite (web/.data/accounts.db), пароли — PBKDF2-HMAC-SHA256 (stdlib),
# сессия — JWT HS256 в httpOnly-cookie `pinly_session` (30 дней).
# Фронтенд ходит на те же пути через прокси Next.js (rewrites в
# next.config.ts), поэтому cookie ставится для домена сайта — CORS не нужен.
#
# Маршрутов здесь нет: HTTP — в routers/auth.py.
#

import hashlib
import hmac
import logging
import os
import re
import secrets
import sqlite3
import time
import uuid

from fastapi import HTTPException

from .db import connection
from .images import detect_image_ext
from .session import signing_secret
from .uploads import basename, discard, new_filename, public_url, write

log = logging.getLogger("pinly.accounts")

# 600k итераций — рабочий компромисс для прода; в тестах переопределяется
# через PINLY_PBKDF2_ITERS, иначе прогон съедает минуту только на хеширование
PBKDF2_ITERS = int(os.environ.get("PINLY_PBKDF2_ITERS", "600000"))
MAX_AVATAR_BYTES = 3 * 1024 * 1024
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PRIVACY_VERSION = "1.0"



# --- пароли ---

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERS)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters)
        )
        return hmac.compare_digest(dk.hex(), digest_hex)
    except (ValueError, TypeError):
        return False

# --- таблица users ---

def register(
    email: str, password: str, display_name: str, consent: bool, user_agent: str | None
) -> sqlite3.Row:
    """Нормализовать ввод, проверить его и завести аккаунт с согласием (152-ФЗ).

    Строки ошибок и коды — часть контракта клиента, поэтому проверка здесь,
    а не в pydantic-модели: 400 вместо 422.
    """
    address = email.strip().lower()
    if not EMAIL_RE.match(address):
        raise HTTPException(400, "invalid_email")
    if len(password) < 8:
        raise HTTPException(400, "weak_password")
    if not consent:
        # 152-ФЗ: без явного согласия аккаунт не создаём
        raise HTTPException(400, "consent_required")

    user_id = str(uuid.uuid4())
    now = time.time()
    try:
        with connection() as conn:
            conn.execute(
                "insert into users (id, email, password_hash, display_name, created_at) values (?, ?, ?, ?, ?)",
                (user_id, address, hash_password(password), display_name.strip()[:60], now),
            )
            conn.execute(
                "insert into consent_log (user_id, email, kind, doc_version, user_agent, created_at) values (?, ?, ?, ?, ?, ?)",
                (user_id, address, "signup", PRIVACY_VERSION, user_agent, now),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "email_taken")
    return user_by_id(user_id)  # type: ignore[return-value]


def login(email: str, password: str) -> sqlite3.Row:
    """Проверить пару адрес/пароль; нет её — 401 bad_credentials."""
    row = user_by_email(email.strip().lower())
    if row is None or not verify_password(password, row["password_hash"]):
        raise HTTPException(401, "bad_credentials")
    return row


def users_by_ids(conn: sqlite3.Connection, user_ids: list[str]) -> dict[str, sqlite3.Row]:
    """Профили списком одним запросом — карточки пинов строятся пакетом."""
    if not user_ids:
        return {}
    placeholders = ",".join("?" * len(user_ids))
    rows = conn.execute(
        f"select * from users where id in ({placeholders})", user_ids
    ).fetchall()
    return {row["id"]: row for row in rows}


def user_by_id(user_id: str) -> sqlite3.Row | None:
    with connection() as conn:
        return conn.execute("select * from users where id = ?", (user_id,)).fetchone()


def user_by_email(email: str) -> sqlite3.Row | None:
    with connection() as conn:
        return conn.execute("select * from users where email = ?", (email,)).fetchone()


def user_row(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row | None:
    """Тот же поиск по готовому соединению — внутри чужой транзакции."""
    return conn.execute("select * from users where id = ?", (user_id,)).fetchone()


def rename_user(user_id: str, display_name: str) -> sqlite3.Row:
    name = display_name.strip()[:60]
    with connection() as conn:
        conn.execute("update users set display_name = ? where id = ?", (name, user_id))
        return user_row(conn, user_id)  # type: ignore[return-value]


def replace_avatar(user: sqlite3.Row, content: bytes) -> sqlite3.Row:
    """Сохранить картинку аватара и забыть старый файл.

    Тип берётся из сигнатуры байтов, а не из имени файла: под видом .png не
    должна пройти разметка, которую потом отдаёт наш домен.
    """
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(413, "avatar too large (max 3 MB)")
    ext = detect_image_ext(content)
    if ext is None:
        raise HTTPException(400, "unsupported file type (jpg/png/webp)")
    # старый аватар удаляем, чтобы не копить мусор
    if user["avatar_url"]:
        discard(basename(user["avatar_url"]))
    filename = write(new_filename(ext), content)
    with connection() as conn:
        conn.execute(
            "update users set avatar_url = ? where id = ?",
            (public_url(filename), user["id"]),
        )
        return user_row(conn, user["id"])  # type: ignore[return-value]


def delete_avatar(user: sqlite3.Row) -> None:
    if user["avatar_url"]:
        discard(basename(user["avatar_url"]))


def pseudonymise_consent(conn: sqlite3.Connection, user_id: str, email: str) -> None:
    """Заменить открытый email в журнале согласий необратимой меткой.

    Факт согласия (версия документа, UA, дата) остаётся: иначе «удалите мои
    данные» стирает и доказательство, что человек его давал. Открытый адрес
    при этом уходить обязан — после удаления аккаунта обрабатывать его ПД
    больше не на чём. Хеш с HMAC на секрет подписи: без секрета списка
    «email -> метка» не построить.
    """
    digest = hmac.new(signing_secret(), email.strip().lower().encode("utf-8"), hashlib.sha256)
    conn.execute(
        "update consent_log set email = ? where user_id = ?",
        (f"sha256:{digest.hexdigest()[:32]}", user_id),
    )


def remove_user(conn: sqlite3.Connection, user_id: str) -> None:
    """Удалить строку аккаунта; каскадом уходят его пины, доски, лайки,
    подписки, комментарии, уведомления и участия в чатах. Порядок чистки
    сиротских ссылок — в erasure.py."""
    conn.execute("delete from users where id = ?", (user_id,))


# --- карточка пользователя ---

def user_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "displayName": row["display_name"],
        "avatarUrl": row["avatar_url"],
        "createdAt": int(row["created_at"] * 1000),
    }
