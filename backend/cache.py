# Дисково-памятный кэш, общий с Node-версией (формат файлов {at, data}).
# Вынесен из app.py, чтобы embeddings.py мог использовать его без
# циклического импорта.

import hashlib
import json
import re
import time
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)
CACHE_TTL_MS = 24 * 60 * 60 * 1000
FAIL_TTL_BASE_S = 30  # пауза после неудачи, удваивается с каждой следующей
FAIL_TTL_MAX_S = 15 * 60
SWEEP_TTL_MS = 30 * 24 * 60 * 60 * 1000

_mem_cache: dict[str, tuple[float, object]] = {}
# минуты неудач живёт в monotonic-секундах: это локальные таймеры, им не
# мешает перевод системных часов
_failed_until: dict[str, float] = {}
_failed_times: dict[str, int] = {}

# Имя файла — хеш ключа; тот же sha1, что в src/lib/providers/cache.ts, чтобы
# обе реализации делили один кэш. Прежняя «очистка» ключа заменой всего кроме
# [a-zA-Z0-9_-] на "_" сворачивала разные кириллические запросы в один файл,
# и лента начинала отдавать чужие результаты.
KEY_FILE = re.compile(r"^[0-9a-f]{40}\.json$")

_writes_since_sweep = 0


def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{hashlib.sha1(key.encode('utf-8')).hexdigest()}.json"


def _sweep() -> None:
    """Убрать протухшие файлы-ключи: кэш иначе растёт всю жизнь сервера."""
    cutoff = time.time() - SWEEP_TTL_MS / 1000
    for file in CACHE_DIR.glob("*.json"):
        if not KEY_FILE.match(file.name):
            continue  # vectors.json и прочие соседи не трогаем
        try:
            if file.stat().st_mtime < cutoff:
                file.unlink()
        except OSError:
            pass


async def cached(key: str, fetcher):
    now = time.time() * 1000  # как в Node: Date.now(), совместимый формат {at, data}
    hit = _mem_cache.get(key)
    if hit and now - hit[0] < CACHE_TTL_MS:
        return hit[1]
    if _failed_until.get(key, 0) > time.monotonic():
        raise RuntimeError(f"cached: backoff for {key}")
    file = cache_path(key)
    try:
        raw = json.loads(file.read_text(encoding="utf-8"))
        if now - raw["at"] < CACHE_TTL_MS:
            _mem_cache[key] = (raw["at"], raw["data"])
            return raw["data"]
    except (OSError, ValueError, KeyError, TypeError):
        pass
    try:
        data = await fetcher()
    except Exception:
        # Сбой запоминаем: без этого каждый запрос после 429 или таймаута
        # снова платит полной задержкой. Пауза удваивается с каждой неудачей
        # (30 с → 15 мин) и сбрасывается после успеха.
        attempts = _failed_times.get(key, 0) + 1
        _failed_times[key] = attempts
        _failed_until[key] = time.monotonic() + min(FAIL_TTL_BASE_S * 2**attempts, FAIL_TTL_MAX_S)
        raise
    _failed_until.pop(key, None)
    _failed_times.pop(key, None)
    _mem_cache[key] = (now, data)
    global _writes_since_sweep
    try:
        file.write_text(json.dumps({"at": now, "data": data}), encoding="utf-8")
        _writes_since_sweep += 1
        if _writes_since_sweep >= 200:  # обход каталога — не на каждый запрос
            _writes_since_sweep = 0
            _sweep()
    except OSError:
        pass
    return data
