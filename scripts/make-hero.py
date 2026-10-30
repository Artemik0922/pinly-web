# Плитка для шапки README: знак Pinly на светлой подложке.
#
# Знак монохромный и лежит на прозрачном фоне (currentColor в SVG, чёрный в
# растре), поэтому на тёмной теме GitHub он просто исчезает. Белая скруглённая
# подложка делает картинку одинаково читаемой в обеих темах и не требует
# второго файла под каждую.
#
# Источник — public/icons/icon-512.png, который генерирует make-logo.py:
# геометрию здесь не дублируем, только композинг.
#
#   python scripts/make-hero.py

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "icons" / "icon-512.png"
OUT = ROOT / "docs" / "logo-tile.png"

SIZE = 512
TILE = 448  # плитка меньше холста: вокруг остаётся воздушный отступ
RADIUS = 104
INSET = 46  # знак не должен касаться края плитки


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(canvas)
    left = (SIZE - TILE) // 2
    draw.rounded_rectangle(
        [left, left, left + TILE, left + TILE],
        radius=RADIUS,
        fill=(255, 255, 255, 255),
    )

    mark = Image.open(SOURCE).convert("RGBA")
    side = TILE - 2 * INSET
    mark = mark.resize((side, side), Image.LANCZOS)
    canvas.alpha_composite(mark, ((SIZE - side) // 2, (SIZE - side) // 2))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT)
    print(f"{OUT} — {canvas.size[0]}x{canvas.size[1]}")


if __name__ == "__main__":
    main()
