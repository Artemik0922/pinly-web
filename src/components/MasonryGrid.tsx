"use client";

// Masonry как в Pinterest: CSS-колонки (columns-N) с break-inside: avoid.
//
// Ранее высота каждой карточки замерялась своим ResizeObserver и
// grid-row-span'ом — на ленте в несколько сотен пинов это сотни наблюдателей
// и пересчёт layout при каждом скролле. Пропорции пинов (width/height) приходят
// с сервера, а у картинок стоят атрибуты размеров, поэтому браузер считает
// раскладку сам и без расчётов на клиенте. Порядок — по колонкам сверху вниз,
// как в исходном Pinterest.

import { memo } from "react";
import type { Pin } from "@/data/pins";
import { PinCard } from "@/components/PinCard";

// Сколько первых карточек грузить без lazy. В CSS-колонках с
// column-fill: balance порядок в DOM не совпадает с порядком на экране:
// «первые шесть» оказываются не теми, что вверху, и картинка-кандидат в LCP
// уезжает в низкий приоритет. Берём с запасом — 5 колонок × ~2 ряда.
const ABOVE_THE_FOLD = 4;

export const MasonryGrid = memo(function MasonryGrid({ pins }: { pins: Pin[] }) {
  return (
    <div className="columns-2 gap-4 [column-fill:_balance] sm:columns-3 lg:columns-4 xl:columns-5">
      {pins.map((pin, i) => (
        <div key={pin.id} className="mb-4 break-inside-avoid">
          <PinCard pin={pin} priority={i < ABOVE_THE_FOLD} />
        </div>
      ))}
    </div>
  );
});
