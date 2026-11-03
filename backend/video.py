# Видео-артефакты: длительность, размеры кадра и постер.
#
# Всё это делает внешняя пара ffmpeg/ffprobe. Её отсутствие НЕ должно ломать
# загрузку: тогда пин приезжает без постера, а карточка держит первый кадр
# сама через <video preload="metadata">. Поэтому каждая функция возвращает
# пустое значение вместо исключения, и никакой вызов не считается обязательным.
#
# Вызов — списком аргументов без shell=True: путь к файлу генерируем мы, но
# экранирование кавычек оставило бы дыру на будущем вызове с чужим именем.

import json
import shutil
import subprocess

from . import uploads

PROBE_TIMEOUT_S = 20
POSTER_TIMEOUT_S = 30
# Постер шире этого делать незачем: карточка в 5-колоночной сетке — 340 px,
# страница пина — 800 px, а ретина перекрывается next/image с srcset.
POSTER_MAX_WIDTH = 800


def available() -> bool:
    """Есть ли обе программы на машине — проверять один раз на запрос дешевле,
    чем ловить FileNotFoundError и путать её с битым файлом."""
    return bool(shutil.which("ffprobe") and shutil.which("ffmpeg"))


def _run(args: list[str], timeout_s: int) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(args, capture_output=True, timeout=timeout_s, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None


def probe(name: str) -> dict:
    """{'width': int, 'height': int, 'durationMs': int} — только то, что
    действительно удалось прочитать; чего нет, того в словаре нет.

    Размеры берём с учётом поворота из Display Matrix: телефонное видео часто
    лежит landscape-кодом с rotation 90°, и без этого витрина встанет на бок.
    """
    if not shutil.which("ffprobe"):
        return {}
    result = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(uploads.location(name)),
        ],
        PROBE_TIMEOUT_S,
    )
    if result is None or result.returncode != 0:
        return {}
    try:
        payload = json.loads(result.stdout.decode("utf-8", errors="replace") or "{}")
    except ValueError:
        return {}
    streams = [s for s in payload.get("streams", []) if s.get("codec_type") == "video"]
    if not streams:
        return {}
    stream = streams[0]
    info: dict = {}
    width, height = stream.get("width"), stream.get("height")
    rotation = _rotation(stream)
    if width and height:
        if rotation in (90, 270, -90, -270):
            width, height = height, width
        info["width"] = int(width)
        info["height"] = int(height)
    duration = stream.get("duration") or payload.get("format", {}).get("duration")
    try:
        if duration:
            info["durationMs"] = max(1, round(float(duration) * 1000))
    except (TypeError, ValueError):
        pass
    return info


def _rotation(stream: dict) -> int:
    for side in stream.get("side_data_list") or []:
        if "rotation" in side:
            try:
                return int(round(float(side["rotation"])))
            except (TypeError, ValueError):
                return 0
    try:
        return int(round(float(stream.get("tags", {}).get("rotate") or 0)))
    except (TypeError, ValueError):
        return 0


def make_poster(name: str) -> str | None:
    """Первый кадр видео как обычный jpg в uploads: он становится обложкой пина,
    и все, кто читает картинку (og:image, сетка, доска, превью в чужом
    мессенджере), получают валидное изображение без знания про видео.

    None — если ffmpeg нет, файл не видео или кадр не снялся.
    """
    if not shutil.which("ffmpeg"):
        return None
    poster = uploads.new_filename("jpg")
    result = _run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(uploads.location(name)),
            "-frames:v",
            "1",
            "-vf",
            f"scale={POSTER_MAX_WIDTH}:-2:force_original_aspect_ratio=decrease",
            "-q:v",
            "3",
            str(uploads.location(poster)),
        ],
        POSTER_TIMEOUT_S,
    )
    if result is None or result.returncode != 0 or not uploads.exists(poster):
        uploads.discard(poster)
        return None
    return poster
