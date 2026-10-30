# Аккаунты Pinly: регистрация, вход, сессии, доски, лайки.
#
# Самодостаточная замена Supabase GoTrue для локальной работы и VPS:
# SQLite (web/.data/accounts.db), пароли — PBKDF2-HMAC-SHA256 (stdlib),
# сессия — JWT HS256 в httpOnly-cookie `pinly_session` (30 дней).
# Фронтенд ходит на те же пути через прокси Next.js (rewrites в
# next.config.ts), поэтому cookie ставится для домена сайта — CORS не нужен.
#
# Env:
#   PINLY_JWT_SECRET — секрет подписи JWT; по умолчанию генерируется один
#                      раз и хранится в web/.data/secret.key (перезапуск
#                      сервера не разлогинивает пользователей).

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from fastapi import File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel

try:
    from backend.embeddings import store as vector_store
    from backend.images import detect_image_ext
except ImportError:  # запуск из каталога backend/
    from embeddings import store as vector_store
    from images import detect_image_ext

log = logging.getLogger("pinly.accounts")

WEB_ROOT = Path(__file__).resolve().parent.parent
# PINLY_DATA_DIR нужен тестам (изолированная база) и продам с другим диском.
DATA_DIR = Path(os.environ.get("PINLY_DATA_DIR") or WEB_ROOT / ".data")
DB_PATH = DATA_DIR / "accounts.db"
SECRET_PATH = DATA_DIR / "secret.key"
UPLOADS_DIR = DATA_DIR / "uploads"

SESSION_COOKIE = "pinly_session"
SESSION_TTL_S = 30 * 24 * 3600
# 600k итераций — рабочий компромисс для прода; в тестах переопределяется
# через PINLY_PBKDF2_ITERS, иначе прогон съедает минуту только на хеширование
PBKDF2_ITERS = int(os.environ.get("PINLY_PBKDF2_ITERS", "600000"))
MAX_PIN_DATA_BYTES = 64 * 1024
MAX_AVATAR_BYTES = 3 * 1024 * 1024
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SCHEMA = """
create table if not exists users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  display_name  text not null default '',
  avatar_url    text,
  created_at    real not null
);
create table if not exists consent_log (
  id          integer primary key autoincrement,
  user_id     text not null,
  email       text not null,
  kind        text not null,
  doc_version text not null,
  user_agent  text,
  created_at  real not null
);
create table if not exists boards (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  title      text not null,
  created_at real not null,
  is_secret  integer not null default 0
);
create table if not exists board_pins (
  board_id text not null references boards(id) on delete cascade,
  pin_id   text not null,
  pin_data text not null,
  added_at real not null,
  primary key (board_id, pin_id)
);
create table if not exists likes (
  user_id    text not null references users(id) on delete cascade,
  pin_id     text not null,
  created_at real not null,
  primary key (user_id, pin_id)
);
"""

PRIVACY_VERSION = "1.0"


@contextmanager
def _db():
    """Одно соединение на запрос: с коммитом по успеху, откатом по ошибке
    и — обязательно — закрытием. Раньше `with _db() as conn` коммитил, но
    соединение не закрывалось, и файловые дескрипторы текли на каждый запрос.

    WAL + busy_timeout: читатель не ждёт писателя, а параллельная запись
    получает retry вместо «database is locked».
    """
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    conn.execute("pragma journal_mode = wal")
    conn.execute("pragma busy_timeout = 5000")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _init() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _db() as conn:
        conn.executescript(SCHEMA)
        # миграции существующих баз: колонки, появившиеся после 1-й версии
        for ddl in (
            "alter table users add column avatar_url text",
            "alter table boards add column is_secret integer not null default 0",
        ):
            try:
                conn.execute(ddl)
            except sqlite3.OperationalError:
                pass  # колонка уже есть


def _secret() -> bytes:
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


def _jwt_encode(payload: dict) -> str:
    header = _b64url(b'{"alg":"HS256","typ":"JWT"}')
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header}.{body}".encode("ascii")
    sig = _b64url(hmac.new(_secret(), signing_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


def _jwt_decode(token: str) -> dict | None:
    try:
        header, body, sig = token.split(".")
        signing_input = f"{header}.{body}".encode("ascii")
        expected = _b64url(hmac.new(_secret(), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(body))
        if not isinstance(payload, dict) or payload.get("exp", 0) < time.time():
            return None
        return payload
    except (ValueError, TypeError):
        return None


# --- пароли ---

def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERS)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
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


# --- rate-limit: брутфорс входа и спам записи ---

_attempts: dict[str, list[float]] = {}
_MAX_TRACKED_BUCKETS = 10_000


def _rate_limit(bucket: str, limit: int, window_s: float) -> None:
    now = time.time()
    hits = [t for t in _attempts.get(bucket, []) if now - t < window_s]
    if len(hits) >= limit:
        raise HTTPException(429, "too many attempts")
    hits.append(now)
    _attempts[bucket] = hits
    if len(_attempts) > _MAX_TRACKED_BUCKETS:  # словарь не растёт бесконечно
        for key in [k for k, v in _attempts.items() if now - v[-1] > window_s]:
            _attempts.pop(key, None)


def rate_limit(request: Request, action: str, limit: int = 20, window_s: float = 300.0) -> None:
    """Ограничить частоту действия action для этого клиента.

    Бэкенд один рабочий процесс не гарантирует: счётчики в памяти, поэтому
    лимиты консервативные и по смыслу «защита от автоматизации», а не «квота».
    """
    _rate_limit(f"{action}:{_client_ip(request)}", limit, window_s)


# --- сессии и пользователи ---

def _client_ip(request: Request) -> str:
    # X-Forwarded-For пишет клиент: доверять ему можно только за своим прокси
    # (PINLY_TRUST_PROXY), иначе лимиты обходятся одной строчкой в curl.
    # Берём последнее значение — его добавляет наш прокси, а не атакующий.
    if os.environ.get("PINLY_TRUST_PROXY"):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "?"


def _is_https(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", "")
    return proto.split(",")[0].strip() == "https"


def _set_session_cookie(request: Request, response: Response, user_id: str, email: str) -> None:
    now = time.time()
    token = _jwt_encode({"sub": user_id, "email": email, "iat": int(now), "exp": int(now + SESSION_TTL_S)})
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_S,
        httponly=True,
        samesite="lax",
        path="/",
        secure=_is_https(request),
    )


def _current_user_row(request: Request) -> sqlite3.Row:
    token = request.cookies.get(SESSION_COOKIE, "")
    payload = _jwt_decode(token) if token else None
    if not payload or "sub" not in payload:
        raise HTTPException(401, "no session")
    with _db() as conn:
        row = conn.execute("select * from users where id = ?", (payload["sub"],)).fetchone()
    if row is None:
        raise HTTPException(401, "no session")
    return row


def _user_json(row: sqlite3.Row) -> dict:
    keys = row.keys()
    avatar = row["avatar_url"] if "avatar_url" in keys else None
    return {
        "id": row["id"],
        "email": row["email"],
        "displayName": row["display_name"],
        "avatarUrl": avatar,
        "createdAt": int(row["created_at"] * 1000),
    }


# Сколько пинов доски отдаёт список /api/boards: контекст досок живёт на
# каждой странице, поэтому полный payload большой доски не должен весить
# мегабайты. (Страница доски показывает эти же пины; свыше лимита — только
# в счётчике.)
BOARD_PREVIEW_PINS = 60


def _board_json(conn: sqlite3.Connection, board: sqlite3.Row) -> dict:
    pins = conn.execute(
        "select pin_id, pin_data from board_pins where board_id = ? order by added_at desc limit ?",
        (board["id"], BOARD_PREVIEW_PINS),
    ).fetchall()
    total = conn.execute(
        "select count(*) as c from board_pins where board_id = ?", (board["id"],)
    ).fetchone()["c"]
    return {
        "id": board["id"],
        "title": board["title"],
        "createdAt": int(board["created_at"] * 1000),
        "isSecret": bool(board["is_secret"]) if "is_secret" in board.keys() else False,
        # pins — срез до BOARD_PREVIEW_PINS, поэтому счётчик показываем по
        # полному количеству, а не по длине среза
        "pinsCount": total,
        "pins": [json.loads(p["pin_data"]) for p in pins],
    }


def _own_board(conn: sqlite3.Connection, user_id: str, board_id: str) -> sqlite3.Row:
    board = conn.execute(
        "select * from boards where id = ? and user_id = ?", (board_id, user_id)
    ).fetchone()
    if board is None:
        raise HTTPException(404, "board not found")
    return board


# --- модели запросов ---

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


# --- регистрация маршрутов на приложении ---

def register_accounts(app) -> None:
    _init()

    @app.post("/api/auth/register")
    def auth_register(body: RegisterBody, request: Request, response: Response):
        rate_limit(request, "auth")
        email = body.email.strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(400, "invalid_email")
        if len(body.password) < 8:
            raise HTTPException(400, "weak_password")
        if not body.consent:
            # 152-ФЗ: без явного согласия аккаунт не создаём
            raise HTTPException(400, "consent_required")

        user_id = str(uuid.uuid4())
        now = time.time()
        display_name = body.display_name.strip()[:60]
        try:
            with _db() as conn:
                conn.execute(
                    "insert into users (id, email, password_hash, display_name, created_at) values (?, ?, ?, ?, ?)",
                    (user_id, email, _hash_password(body.password), display_name, now),
                )
                conn.execute(
                    "insert into consent_log (user_id, email, kind, doc_version, user_agent, created_at) values (?, ?, ?, ?, ?, ?)",
                    (user_id, email, "signup", PRIVACY_VERSION, request.headers.get("user-agent"), now),
                )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "email_taken")

        _set_session_cookie(request, response, user_id, email)
        return {
            "user": {
                "id": user_id,
                "email": email,
                "displayName": display_name,
                "createdAt": int(now * 1000),
            }
        }

    @app.post("/api/auth/login")
    def auth_login(body: LoginBody, request: Request, response: Response):
        rate_limit(request, "auth")
        email = body.email.strip().lower()
        with _db() as conn:
            row = conn.execute("select * from users where email = ?", (email,)).fetchone()
        if row is None or not _verify_password(body.password, row["password_hash"]):
            raise HTTPException(401, "bad_credentials")
        _set_session_cookie(request, response, row["id"], row["email"])
        return {"user": _user_json(row)}

    @app.post("/api/auth/logout")
    def auth_logout(response: Response):
        response.delete_cookie(SESSION_COOKIE, path="/")
        return {"ok": True}

    @app.get("/api/auth/me")
    def auth_me(request: Request):
        return {"user": _user_json(_current_user_row(request))}

    @app.patch("/api/auth/me")
    def auth_update_me(body: DisplayNameBody, request: Request):
        user = _current_user_row(request)
        name = body.display_name.strip()[:60]
        with _db() as conn:
            conn.execute("update users set display_name = ? where id = ?", (name, user["id"]))
            row = conn.execute("select * from users where id = ?", (user["id"],)).fetchone()
        return {"user": _user_json(row)}

    # --- профиль: аватар и удаление аккаунта ---

    @app.post("/api/auth/avatar")
    async def auth_avatar(request: Request, file: UploadFile = File(...)):
        user = _current_user_row(request)
        rate_limit(request, "avatar", limit=10, window_s=3600.0)
        content = await file.read(MAX_AVATAR_BYTES + 1)
        if len(content) > MAX_AVATAR_BYTES:
            raise HTTPException(413, "avatar too large (max 3 MB)")
        # расширение определяем по сигнатуре, а не по имени файла: под видом
        # .png не должна пройти разметка, которую потом отдаёт наш домен
        ext = detect_image_ext(content)
        if ext is None:
            raise HTTPException(400, "unsupported file type (jpg/png/webp)")
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        # старый аватар удаляем, чтобы не копить мусор
        if user["avatar_url"]:
            try:
                (UPLOADS_DIR / user["avatar_url"].rsplit("/", 1)[-1]).unlink()
            except OSError:
                pass
        filename = f"{uuid.uuid4().hex}.{ext}"
        try:
            (UPLOADS_DIR / filename).write_bytes(content)
        except OSError:
            raise HTTPException(500, "could not save file")
        with _db() as conn:
            conn.execute("update users set avatar_url = ? where id = ?", (f"/api/uploads/{filename}", user["id"]))
            row = conn.execute("select * from users where id = ?", (user["id"],)).fetchone()
        return {"user": _user_json(row)}

    @app.delete("/api/auth/account")
    def auth_delete_account(request: Request, response: Response):
        # 152-ФЗ: удаление аккаунта и персональных данных. Факт согласия
        # (consent_log) сохраняется — это доказательство, а не ПД.
        user = _current_user_row(request)
        with _db() as conn:
            pin_ids = [r["id"] for r in conn.execute("select id from pins where user_id = ?", (user["id"],)).fetchall()]
            # файлы своих пинов
            for row in conn.execute("select file from pins where user_id = ?", (user["id"],)).fetchall():
                try:
                    (UPLOADS_DIR / row["file"]).unlink()
                except OSError:
                    pass
            try:
                if user["avatar_url"]:
                    (UPLOADS_DIR / user["avatar_url"].rsplit("/", 1)[-1]).unlink()
            except OSError:
                pass
            # Доски, пины, лайки и подписки уйдут по cascade. Остальное —
            # строковые ссылки без FK, чистим руками: свои лайки под чужими
            # пинами, чужие лайки и комментарии под своими пинами, свои
            # комментарии, вложения своих пинов в чужих досках.
            conn.execute("delete from likes where user_id = ?", (user["id"],))
            conn.execute(
                "delete from likes where pin_id in (select id from pins where user_id = ?)",
                (user["id"],),
            )
            conn.execute(
                "delete from board_pins where pin_id in (select id from pins where user_id = ?)",
                (user["id"],),
            )
            conn.execute("delete from comments where user_id = ?", (user["id"],))
            conn.execute(
                "delete from comments where pin_id in (select id from pins where user_id = ?)",
                (user["id"],),
            )
            conn.execute("delete from users where id = ?", (user["id"],))
        # эмбеддинги живут в .cache/vectors.json вне SQLite — иначе там
        # навсегда остаются векторы удалённого контента
        if pin_ids:
            for pin_id in pin_ids:
                vector_store.remove(pin_id)
            try:
                vector_store.save()
            except OSError:
                pass
        response.delete_cookie(SESSION_COOKIE, path="/")
        return {"ok": True}

    # --- переименование доски ---

    @app.patch("/api/boards/{board_id}")
    def boards_rename(board_id: str, body: BoardTitleBody, request: Request):
        user = _current_user_row(request)
        title = body.title.strip()[:80] or "Новая доска"
        with _db() as conn:
            board = conn.execute(
                "select * from boards where id = ? and user_id = ?", (board_id, user["id"])
            ).fetchone()
            if board is None:
                raise HTTPException(404, "board not found")
            conn.execute("update boards set title = ? where id = ?", (title, board_id))
            board = conn.execute("select * from boards where id = ?", (board_id,)).fetchone()
            return {
                "board": {
                    "id": board["id"],
                    "title": board["title"],
                    "createdAt": int(board["created_at"] * 1000),
                    "pins": [],
                }
            }

    # --- доски ---

    @app.get("/api/boards")
    def boards_list(request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            boards = conn.execute(
                "select * from boards where user_id = ? order by created_at asc", (user["id"],)
            ).fetchall()
            return {"boards": [_board_json(conn, b) for b in boards]}

    @app.post("/api/boards")
    def boards_create(body: BoardTitleBody, request: Request):
        user = _current_user_row(request)
        rate_limit(request, "board", limit=50, window_s=3600.0)
        title = body.title.strip()[:80] or "Новая доска"
        board_id = str(uuid.uuid4())
        now = time.time()
        with _db() as conn:
            if body.if_missing:
                existing = conn.execute(
                    "select * from boards where user_id = ? and title = ?", (user["id"], title)
                ).fetchone()
                if existing is not None:
                    return {"board": _board_json(conn, existing)}
            conn.execute(
                "insert into boards (id, user_id, title, created_at, is_secret) values (?, ?, ?, ?, ?)",
                (board_id, user["id"], title, now, 1 if body.is_secret else 0),
            )
            board = conn.execute("select * from boards where id = ?", (board_id,)).fetchone()
            return {"board": _board_json(conn, board)}

    @app.delete("/api/boards/{board_id}")
    def boards_delete(board_id: str, request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            _own_board(conn, user["id"], board_id)
            conn.execute("delete from boards where id = ?", (board_id,))
        return Response(status_code=204)

    @app.put("/api/boards/{board_id}/pins/{pin_id}")
    async def board_pins_put(board_id: str, pin_id: str, request: Request):
        user = _current_user_row(request)
        raw = await request.body()
        if len(raw) > MAX_PIN_DATA_BYTES:
            raise HTTPException(413, "pin_data too large")
        try:
            pin_data = json.loads(raw)
            json.dumps(pin_data)  # повторная сериализация = валидный JSON
        except ValueError:
            raise HTTPException(400, "invalid json")
        # Каркас пина обязателен: кривая запись ломает отрисовку доски
        # (next/image требует размеры) и превращается в мусор на годы.
        if (
            not isinstance(pin_data, dict)
            or pin_data.get("id") != pin_id
            or not isinstance(pin_data.get("title"), str)
            or not isinstance(pin_data.get("width"), int)
            or not isinstance(pin_data.get("height"), int)
        ):
            raise HTTPException(400, "invalid pin_data")
        with _db() as conn:
            _own_board(conn, user["id"], board_id)
            conn.execute(
                "insert into board_pins (board_id, pin_id, pin_data, added_at) values (?, ?, ?, ?) "
                "on conflict (board_id, pin_id) do update set pin_data = excluded.pin_data",
                (board_id, pin_id, json.dumps(pin_data, ensure_ascii=False), time.time()),
            )
        # уведомление владельцу пина: его работу сохранили в доску
        try:
            from backend.notifications import notify_save
        except ImportError:  # запуск из каталога backend/
            from notifications import notify_save
        notify_save(user["id"], pin_id)
        return Response(status_code=204)

    @app.delete("/api/boards/{board_id}/pins/{pin_id}")
    def board_pins_delete(board_id: str, pin_id: str, request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            _own_board(conn, user["id"], board_id)
            conn.execute(
                "delete from board_pins where board_id = ? and pin_id = ?", (board_id, pin_id)
            )
        return Response(status_code=204)

    @app.get("/api/taste/pins")
    def taste_pins(request: Request):
        """Лайки и сохранения пользователя: по этим id Node-лента строит
        вектор вкуса (умная лента). Без сессии — пустой список, не 401."""
        token = request.cookies.get(SESSION_COOKIE, "")
        payload = _jwt_decode(token) if token else None
        if not payload or "sub" not in payload:
            return {"userId": None, "likeIds": [], "saveIds": []}
        with _db() as conn:
            like_ids = [
                r["pin_id"]
                for r in conn.execute(
                    "select pin_id from likes where user_id = ? order by created_at desc",
                    (payload["sub"],),
                ).fetchall()
            ]
            save_ids = [
                r["pin_id"]
                for r in conn.execute(
                    "select distinct bp.pin_id from board_pins bp "
                    "join boards b on b.id = bp.board_id where b.user_id = ?",
                    (payload["sub"],),
                ).fetchall()
            ]
        return {"userId": payload["sub"], "likeIds": like_ids, "saveIds": save_ids}

    # --- лайки ---

    @app.get("/api/likes")
    def likes_list(request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            rows = conn.execute(
                "select pin_id from likes where user_id = ? order by created_at desc", (user["id"],)
            ).fetchall()
        return {"likes": [r["pin_id"] for r in rows]}

    @app.put("/api/likes/{pin_id}")
    def likes_put(pin_id: str, request: Request):
        user = _current_user_row(request)
        if len(pin_id) > 128:
            raise HTTPException(400, "bad pin_id")
        with _db() as conn:
            conn.execute(
                "insert or ignore into likes (user_id, pin_id, created_at) values (?, ?, ?)",
                (user["id"], pin_id, time.time()),
            )
        # уведомление владельцу пина (ленивый импорт: accounts <-> notifications)
        try:
            from backend.notifications import notify_like
        except ImportError:  # запуск из каталога backend/
            from notifications import notify_like
        notify_like(user["id"], pin_id)
        return Response(status_code=204)

    @app.delete("/api/likes/{pin_id}")
    def likes_delete(pin_id: str, request: Request):
        user = _current_user_row(request)
        with _db() as conn:
            conn.execute("delete from likes where user_id = ? and pin_id = ?", (user["id"], pin_id))
        return Response(status_code=204)
