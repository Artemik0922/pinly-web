# Прокси картинок: /api/img?u= — чужое содержимое отдаётся с нашего домена.
#
# ОРИГИНАЛ скачивается ровно один раз на URL и ложится в дисковый кэш
# web/.cache/img/<md5>.bin. Разрешены только хосты из allowlist (images.py),
# редиректы не сопровождаются, тип определяется по сигнатуре байтов, а браузеру
# нечего угадывать — nosniff.

import hashlib
import urllib.parse
from pathlib import Path

import httpx
from fastapi import HTTPException

from .cache import CACHE_DIR
from .images import FETCHER_USER_AGENT, detect_image_ext, is_allowed_img_host

TIMEOUT_S = 8.0
MAX_IMG_BYTES = 15 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
IMG_HEADERS = {
    "Cache-Control": "public, max-age=31536000, immutable",
    # содержимое приходит с чужого хоста — браузеру нечего угадывать
    "X-Content-Type-Options": "nosniff",
}


def check_url(u: str) -> str:
    """Проверить https-URL источника и вернуть хост.

    Матчим домен или поддомен точно: поиск по хвосту пропускал evil-flickr.com,
    а `wikimedia.org` в хвосте — любой хост, на него заканчивающийся.
    """
    if not u.startswith("https://"):
        raise HTTPException(400, "bad url")
    host = urllib.parse.urlsplit(u).hostname or ""
    if not is_allowed_img_host(host):
        raise HTTPException(403, "host not allowed")
    return host


async def fetch_to_cache(u: str) -> Path:
    file = CACHE_DIR / "img" / f"{hashlib.md5(u.encode('utf-8')).hexdigest()}.bin"
    if file.exists():
        return file
    file.parent.mkdir(parents=True, exist_ok=True)
    # не следуем редиректам: он мог бы увести на неразрешённый хост.
    # UA описательный, как требует robot policy Wikimedia: маскировка
    # под браузер у них даёт 403.
    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT_S,
            follow_redirects=False,
            headers={"User-Agent": FETCHER_USER_AGENT},
        ) as client:
            async with client.stream("GET", u) as res:
                if 300 <= res.status_code < 400:
                    raise HTTPException(502, "upstream redirect")
                if res.status_code >= 400:
                    raise HTTPException(502, f"upstream {res.status_code}")
                media = res.headers.get("content-type", "").split(";")[0].strip()
                if not media.startswith("image/"):
                    raise HTTPException(502, "upstream is not an image")
                body = bytearray()
                async for chunk in res.aiter_bytes(CHUNK_BYTES):
                    body += chunk
                    # потолок: иначе один запрос забивает диск кэша
                    if len(body) > MAX_IMG_BYTES:
                        raise HTTPException(502, "image too large")
    except httpx.HTTPError as err:
        raise HTTPException(504, "fetch failed") from err
    try:
        file.write_bytes(bytes(body))
    except OSError as err:
        raise HTTPException(500, "could not cache image") from err
    return file


def kind(file: Path) -> str:
    """Тип по сигнатуре байтов: .bin не хранит заголовки апстрима."""
    with file.open("rb") as fh:
        return detect_image_ext(fh.read(16)) or "jpg"


def media_type(kind_name: str) -> str:
    return f"image/{'jpeg' if kind_name == 'jpg' else kind_name}"
