#!/usr/bin/env python3
"""Генератор знака Pinly — «thread»: диск, сквозь который проходит литера.

Почему именно эта конструкция (отсмотрена контактными листами в .cache):
  · литера с настоящим контрастом штрихов — шток 17 юнитов, обвод чашки 13,
    щедрый контр: до этого знак выглядел то «пятном с дыркой», то буквой,
    жирнеющей к правому краю;
  · глубина сделана не цветом, а слоем: хвост литеры выходит за край диска
    через зазор, поэтому буква читается проходящей сквозь круг, а не
    наклеенной сверху;
  · диск остаётся цельным и тяжёлым — на 16px (favicon) и 24px (строка вкладок)
    знак не рассыпается, в отличие от варианта с тонким кольцом;
  · монохром на currentColor: в светлой теме знак --foreground, в тёмной —
    почти белый, вторая картинка не нужна и при переключении нет мигания.

Путь Pinterest как товарный знак не повторяется: взята идиома «буква сквозь
круг», геометрия своя и параметрическая.

Один источник правды: отсюда выходят SVG, React-компонент и все растры
(favicon/ico/apple-touch/512). Запуск из web/:  python scripts/make-logo.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

# ── базовая геометрия литеры (холст 100×100) ───────────────────────────────
STEM_L, STEM_R = 26, 43  # шток 17 — тяжелее обвода
TOP, FOOT = 10, 92
ARM = 11  # толщина перекладин чашки
BOWL_OUT_R = 78  # правый край обвода
BOWL_IN_R = 65  # правый край контра → обвод 13
BOWL_END = 58  # низ чашки
R_STEM = 3.5  # скругление стопы

# посадка литеры в знак
LETTER_SCALE = 0.72
LETTER_DY = 4  # оптический сдвиг вниз
DISC_INSET = 14  # радиус диска = 50 − inset
GAP = 2.1  # зазор между диском и выходящим хвостом

SCALE = 12  # суперсэмпл растра
BLACK = (17, 17, 17, 255)  # --foreground светлой темы
WHITE = (255, 255, 255, 255)

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"
APP_DIR = ROOT / "src" / "app"
COMPONENT = ROOT / "src" / "components" / "LogoMark.tsx"

DISC_C = 50.0
R_DISC = 50 - DISC_INSET


def _tx(v: float) -> float:
    off = (100 - 100 * LETTER_SCALE) / 2
    return off + v * LETTER_SCALE


def _ty(v: float) -> float:
    off = (100 - 100 * LETTER_SCALE) / 2
    return int(off * 0.92) + LETTER_DY + v * LETTER_SCALE


# ── растр ──────────────────────────────────────────────────────────────────
def _rr(x0, y0, x1, y1, r) -> Image.Image:
    m = Image.new("L", (100 * SCALE, 100 * SCALE), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [x0 * SCALE, y0 * SCALE, x1 * SCALE, y1 * SCALE], radius=r * SCALE, fill=255
    )
    return m


def _disc(inset: float) -> Image.Image:
    m = Image.new("L", (100 * SCALE, 100 * SCALE), 0)
    r = (50 - inset) * SCALE
    c = 50 * SCALE
    ImageDraw.Draw(m).ellipse([c - r, c - r, c + r, c + r], fill=255)
    return m


def _letter_parts():
    """Литера собрана из фигур, а не из одного выверенного контура: шток +
    D-обвод минус контр. Так толщина остаётся заданной, а углы не заворачиваются."""
    stem = _rr(_tx(STEM_L), _ty(TOP), _tx(STEM_R), _ty(FOOT), R_STEM * LETTER_SCALE)
    bowl = _rr(
        _tx(STEM_R - 8),
        _ty(TOP),
        _tx(BOWL_OUT_R),
        _ty(BOWL_END),
        (BOWL_END - TOP) / 2 * LETTER_SCALE,
    )
    counter = _rr(
        _tx(STEM_R - 2),
        _ty(TOP + ARM),
        _tx(BOWL_IN_R),
        _ty(BOWL_END - ARM),
        (BOWL_END - TOP - 2 * ARM) / 2 * LETTER_SCALE,
    )
    solid = ImageChops.lighter(stem, bowl)
    return solid, ImageChops.subtract(solid, counter)


def mark_mask() -> Image.Image:
    """Диск минус литера, плюс её контр, плюс хвост снаружи — через зазор."""
    solid, letter = _letter_parts()
    disc = _disc(DISC_INSET)
    inside = ImageChops.multiply(letter, disc)
    counter_back = ImageChops.subtract(ImageChops.multiply(solid, disc), letter)
    outside = ImageChops.subtract(letter, _disc(DISC_INSET - GAP))
    return ImageChops.lighter(
        ImageChops.lighter(ImageChops.subtract(disc, inside), counter_back), outside
    )


def render(size: int, color, background=None) -> Image.Image:
    mask = mark_mask().resize((size, size), Image.LANCZOS)
    img = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (size, size), color), (0, 0), mask)
    return img


# ── вектор: те же числа, те же формы ───────────────────────────────────────
def _rrect_path(x0, y0, x1, y1, r) -> str:
    return (
        f"M{x0 + r},{y0} H{x1 - r} A{r},{r} 0 0,1 {x1},{y0 + r} "
        f"V{y1 - r} A{r},{r} 0 0,1 {x1 - r},{y1} "
        f"H{x0 + r} A{r},{r} 0 0,1 {x0},{y1 - r} "
        f"V{y0 + r} A{r},{r} 0 0,1 {x0 + r},{y0} Z"
    )


def _dome_path(x0, y0, x1, y1, cw=True) -> str:
    """Прямоугольник с полуокружностью справа — D-обвод чашки. cw=False идёт
    против часовой, и по правилу nonzero контр вычитается."""
    r = (y1 - y0) / 2
    if cw:
        return f"M{x0},{y0} H{x1 - r} A{r},{r} 0 0,1 {x1 - r},{y1} H{x0} Z"
    return f"M{x0},{y1} V{y0} H{x1 - r} A{r},{r} 0 0,0 {x1 - r},{y1} Z"


def letter_subpaths() -> str:
    stem = _rrect_path(_tx(STEM_L), _ty(TOP), _tx(STEM_R), _ty(FOOT), R_STEM * LETTER_SCALE)
    bowl = _dome_path(_tx(STEM_R - 8), _ty(TOP), _tx(BOWL_OUT_R), _ty(BOWL_END))
    counter = _dome_path(
        _tx(STEM_R - 2), _ty(TOP + ARM), _tx(BOWL_IN_R), _ty(BOWL_END - ARM), cw=False
    )
    return f"{stem} {bowl} {counter}"


def disc_subpath() -> str:
    return (
        f"M{DISC_C - R_DISC},{DISC_C} a{R_DISC},{R_DISC} 0 1,0 {2 * R_DISC},0 "
        f"a{R_DISC},{R_DISC} 0 1,0 {-2 * R_DISC},0 Z"
    )


def svg_document() -> str:
    """Вектор собран из масок, а не из одного path.

    Соблазн был велик: диск + литера + контр одним path с evenodd. Но evenodd
    считает пересечения без учёта направления, и наложение штока на чашку
    давало дыру вместо союза букв. nonzero-союз и «вычесть из диска» в одном
    path не живут, поэтому: маска вырезает литеру из диска, вторая маска
    оставляет только тот кусок литеры, что вышел за край."""
    letter = letter_subpaths()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" '
        'aria-label="Pinly">'
        '<defs>'
        '<mask id="pinly-disc"><circle cx="{c}" cy="{c}" r="{r}" fill="#fff"/>'
        '<path d="{letter}" fill="#000" fill-rule="nonzero"/></mask>'
        '<mask id="pinly-tail"><rect width="100" height="100" fill="#fff"/>'
        '<circle cx="{c}" cy="{c}" r="{rg}" fill="#000"/></mask>'
        "</defs>"
        '<circle cx="{c}" cy="{c}" r="{r}" fill="currentColor" mask="url(#pinly-disc)"/>'
        '<path d="{letter}" fill="currentColor" fill-rule="nonzero" mask="url(#pinly-tail)"/>'
        "</svg>\n"
    ).format(c=DISC_C, r=R_DISC, rg=R_DISC + GAP, letter=letter)


def write_svg() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    (ICONS / "logo.svg").write_text(svg_document(), encoding="utf-8", newline="\n")


def write_component() -> None:
    component = f"""// Монохромный знак Pinly: диск, сквозь который проходит литера P.
//
// Геометрию поставляет scripts/make-logo.py — руками здесь не правим, иначе
// favicon и шапка разъедутся. Цвет currentColor: в светлой теме это
// --foreground (почти чёрный), в тёмной — почти белый; второй картинки нет,
// и при переключении темы знак не мигает.
//
// Дыра в диске и выходящий хвост сделаны масками, а не одним path: evenodd
// вырезал бы союз штока и чашки с дырой на их пересечении.

import {{ useId }} from "react";

const LETTER = "{letter_subpaths()}";
const R_DISC = {R_DISC};
const GAP = {GAP};

export function LogoMark({{ className = "" }}: {{ className?: string }}) {{
  // id маски обязан быть уникальным: два знака на одной странице (шапка и
  // подвал) с общим id подменяют маску друг у друга
  const uid = useId();
  const discMask = `disc${{uid}}`;
  const tailMask = `tail${{uid}}`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={{className}}>
      <defs>
        <mask id={{discMask}}>
          <circle cx="50" cy="50" r={{R_DISC}} fill="#fff" />
          <path d={{LETTER}} fill="#000" fillRule="nonzero" />
        </mask>
        <mask id={{tailMask}}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="50" cy="50" r={{R_DISC + GAP}} fill="#000" />
        </mask>
      </defs>
      <circle
        cx="50"
        cy="50"
        r={{R_DISC}}
        fill="currentColor"
        mask={{`url(#${{discMask}})`}}
      />
      <path
        d={{LETTER}}
        fill="currentColor"
        fillRule="nonzero"
        mask={{`url(#${{tailMask}})`}}
      />
    </svg>
  );
}}
"""
    COMPONENT.write_text(component, encoding="utf-8", newline="\n")


def write_favicons() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    render(32, BLACK).save(ICONS / "icon-light.png")
    render(32, WHITE).save(ICONS / "icon-dark.png")
    render(512, BLACK).save(ICONS / "icon-512.png")
    render(180, WHITE, background=BLACK).save(ICONS / "apple-icon.png")
    render(48, BLACK).save(APP_DIR / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


def write_preview() -> Path:
    out = ROOT / ".cache"
    out.mkdir(exist_ok=True)
    path = out / "logo-final.png"
    sheet = Image.new("RGBA", (240 * 2 + 24, 240), (255, 255, 255, 255))
    light = render(240, BLACK)
    sheet.paste(light, (0, 0), light)
    dark = Image.new("RGBA", (240, 240), (14, 15, 17, 255))
    white = render(240, WHITE)
    dark.paste(white, (0, 0), white)
    sheet.paste(dark, (264, 0), dark)
    sheet.save(path)
    return path


def main() -> None:
    write_svg()
    write_component()
    write_favicons()
    preview = write_preview()
    print("готово")
    print("  svg:", ICONS / "logo.svg")
    print("  компонент:", COMPONENT)
    print("  иконки:", ", ".join(sorted(p.name for p in ICONS.glob("*"))))
    print("  favicon:", APP_DIR / "favicon.ico")
    print("  превью:", preview)


if __name__ == "__main__":
    main()
