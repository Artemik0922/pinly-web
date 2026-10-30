#!/usr/bin/env python3
"""Глубина в монохроме: четыре трактовки одного знака.

Плотность (fill-opacity) вместо серого цвета — тогда один и тот же знак
переворачивается вместе с темой: на светлом «глубина» = чёрный с прозрачностью,
на тёмном = белый с той же прозрачностью.

Запуск из web/:  python scripts/logo-depth.py
"""
from __future__ import annotations
import math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from PIL import Image, ImageChops, ImageDraw
from importlib import import_module

LV = import_module("logo-variants")
BOX, SCALE, S = LV.BOX, LV.SCALE, LV.SCALE
OUT = Path(__file__).resolve().parent.parent / ".cache"


def _size():
    return BOX * SCALE


def _blank():
    return Image.new("L", (_size(), _size()), 0)


def opacity(mask, factor: float) -> Image.Image:
    return mask.point(lambda v: int(v * factor))


def radial_alpha(inner=0.55, outer=1.0, power=1.5):
    """Альфа по радиусу диска: в центре плотность ниже — получается глубина,
    а не плоское пятно."""
    size = _size()
    img = Image.new("L", (size, size), 0)
    px = img.load()
    c = size / 2
    r_max = (BOX / 2 - 2) * SCALE
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / r_max
            if d > 1:
                continue
            t = (1 - d) ** power
            px[x, y] = int(255 * (outer - (outer - inner) * t))
    return img


def plate(mask, ink) -> Image.Image:
    out = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    solid = Image.new("RGBA", mask.size, ink)
    out.paste(solid, (0, 0), mask)
    return out


def _letter_with_tail(tail=118):
    """Та же литера, но шток удлинён вниз: хвост выходит за диск, и только
    он. Раньше я увеличивал литеру целиком — из-за этого выбойка съедала
    диск и знак превращался в полумесяц."""
    stem = LV._rr(LV.STEM_L, LV.TOP, LV.STEM_R, tail, LV.R_STEM)
    bowl = LV._rr(LV.STEM_R - 8, LV.TOP, LV.BOWL_OUT_R, LV.BOWL_END, (LV.BOWL_END - LV.TOP) / 2)
    counter = LV._rr(LV.STEM_R - 2, LV.TOP + LV.ARM, LV.BOWL_IN_R, LV.BOWL_END - LV.ARM,
                     (LV.BOWL_END - LV.TOP - 2 * LV.ARM) / 2)
    solid = ImageChops.lighter(stem, bowl)
    return ImageChops.subtract(solid, counter), solid


def _letter_solid():
    """Литера целиком, с залитым контром — нужна, чтобы вернуть диску его
    собственное отверстие там, где литера его выбивает."""
    stem = LV._rr(LV.STEM_L, LV.TOP, LV.STEM_R, LV.FOOT, LV.R_STEM)
    bowl = LV._rr(LV.STEM_R - 8, LV.TOP, LV.BOWL_OUT_R, LV.BOWL_END, (LV.BOWL_END - LV.TOP) / 2)
    return ImageChops.lighter(stem, bowl)


def half_masks(above=True):
    """Полуплоскости для плетения: что идёт над чем."""
    size = _size()
    top = _blank()
    ImageDraw.Draw(top).rectangle([0, 0, size, size // 2], fill=255)
    bottom = ImageChops.invert(top)
    return top if above else bottom


def dilate(mask, units=1.6):
    from PIL import ImageFilter
    k = max(3, int(units * SCALE) | 1)
    return mask.filter(ImageFilter.MaxFilter(k))


def tile(kind: str, ink):
    disc = LV.disc_mask(inset=2)
    letter = LV.scaled(LV.letter_mask(), 0.95, dy=3)

    if kind == "seam":
        # литера проходит сквозь диск: внутри она выбита, снаружи печатается,
        # а на самой границе остаётся полупрозрачный шов — ощущение стекла
        inside = ImageChops.multiply(letter, disc)
        outside = ImageChops.subtract(letter, disc)
        band = ImageChops.subtract(disc, LV.disc_mask(inset=7))
        seam = opacity(ImageChops.multiply(letter, band), 0.38)
        mask = ImageChops.lighter(ImageChops.lighter(ImageChops.subtract(disc, inside), outside), seam)

    elif kind == "tone":
        # плотность диска падает к краям: объём без единой нарисованной тени
        grad = ImageChops.multiply(radial_alpha(0.42, 1.0), disc)
        mask = ImageChops.lighter(
            ImageChops.subtract(grad, letter), ImageChops.subtract(letter, disc)
        )

    elif kind == "shadow":
        # смещённая копия литеры внутри диска — мягкий провал
        shift = _blank()
        shift.paste(letter, (int(2.4 * SCALE), int(2.8 * SCALE)))
        base = ImageChops.subtract(disc, letter)
        mask = ImageChops.lighter(base, opacity(ImageChops.multiply(shift, base), 0.34))

    elif kind == "weave":
        # плетение: вверху кольцо идёт над литерой, внизу — под ней; между
        # ними зазор, иначе «над/под» не читается
        ring = ImageChops.subtract(LV.disc_mask(inset=2), LV.disc_mask(inset=9))
        top, bottom = half_masks(True), half_masks(False)
        cut_letter = dilate(ImageChops.multiply(ImageChops.multiply(ring, letter), top))
        cut_ring = dilate(ImageChops.multiply(ImageChops.multiply(ring, letter), bottom))
        mask = ImageChops.lighter(ImageChops.subtract(letter, cut_letter), ImageChops.subtract(ring, cut_ring))

    elif kind == "thread":
        # одна точка пересечения, как у Pinterest: хвост литеры выходит за
        # диск через зазор. Диск остаётся цельным и читается на 16px, а
        # зазор даёт глубину — литера проходит сквозь край, а не наклеена
        # диск уменьшен (inset=14), а не хвост удлинён: на холсте 100 юнитов
        # длинный шток просто обрезался бы краем
        disc = LV.disc_mask(inset=14)
        big = LV.scaled(LV.letter_mask(), 0.72, dy=4)
        solid = LV.scaled(_letter_solid(), 0.72, dy=4)
        inside = ImageChops.multiply(big, disc)
        counter_back = ImageChops.subtract(ImageChops.multiply(solid, disc), big)
        outside = ImageChops.subtract(big, dilate(disc, 2.1))
        mask = ImageChops.lighter(
            ImageChops.lighter(ImageChops.subtract(disc, inside), counter_back), outside
        )

    else:
        raise ValueError(kind)
    return plate(mask, ink).resize((220, 220), Image.LANCZOS)


KINDS = ["thread", "shadow"]


def main():
    cell, pad = 220, 26
    sheet = Image.new("RGBA", (cell * 2 + pad * 3, (cell + 30) * len(KINDS) + pad), (244, 244, 244, 255))
    d = ImageDraw.Draw(sheet)
    for row, kind in enumerate(KINDS):
        y = pad + row * (cell + 30)
        d.text((pad, y - 24), kind, fill=(70, 70, 70, 255))
        for col, (bg, ink) in enumerate([(LV.LIGHT_BG, LV.INK_LIGHT), (LV.DARK_BG, LV.INK_DARK)]):
            p = Image.new("RGBA", (cell, cell), bg)
            full = tile(kind, ink)
            p.alpha_composite(full, (cell // 2 - 90, 0))
            p.alpha_composite(full.resize((56, 56), Image.LANCZOS), (cell - 62, cell - 66))
            p.alpha_composite(full.resize((24, 24), Image.LANCZOS), (cell - 30, cell - 30))
            sheet.paste(p, (pad + col * (cell + pad), y))
    OUT.mkdir(exist_ok=True)
    sheet.save(OUT / "logo-depth.png")
    print("лист:", OUT / "logo-depth.png")


if __name__ == "__main__":
    main()
