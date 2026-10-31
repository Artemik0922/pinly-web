# Сборка приложения: логи, CORS, middleware и ПОРЯДОК включения маршрутов.
#
# Запуск (из каталога web, чтобы кэш и env-файл совпадали с Node-версией):
#   pip install -r backend/requirements.txt
#   python -m uvicorn backend.app:app --port 8000
#
# Порядок включения маршрутов load-bearing: Starlette матчает пути в порядке
# регистрации, поэтому статические сегменты должны быть объявлены раньше
# параметрических — /api/chats/unread до /api/chats/{chat_id} (routers/chats),
# /api/media/external до /api/media/{media_id} (routers/media),
# /api/pins/from-url до /api/pins/{pin_id} (routers/pins). Внутри доменов
# порядок соблюдён в самих роутерах, а здесь — порядок между ними:
# /api/boards/* и /api/users/* раньше /api/boards/{id}/public, а лента
# (/api/feed, /api/pin/{id}) подключается последней, чтобы не перекрывать
# /api/feed/subscriptions и /api/pin/{id}/comments.

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .db import DATA_DIR, WEB_ROOT, connection, init_db
from .embeddings import store
from .routers import auth, boards, chats, events, feed as feed_routes
from .routers import img, likes, media, mealdb, notifications, pins as pins_routes
from .routers import seo, social

log = logging.getLogger("pinly")


def configure_logging() -> None:
    """Один корневой логгер вместо молчаливых except по всему коду.

    Формат с уровнем и именем модуля: в journalctl/логах VPS этого хватает,
    чтобы найти причину, не включая трейсер.
    """
    level = os.environ.get("PINLY_LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    )
    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(handler)
    root.setLevel(level)


def load_dotenv(path) -> None:
    """Env из web/.env.local (простая загрузка, без внешних зависимостей).

    Вызывается после импорта модулей: пути и счётчик итераций PBKDF2
    вычисляются при импорте, а остальное читается на каждом запросе.
    """
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip("'\"")
            os.environ.setdefault(k, v)
    except OSError:
        pass


# Разрешённые источники запросов: по умолчанию локальный сайт, в проде
# задаётся через PINLY_CORS_ORIGINS (через запятую).
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("PINLY_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(
        ","
    )
    if o.strip()
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    store.load()
    log.info("pinly backend ready (data dir %s)", DATA_DIR)
    yield


async def access_log(request: Request, call_next):
    """Request-id + длительность: без этого в логах нельзя связать жалобу
    пользователя с конкретным запросом."""
    path = request.url.path
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.monotonic()
    try:
        response: Response = await call_next(request)
    except Exception:
        log.exception("%s %s -> 500 (%s)", request.method, path, request_id)
        raise
    ms = (time.monotonic() - started) * 1000
    response.headers["X-Request-Id"] = request_id
    # картинки не логируем: это шум, а не события приложения
    if not path.startswith(("/api/uploads", "/api/img")):
        log.info(
            "%s %s -> %s %.0fms %s",
            request.method,
            path,
            response.status_code,
            ms,
            request_id,
        )
    return response


def create_app() -> FastAPI:
    app = FastAPI(title="Pinly Python backend", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(access_log)

    load_dotenv(WEB_ROOT / ".env.local")
    init_db()

    @app.get("/healthz")
    def healthz():
        """Healthcheck для контейнера и мониторинга: жив ли процесс и доступна ли БД."""
        with connection() as conn:
            conn.execute("select 1").fetchone()
        return {"ok": True}

    # Фронтенд попадает сюда через rewrites в next.config.ts.
    app.include_router(auth.router)  # /api/auth/*
    app.include_router(boards.router)  # /api/boards*
    app.include_router(likes.router)  # /api/likes*, /api/taste/pins
    app.include_router(pins_routes.router)  # /api/pins*, /api/uploads/*, /api/user-pins
    app.include_router(media.router)  # /api/media*
    app.include_router(social.router)  # /api/users/*, комментарии, /api/feed/subscriptions
    app.include_router(chats.router)  # /api/chats*, /api/messages/*
    app.include_router(mealdb.router)  # /api/mealdb/* — прокси TheMealDB
    app.include_router(notifications.router)  # /api/notifications*
    app.include_router(events.router)  # /api/ev* — события продукта (см. events.py)
    app.include_router(seo.router)  # /api/seo/urls — адреса для sitemap.ts
    app.include_router(feed_routes.router)  # /api/feed, /api/pin/{id}[/related]
    app.include_router(img.router)  # /api/img — прокси картинок (см. imgproxy.py)
    return app
