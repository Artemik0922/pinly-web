#!/usr/bin/env python3
"""Варианты знака Pinly — для выбора, не для прода.

Рисует настоящие кривые (кубические Безье флаттенятся в полигоны), поэтому у
литеры появляется контраст штрихов и нормальный контр — то, чего не было у
конструкции «прямоугольник + pieslice». На выходе — контактный лист: каждый
вариант на светлом и на тёмном.

Запуск из web/:  python scripts/logo-variants.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

BOX = 100  # внутренняя система координат литеры
SCALE = 12  # суперсэмпл
LIGHT_BG = (255, 255, 255, 255)
DARK_BG = (14, 15, 17, 255)
INK_LIGHT = (17, 17, 17, 255)  # знак на светлом
INK_DARK = (255, 255, 255, 255)  # знак на тёмном

OUT = Path(__file__).resolve().parent.parent / ".cache"


# ── микрорастеризатор путей ────────────────────────────────────────────────
def _cubic(p0, p1, p2, p3, steps=48):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def path_to_poly(segments):
    """segments: [("M", (x,y)), ("L", (x,y)), ("C", c1, c2, end), ...]"""
    poly, cur = [], None
    for seg in segments:
        kind = seg[0]
        if kind == "M":
            cur = seg[1]
            poly.append(cur)
        elif kind == "L":
            poly.append(seg[1])
            cur = seg[1]
        elif kind == "C":
            pts = _cubic(cur, seg[1], seg[2], seg[3])
            poly.extend(pts[1:])
            cur = pts[-1]
    return poly


def mask_of(polys, size=BOX):
    """Полигоны → маска с правилом nonzero-через-evenodd для вложенностей."""
    img = Image.new("L", (size * SCALE, size * SCALE), 0)
    d = ImageDraw.Draw(img)
    for poly in polys:
        pts = [(x * SCALE, y * SCALE) for x, y in poly]
        d.polygon(pts, fill=255)
    return img


def evenodd(polys, size=BOX):
    """XOR вложенных контуров: внешний заполнен, внутренний — дырка."""
    out = None
    for poly in polys:
        m = mask_of([poly], size)
        out = m if out is None else ImageChops.difference(out, m)
    return out


# ── литера P: толстый шток, средний обвод, щедрый контр ───────────────────
STEM_L, STEM_R = 26, 43  # шток 17 — тяжелее обвода, иначе буква «выворачивается»
TOP, FOOT = 10, 92
ARM = 11  # толщина перекладин чашки
BOWL_OUT_R = 78  # правый край обвода
BOWL_IN_R = 65  # правый край контра: обвод 13 против штока 17
BOWL_END = 58  # низ чашки
R_STEM = 3.5  # скругление углов стопы


def _rr(x0, y0, x1, y1, r):
    m = Image.new("L", (BOX * SCALE, BOX * SCALE), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [x0 * SCALE, y0 * SCALE, x1 * SCALE, y1 * SCALE], radius=r * SCALE, fill=255
    )
    return m


def letter_mask():
    """Литера собрана из фигур, а не из одного выверенного контура: шток +
    D-обвод минус контр. Так углы не «заворачиваются», а толщина остаётся
    заданной: шток 14, обвод 12-17 — появляется контраст, которого не было
    у версии «прямоугольник + pieslice»."""
    stem = _rr(STEM_L, TOP, STEM_R, FOOT, R_STEM)
    bowl_outer = _rr(STEM_R - 8, TOP, BOWL_OUT_R, BOWL_END, (BOWL_END - TOP) / 2)
    counter = _rr(STEM_R - 2, TOP + ARM, BOWL_IN_R, BOWL_END - ARM, (BOWL_END - TOP - 2 * ARM) / 2)
    bowl = ImageChops.subtract(bowl_outer, counter)
    return ImageChops.lighter(stem, bowl)


def ring_mask(stroke=9, inset=2):
    size = BOX * SCALE
    outer = Image.new("L", (size, size), 0)
    inner = Image.new("L", (size, size), 0)
    r_out = (BOX / 2 - inset) * SCALE
    r_in = r_out - stroke * SCALE
    c = BOX / 2 * SCALE
    ImageDraw.Draw(outer).ellipse([c - r_out, c - r_out, c + r_out, c + r_out], fill=255)
    ImageDraw.Draw(inner).ellipse([c - r_in, c - r_in, c + r_in, c + r_in], fill=255)
    return ImageChops.subtract(outer, inner)


def disc_mask(inset=2):
    size = BOX * SCALE
    m = Image.new("L", (size, size), 0)
    r = (BOX / 2 - inset) * SCALE
    c = BOX / 2 * SCALE
    ImageDraw.Draw(m).ellipse([c - r, c - r, c + r, c + r], fill=255)
    return m


def squircle_mask(radius_frac=0.24, inset=2):
    size = BOX * SCALE
    m = Image.new("L", (size, size), 0)
    a = inset * SCALE
    b = (BOX - inset) * SCALE
    ImageDraw.Draw(m).rounded_rectangle(
        [a, a, b, b], radius=BOX * radius_frac * SCALE, fill=255
    )
    return m


def scaled(mask, frac: float, dy: int = 0):
    """Превью литеры внутри контейнера: масштабируем и центрируем оптически."""
    size = BOX * SCALE
    side = int(size * frac)
    small = mask.resize((side, side), Image.LANCZOS)
    canvas = Image.new("L", (size, size), 0)
    # оптическая центровка: буква чуть выше геометрического центра
    off = (size - side) // 2
    canvas.paste(small, (off, int(off * 0.92) + dy * SCALE))
    return canvas


def tile(kind: str, ink) -> Image.Image:
    """Собирает один знак: ink — цвет чернил, фон прозрачный."""
    letter = letter_mask()
    if kind == "bare":
        mask = scaled(letter, 1.0)
    elif kind == "disc":
        mask = ImageChops.subtract(disc_mask(), scaled(letter, 0.78))
    elif kind == "ring":
        mask = ImageChops.lighter(ring_mask(), scaled(letter, 0.60))
    elif kind == "ring-break":
        inner = scaled(letter, 0.74)
        ring = ImageChops.subtract(ring_mask(), inner)  # кольцо прерывается буквой
        mask = ImageChops.lighter(ring, inner)
    elif kind == "squircle":
        mask = ImageChops.subtract(squircle_mask(), scaled(letter, 0.70))
    elif kind == "disc-tail":
        # внутри диска литера выбита, снаружи — печатается: хвост пересекает
        # окружность, и знак перестаёт быть «пятном с дыркой»
        big = scaled(letter, 0.84, dy=2)
        disc = disc_mask(inset=17)
        mask = ImageChops.lighter(ImageChops.subtract(disc, big), ImageChops.subtract(big, disc))
    else:
        raise ValueError(kind)

    size = BOX * SCALE
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glyph = Image.new("RGBA", (size, size), ink)
    out.paste(glyph, (0, 0), mask.convert("L"))
    return out.resize((200, 200), Image.LANCZOS)


VARIANTS = ["bare", "disc", "disc-tail", "squircle"]


def main():
    OUT.mkdir(exist_ok=True)
    cell, pad, label_h = 200, 24, 34
    sheet = Image.new("RGBA", (cell * 2 + pad * 3, (cell + label_h) * len(VARIANTS) + pad * 2), (245, 245, 245, 255))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()

    for row, kind in enumerate(VARIANTS):
        y = pad + row * (cell + label_h)
        d.text((pad, y - 20), kind, fill=(60, 60, 60, 255), font=font)
        for col, (bg, ink) in enumerate([(LIGHT_BG, INK_LIGHT), (DARK_BG, INK_DARK)]):
            x = pad + col * (cell + pad)
            plate = Image.new("RGBA", (cell, cell), bg)
            plate.alpha_composite(tile(kind, ink), (0, 0))
            sheet.paste(plate, (x, y))
    sheet.save(OUT / "logo-variants.png")
    print("контактный лист:", OUT / "logo-variants.png")


if __name__ == "__main__":
    main()
