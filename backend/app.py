# Точка входа ASGI: `uvicorn backend.app:app` (docker/entrypoint.sh, CI, e2e)
# и `uvicorn app:app` из каталога backend/.
#
# Оба пути обязаны видеть ОДНО приложение, поэтому настоящего тела здесь нет:
# оно в backend/server.py, а сюда добавляется только родительский каталог —
# относительные импорты пакета работают лишь когда backend виден пакетом.
#
# Моки ленты — backend/mock-pins.json (выгружены из src/data/pins.ts).
# Env (как в .env.local): OPENVERSE_API_KEY, EMBED_API_KEY (или VOYAGE_API_KEY),
# EMBED_MODEL, EMBED_DIMENSIONS, EMBED_BASE_URL.

import sys
from pathlib import Path

if __package__ in (None, ""):  # запуск из каталога backend/
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.server import create_app  # noqa: E402

app = create_app()
