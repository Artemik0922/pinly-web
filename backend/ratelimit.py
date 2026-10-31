# Защита от автоматизации: брутфорс входа, спам записи, частота событий.
#
# Счётчики живут в памяти процесса: сбрасываются перезапуском и не синхронизируются
# между воркерами — поэтому лимиты по смыслу «не спамь», а не «квота». Тесты чистят
# _attempts напрямую.

import os
import time

from fastapi import HTTPException, Request

# --- счётчик попыток ---

# Ключ бакета — "action:ip", состояние живёт в памяти процесса: счётчики
# сбрасываются перезапуском, а тесты чистят их напрямую (_attempts).
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
    _rate_limit(f"{action}:{client_ip(request)}", limit, window_s)


# --- адрес клиента ---

def client_ip(request: Request) -> str:
    # X-Forwarded-For пишет клиент: доверять ему можно только за своим прокси
    # (PINLY_TRUST_PROXY), иначе лимиты обходятся одной строчкой в curl.
    # Берём последнее значение — его добавляет наш прокси, а не атакующий.
    if os.environ.get("PINLY_TRUST_PROXY"):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "?"
