# Носители пина: слайды (картинки) и видео, которые можно перелистывать.
#
# Отдельная таблица, а не JSON в pins, по двум причинам: порядок важен и его
# правят точечно, и файлы нужно уметь перечислить перед удалением строки —
# после cascade'а их уже не найти. Обложка пина (pins.file/width/height)
# остаётся и обновляется вместе с первым слайдом: благодаря этому og:image,
# сетка, доски и превью в чужих мессенджерах продолжают видеть обычную
# картинку и не знают про видео вообще.

import sqlite3

from . import uploads

KINDS = ("image", "video")


def add(conn: sqlite3.Connection, pin_id: str, items: list[dict]) -> None:
    """Записать носители по порядку. Каждый item: kind, file, poster, width,
    height, durationMs — размеры уже сняты сервером."""
    for position, item in enumerate(items):
        kind = item["kind"]
        if kind not in KINDS:
            raise ValueError(f"unknown media kind: {kind}")
        conn.execute(
            "insert into pin_slides (id, pin_id, position, kind, file, width, height, duration_ms, poster) "
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                f"{pin_id}-{position}",
                pin_id,
                position,
                kind,
                item.get("file", ""),
                max(0, min(int(item.get("width") or 0), 20000)),
                max(0, min(int(item.get("height") or 0), 20000)),
                max(0, min(int(item.get("durationMs") or 0), 24 * 3600 * 1000)),
                item.get("poster", ""),
            ),
        )


def rows_map(conn: sqlite3.Connection, pin_ids: list[str]) -> dict[str, list[sqlite3.Row]]:
    """Слайды сразу для всех пинов выборки: по запросу на карточку лента из 20
    пинов превратилась бы в 40 (тот же приём, что в pins.build_cards)."""
    if not pin_ids:
        return {}
    marks = ",".join("?" * len(pin_ids))
    rows = conn.execute(
        f"select * from pin_slides where pin_id in ({marks}) order by pin_id, position",
        pin_ids,
    ).fetchall()
    grouped: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        grouped.setdefault(row["pin_id"], []).append(row)
    return grouped


def json_map(conn: sqlite3.Connection, pin_ids: list[str]) -> dict[str, list[dict]]:
    """Публичные карточки носителей: адрес, тип, размеры, длительность, постер.
    Пустой список у пина без слайдов — клиент тогда живёт на обложке."""
    grouped = rows_map(conn, pin_ids)
    result: dict[str, list[dict]] = {}
    for pin_id, rows in grouped.items():
        slides = []
        for row in rows:
            name = row["file"]
            if not name:
                continue
            slide: dict = {
                "kind": row["kind"],
                "url": uploads.public_url(name),
                "width": row["width"] or None,
                "height": row["height"] or None,
            }
            if row["kind"] == "video":
                if row["duration_ms"]:
                    slide["durationMs"] = row["duration_ms"]
                # поста может не быть (ffmpeg не на этой машине) — тогда
                # <video> покажет первый кадр сам
                if row["poster"]:
                    slide["posterUrl"] = uploads.public_url(row["poster"])
            slides.append(slide)
        result[pin_id] = slides
    return result


def filenames_of(conn: sqlite3.Connection, pin_id: str) -> list[str]:
    """Все файлы носителя — видео и постеры вместе: их стирают erasure и
    правка пина, а после каскада строк их уже не перечислить."""
    rows = conn.execute(
        "select file, poster from pin_slides where pin_id = ? order by position", (pin_id,)
    ).fetchall()
    names = []
    for row in rows:
        names.extend(name for name in (row["file"], row["poster"]) if name)
    return names


def filenames_of_user(conn: sqlite3.Connection, user_id: str) -> list[str]:
    """Файлы носителей всех пинов автора — для стирания аккаунта: строки
    уйдут каскадом по users(id), а файлы остаются на диске, если их не собрать
    заранее."""
    rows = conn.execute(
        "select s.file, s.poster from pin_slides s join pins p on p.id = s.pin_id "
        "where p.user_id = ?",
        (user_id,),
    ).fetchall()
    names = []
    for row in rows:
        names.extend(name for name in (row["file"], row["poster"]) if name)
    return names


def drop_rows(conn: sqlite3.Connection, pin_id: str) -> list[str]:
    """Удалить строки носителей и вернуть их файлы. Нужен при замене слайдов
    целиком: FK-каскад сработает только вместе с пином."""
    names = filenames_of(conn, pin_id)
    conn.execute("delete from pin_slides where pin_id = ?", (pin_id,))
    return names
