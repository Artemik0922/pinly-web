# Медиатека: личное хранилище картинок без создания пина (таблица media).
#
# Картинка живёт либо у нас (file), либо на внешнем хостинге (external_url):
# наружу в том и другом случае отдаётся одно поле url, а флаг external говорит
# клиенту, есть ли у нас файл (и его ли удалять).

import ipaddress
import os
import socket
import sqlite3
import time
import urllib.parse
import uuid

import httpx
from fastapi import HTTPException

from . import uploads
from .db import connection
from .images import FETCHER_USER_AGENT, detect_image_ext

# ImgBB: бесплатный хостинг с разрешённым хотлинкинг-ом. Ключ держится на
# бэкенде (IMGBB_API_KEY), клиенту показывается только признак «включено».
IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload"
IMGBB_TIMEOUT_S = 60.0
URL_FETCH_TIMEOUT_S = 20.0


def external_hosting_enabled() -> bool:
    return bool(os.environ.get("IMGBB_API_KEY"))


def media_json(row: sqlite3.Row) -> dict:
    keys = row.keys()
    external = row["external_url"] if "external_url" in keys else None
    return {
        "id": row["id"],
        "title": row["title"],
        # внешний хостинг хранит ссылку, локальный — файл у нас
        "url": external or uploads.public_url(row["file"]),
        "external": bool(external),
        "width": row["width"],
        "height": row["height"],
        "createdAt": int(row["created_at"] * 1000),
    }


def add_file(user_id: str, content: bytes, title: str, width: int, height: int, source: str = "file") -> dict:
    """Загрузить картинку в своё хранилище (файл сохраняет uploads)."""
    if not content:
        raise HTTPException(400, "empty file")
    filename = uploads.store_image(content, source)
    return insert(user_id, title, width, height, filename)


REDIRECT_STATUSES = {301, 302, 303, 307, 308}
# Тот же потолок, что у загрузки файлом в интерфейсе (10 МБ): ответ хостинга
# может быть любого размера, а читаем мы его в память одного воркера.
MAX_URL_BYTES = 10 * 1024 * 1024
MAX_REDIRECTS = 3


def public_https(url: str) -> str:
    """https + хост, который смотрит в публичный адрес.

    Медиатека сознательно принимает ЛЮБОЙ хостинг (в этом её смысл для
    пользователя), поэтому вместо allowlist проверяем, что адрес не внутренний:
    127.0.0.0/8, 10/8, 172.16/12, 192.168/16, link-local 169.254 (в нём же
    метаданные облаков) и IPv6-аналоги. Проверяем все ответы DNS, а не первый.

    Гонку «проверили — потом переподключилось» (DNS rebinding) это не закрывает
    полностью: для этого нужно коннектиться к уже проверенному IP. На практике
    сервер живёт в одной сети с базой и без облачных метаданных, поэтому шаг
    закрыт проверкой каждого редиректа — он и есть основной путь внутрь.
    """
    if not url.startswith("https://"):
        raise HTTPException(400, "url must be https")
    host = urllib.parse.urlsplit(url).hostname or ""
    if not host:
        raise HTTPException(400, "bad url")
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(400, "host not resolved")
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            raise HTTPException(400, "bad address")
        if not ip.is_global:
            raise HTTPException(400, "address not allowed")
    return url


async def _fetch_capped(client: httpx.AsyncClient, url: str) -> bytes:
    """Скачать с потоковым чтением и потолком в байтах."""
    target = public_https(url)
    for _ in range(MAX_REDIRECTS + 1):
        async with client.stream("GET", target) as res:
            if res.status_code in REDIRECT_STATUSES:
                location = res.headers.get("location")
                if not location:
                    raise HTTPException(502, "redirect without location")
                # редирект проверяется наравне с первым адресом: иначе один
                # 302 уводит на 127.0.0.1:8000 и allowlist не нужен
                target = public_https(urllib.parse.urljoin(target, location))
                continue
            if res.status_code >= 400:
                raise HTTPException(502, f"upstream {res.status_code}")
            content = bytearray()
            async for chunk in res.aiter_bytes(64 * 1024):
                content += chunk
                if len(content) > MAX_URL_BYTES:
                    raise HTTPException(413, "file too large")
            return bytes(content)
    raise HTTPException(400, "too many redirects")


async def add_from_url(user_id: str, url: str, title: str, width: int, height: int) -> dict:
    """Забрать картинку по ссылке с любого хостинга в своё хранилище."""
    url = url.strip()
    # Wikimedia требует описательный UA с контактом (их robot policy):
    # маскировка под браузер получает 403, честный бот — 200
    async with httpx.AsyncClient(
        timeout=URL_FETCH_TIMEOUT_S,
        follow_redirects=False,  # сопровождаем сами и проверяем каждый хоп
        headers={"User-Agent": FETCHER_USER_AGENT},
    ) as client:
        try:
            content = await _fetch_capped(client, url)
        except httpx.HTTPError:
            raise HTTPException(502, "could not fetch url")
    if not content:
        raise HTTPException(400, "empty file")
    # тип проверяем по байтам: Content-Type хостинга врать не умеет только в наших мечтах
    filename = uploads.store_image(content, url)
    return insert(user_id, title, width, height, filename)


async def add_external(user_id: str, content: bytes, filename_hint: str) -> dict:
    """Отправить картинку на ImgBB. Картинка остаётся там, у нас — только ссылка."""
    api_key = os.environ.get("IMGBB_API_KEY")
    if not api_key:
        raise HTTPException(501, "IMGBB_API_KEY not configured")
    if not content:
        raise HTTPException(400, "empty file")
    ext = detect_image_ext(content)
    if ext is None:
        raise HTTPException(400, "unsupported file type (jpg/png/webp)")

    async with httpx.AsyncClient(timeout=IMGBB_TIMEOUT_S) as client:
        try:
            res = await client.post(
                IMGBB_UPLOAD_URL,
                params={"key": api_key},
                files={"image": (filename_hint or f"image.{ext}", content, uploads.EXT_TYPES[ext])},
            )
        except httpx.HTTPError:
            raise HTTPException(502, "imgbb unreachable")
    if res.status_code == 400:
        raise HTTPException(400, "imgbb rejected the file (invalid key or bad image)")
    if res.status_code >= 400:
        raise HTTPException(502, f"imgbb {res.status_code}")
    data = (res.json() or {}).get("data") or {}
    external_url = data.get("url")
    if not external_url:
        raise HTTPException(502, "imgbb returned no url")

    media_id = f"md-{uuid.uuid4().hex}"
    title = (filename_hint or "").rsplit(".", 1)[0][:120]
    with connection() as conn:
        conn.execute(
            "insert into media (id, user_id, title, width, height, file, external_url, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                media_id,
                user_id,
                title,
                int(data.get("width") or 0),
                int(data.get("height") or 0),
                "",
                external_url,
                time.time(),
            ),
        )
        row = conn.execute("select * from media where id = ?", (media_id,)).fetchone()
    return media_json(row)


def insert(user_id: str, title: str, width: int, height: int, filename: str) -> dict:
    media_id = f"md-{uuid.uuid4().hex}"
    with connection() as conn:
        conn.execute(
            "insert into media (id, user_id, title, width, height, file, created_at) values (?, ?, ?, ?, ?, ?, ?)",
            (
                media_id,
                user_id,
                title.strip()[:120],
                max(0, min(width, 20000)),
                max(0, min(height, 20000)),
                filename,
                time.time(),
            ),
        )
        row = conn.execute("select * from media where id = ?", (media_id,)).fetchone()
    return media_json(row)


def list_items(user_id: str) -> list[dict]:
    with connection() as conn:
        rows = conn.execute(
            "select * from media where user_id = ? order by created_at desc", (user_id,)
        ).fetchall()
    return [media_json(r) for r in rows]


def remove(user_id: str, media_id: str) -> sqlite3.Row:
    with connection() as conn:
        row = conn.execute("select * from media where id = ?", (media_id,)).fetchone()
        if row is None or row["user_id"] != user_id:
            raise HTTPException(404, "not found")
        conn.execute("delete from media where id = ?", (media_id,))
    # у внешних картинок файла у нас нет
    if not row["external_url"]:
        uploads.discard(row["file"])
    return row


def file_names_of_user(conn: sqlite3.Connection, user_id: str) -> list[str]:
    """Имена файлов для стирания аккаунта: строки media уйдут каскадом,
    а файлы — руками и до удаления пользователя."""
    rows = conn.execute("select file, external_url from media where user_id = ?", (user_id,)).fetchall()
    return [r["file"] for r in rows if r["file"] and not r["external_url"]]
