# Носители пина: слайды, которые можно перелистывать, и видео.
#
# Сеть проверяется то, что обязано работать на любой машине, а всё, что
# зависит от ffmpeg, — с явным skip: без программы в PATH пин обязан ездить
# без постера, и это тоже проверяется.

import json
import shutil
import subprocess

import pytest

from backend import uploads
from backend.tests.conftest import PNG, FAKE_PNG, upload


def _png_tinted(red: int) -> bytes:
    """PNG своего размера: тест различает первый и второй слайд не по слову в
    ответе, а по настоящему числу пикселей."""
    import struct
    import zlib

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    width, height = 600, 900
    raw = bytearray()
    for _ in range(height):
        raw.append(0)
        raw += bytes((red, 191, 155)) * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


@pytest.fixture(scope="session")
def mp4(tmp_path_factory):
    """Настоящий mp4, снятый ffmpeg: подделка под видео не доказывает, что проба
    длительности и постер работают."""
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        pytest.skip("ffmpeg не установлен — видео-ветка неотличима от картинки")
    path = tmp_path_factory.mktemp("video") / "clip.mp4"
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "lavfi", "-i", "color=c=0x2fbf9b:s=320x240:d=2:r=10",
            "-pix_fmt", "yuv420p", str(path),
        ],
        check=True,
        timeout=60,
    )
    return path.read_bytes()


def test_single_file_pin_keeps_the_old_contract(user):
    """Один файл = ровно тот же ответ, что и до слайдов: ни одно поле не
    переименовано и не исчезло. `slides` — только добавлено."""
    response = upload(user)
    assert response.status_code == 200, response.text
    pin = response.json()["pin"]
    for key in (
        "id", "title", "description", "category", "tags", "author", "authorAvatar",
        "userId", "width", "height", "seed", "likes", "saves", "sourceUrl",
    ):
        assert key in pin, f"пропало поле карточки: {key}"
    assert pin["width"] == 800 and pin["height"] == 1200
    assert [s["kind"] for s in pin["slides"]] == ["image"]
    assert pin["slides"][0]["url"] == pin["sourceUrl"]


def test_slide_order_is_the_order_of_the_form(user):
    """Перелистывать — значит видеть их в том порядке, в котором загрузили."""
    first, second = _png_tinted(40), _png_tinted(200)
    response = user["client"].post(
        "/api/pins",
        files=[
            ("files", ("first.png", first, "image/png")),
            ("files", ("second.png", second, "image/png")),
        ],
        data={
            "title": "До и после",
            "sizes": json.dumps([{"width": 400, "height": 300}, {"width": 800, "height": 600}]),
        },
        cookies=user["cookies"],
    )
    assert response.status_code == 200, response.text
    pin = response.json()["pin"]
    slides = pin["slides"]
    assert len(slides) == 2
    assert (slides[0]["width"], slides[0]["height"]) == (400, 300)
    assert (slides[1]["width"], slides[1]["height"]) == (800, 600)
    assert slides[0]["url"] != slides[1]["url"]
    # обложка пина — первый слайд: на неё смотрят og:image, сетка и доски
    assert pin["sourceUrl"] == slides[0]["url"]
    assert pin["width"] == 400 and pin["height"] == 300


def test_video_pin_gets_duration_and_a_picture_cover(user, mp4):
    """Видео в пине: тип по байтам, длительность из ffprobe, а обложка — jpg,
    чтобы никто, кто про видео не знает, не увидел битую картинку."""
    response = user["client"].post(
        "/api/pins",
        files=[("files", ("clip.mp4", mp4, "video/mp4"))],
        data={"title": "Видео", "sizes": json.dumps([{"width": 320, "height": 240}])},
        cookies=user["cookies"],
    )
    assert response.status_code == 200, response.text
    pin = response.json()["pin"]
    slide = pin["slides"][0]
    assert slide["kind"] == "video"
    assert (slide["width"], slide["height"]) == (320, 240)
    assert 1500 <= slide["durationMs"] <= 2500, slide["durationMs"]
    assert slide["posterUrl"], "постер обязан быть: он и есть обложка"
    assert pin["sourceUrl"] == slide["posterUrl"]
    assert pin["width"] == 320 and pin["height"] == 240
    # обложка — настоящая картинка, а не переименованное видео
    cover = user["client"].get(pin["sourceUrl"], cookies=user["cookies"])
    assert cover.status_code == 200
    assert cover.headers["content-type"] == "image/jpeg"


def test_media_type_is_read_from_bytes_not_the_name(user):
    """`<html>` с именем .mp4 — не видео: тип берётся из сигнатуры, иначе с
    нашего домена раздавалось бы то, что браузер исполнит."""
    response = user["client"].post(
        "/api/pins",
        files=[("files", ("movie.mp4", FAKE_PNG, "video/mp4"))],
        data={"title": "Подмена"},
        cookies=user["cookies"],
    )
    assert response.status_code == 400
    assert "unsupported" in response.text


def test_slides_are_capped(user):
    """Потолок слайдов: восемь — это щедро, а неограниченный массив носителей
    превращает один запрос в восемь файлов на диске и восемь карточек в JSON."""
    parts = [("files", (f"{i}.png", _png_tinted(i * 10 + 1), "image/png")) for i in range(9)]
    response = user["client"].post(
        "/api/pins",
        files=parts,
        data={"title": "Много"},
        cookies=user["cookies"],
    )
    assert response.status_code == 400
    assert "slide" in response.text


def test_deleting_a_pin_removes_video_poster_and_slides(user, mp4):
    """Стирание пина не оставляет на диске ни видео, ни постер, ни слайды:
    каскад удаляет строки, файлы — только руками, и они собираются ДО удаления."""
    response = user["client"].post(
        "/api/pins",
        files=[
            ("files", ("clip.mp4", mp4, "video/mp4")),
            ("files", ("after.png", PNG, "image/png")),
        ],
        data={"title": "Каскад", "sizes": json.dumps([{}, {"width": 1, "height": 1}])},
        cookies=user["cookies"],
    )
    assert response.status_code == 200, response.text
    pin = response.json()["pin"]
    names = [uploads.basename(s["url"]) for s in pin["slides"]]
    names += [uploads.basename(s["posterUrl"]) for s in pin["slides"] if s.get("posterUrl")]
    names.append(uploads.basename(pin["sourceUrl"]))
    assert all(uploads.exists(name) for name in names), names

    deleted = user["client"].delete(f"/api/pins/{pin['id']}", cookies=user["cookies"])
    assert deleted.status_code == 204
    leftover = [name for name in names if uploads.exists(name)]
    assert not leftover, f"файлы остались после удаления пина: {leftover}"


def test_failed_pin_creation_leaves_no_orphans(user):
    """Отказ (здесь — 9 слайдов) не должен оставлять файлы-сироты: их удаляют
    в том же запросе."""
    parts = [("files", (f"{i}.png", _png_tinted(i * 7 + 1), "image/png")) for i in range(9)]
    before = sorted(p.name for p in uploads.UPLOADS_DIR.glob("*")) if uploads.UPLOADS_DIR.exists() else []
    response = user["client"].post(
        "/api/pins", files=parts, data={"title": "Много"}, cookies=user["cookies"]
    )
    assert response.status_code == 400
    after = sorted(p.name for p in uploads.UPLOADS_DIR.glob("*"))
    assert after == before, "сорванный запрос оставил файлы на диске"


def test_video_is_served_by_byte_range(user, mp4):
    """Перемотка: плеер просит кусок и должен получить 206 с Content-Range.
    Без этого Safari видео не играет вовсе, а Chrome перекачивает файл целиком
    на каждый шаг ползунка."""
    response = user["client"].post(
        "/api/pins",
        files=[("files", ("clip.mp4", mp4, "video/mp4"))],
        data={"title": "Range"},
        cookies=user["cookies"],
    )
    assert response.status_code == 200, response.text
    url = response.json()["pin"]["slides"][0]["url"]

    partial = user["client"].get(url, headers={"Range": "bytes=0-99"}, cookies=user["cookies"])
    assert partial.status_code == 206
    assert partial.headers["accept-ranges"] == "bytes"
    total = int(partial.headers["content-range"].split("/")[1])
    assert len(partial.content) == 100
    assert partial.headers["content-range"] == f"bytes 0-99/{total}"

    tail = user["client"].get(url, headers={"Range": f"bytes={total - 10}-"}, cookies=user["cookies"])
    assert tail.status_code == 206 and len(tail.content) == 10

    whole = user["client"].get(url, cookies=user["cookies"])
    assert whole.status_code == 200 and len(whole.content) == total

    unsatisfiable = user["client"].get(
        url, headers={"Range": f"bytes={total + 5}-"}, cookies=user["cookies"]
    )
    assert unsatisfiable.status_code == 416

    garbage = user["client"].get(
        url, headers={"Range": "not-a-range"}, cookies=user["cookies"]
    )
    assert garbage.status_code == 400, "битый Range — 400, а не тихая выдача целиком"


def test_pin_without_slides_returns_empty_list(user):
    """Пин, созданный до функции (внешний источник), остаётся читаемым: слайдов
    нет — пустой массив, а не отсутствие поля и не ошибка."""
    response = upload(user)
    pin = response.json()["pin"]
    listed = user["client"].get(f"/api/pin/{pin['id']}", cookies=user["cookies"]).json()
    assert listed["slides"] == pin["slides"]


def test_board_snapshot_carries_slides_and_rejects_a_foreign_scheme(user, mp4):
    """Доска хранит снапшот карточки, а не ссылку на пин: носители обязаны
    доехать до неё, и чужая схема в url слайда должна отвалиться на входе —
    карточка рисуется у чужих людей."""
    created = user["client"].post(
        "/api/pins",
        files=[
            ("files", ("clip.mp4", mp4, "video/mp4")),
            ("files", ("after.png", PNG, "image/png")),
        ],
        data={"title": "Видео + чертёж"},
        cookies=user["cookies"],
    )
    assert created.status_code == 200, created.text
    pin = created.json()["pin"]
    board = user["client"].post(
        "/api/boards", json={"title": "Моя витрина"}, cookies=user["cookies"]
    )
    assert board.status_code == 200, board.text
    board_id = board.json()["board"]["id"]
    put = f"/api/boards/{board_id}/pins/{pin['id']}"

    saved = user["client"].put(put, json=pin, cookies=user["cookies"])
    assert saved.status_code == 204, saved.text
    public = user["client"].get(f"/api/boards/{board_id}/public").json()["board"]
    assert [s["kind"] for s in public["pins"][0]["slides"]] == ["video", "image"]
    assert public["pins"][0]["slides"][0]["posterUrl"], "постер потерялся в снапшоте"

    tampered = dict(pin)
    tampered["slides"] = [{"kind": "image", "url": "javascript:alert(1)"}]
    rejected = user["client"].put(put, json=tampered, cookies=user["cookies"])
    assert rejected.status_code == 400


def test_probe_survives_a_non_video_file(tmp_path):
    """ffprobe на мусоре не должен ронять загрузку: проба возвращает пустой
    словарь, и пин приезжает без длительности, но живым."""
    from backend import video

    name = uploads.write(uploads.new_filename("mp4"), b"ftypiso6notreallyvideo" + b"0" * 512)
    try:
        assert video.probe(name) == {} or set(video.probe(name)) <= {"width", "height", "durationMs"}
        assert video.make_poster(name) is None
    finally:
        uploads.discard(name)
