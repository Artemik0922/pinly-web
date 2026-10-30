"use client";

// Карточка пина в ленте: картинка в пропорции источника, ховер-оверлей с
// быстрым сохранением и названием.

import Image from "next/image";
import Link from "next/link";
import { memo, useState } from "react";
import { pinImageSize, pinImageUrl, type Pin } from "@/data/pins";
import { SaveControls } from "@/components/SaveControls";

// Пропорции карточек в masonry: 2 колонки на мобильном → 5 на широком экране.
export const CARD_SIZES =
  "(max-width: 640px) 48vw, (max-width: 1024px) 31vw, (max-width: 1280px) 24vw, 19vw";

export function PinImage({
  pin,
  preload = false,
  priority = false,
  onError,
  sizes = CARD_SIZES,
  className = "w-full rounded-2xl",
}: {
  pin: Pin;
  // preload = приоритет: fetchpriority=high + eager + <link rel=preload>.
  // Его дают карточкам над первым экраном; остальным — lazy.
  preload?: boolean;
  // priority = eager + fetchpriority=high. Docs этой версии прямо советуют
  // его вместо preload для картинок над экраном: <link rel=preload> на каждую
  // карточку конкурирует за канал с CSS и JS.
  priority?: boolean;
  sizes?: string;
  className?: string;
  // Ошибка известна не только картинке: карточка без неё оставила бы пустую
  // ячейку с висящим оверлеем.
  onError?: () => void;
}) {
  const [error, setError] = useState(false);
  const src = pinImageUrl(pin);
  const [w, h] = pinImageSize(pin);
  // Абсолютный URL — это моки через weserv: их берёт сам браузер, потому
  // что сервер до weserv не достучится (оптимизатор next/image качает
  // картинку на своей стороне и вернул бы 504). Внутренние пути /api/img и
  // /api/uploads оптимизируются — это и есть основная экономия трафика.
  const external = src.startsWith("http");
  const ratio = { aspectRatio: `${w} / ${h}` };

  // Никаких цветных заглушек: битая картинка — это отсутствие картинки.
  if (error) {
    return null;
  }

  return (
    // Коробка с aspect-ratio резервирует место всегда: картинка доезжает и
    // вставляется в уже готовую ячейку, сетка не перетекает.
    <div style={ratio} className="w-full overflow-hidden rounded-2xl">
      <Image
        src={src}
        alt={pin.title}
        width={w}
        height={h}
        sizes={sizes}
        unoptimized={external}
        preload={preload}
        fetchPriority={priority || preload ? "high" : undefined}
        loading={preload || priority ? "eager" : "lazy"}
        onError={() => {
          setError(true);
          onError?.();
        }}
        className={className}
      />
    </div>
  );
}

export const PinCard = memo(function PinCard({
  pin,
  priority = false,
  preload = false,
}: {
  pin: Pin;
  priority?: boolean;
  preload?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // Битая картинка — это отсутствие карточки. А вот «ещё не загрузилась»
  // прятать перестали: раньше карточка висела в display:none до готовности
  // и опрашивала себя каждые 150 мс. В колонках это означало, что первые N
  // карточек появляются одним блоком и пересобирают раскладку (в профиле —
  // reflow на 55 мс и 453 узла). Место уже зарезервировано aspect-ratio у
  // коробки, поэтому достаточно не рисовать то, что упало.
  if (failed) return null;

  return (
    <div className="group relative">
      <Link
        href={`/pin/${pin.id}`}
        className="block cursor-zoom-in rounded-2xl outline-offset-4 transition-transform duration-200 ease-pop active:scale-[0.97]"
      >
        <div className="overflow-hidden rounded-2xl shadow-card transition-shadow duration-200 group-hover:shadow-overlay">
          <div className="transition-transform duration-200 ease-pop group-hover:scale-[1.02]">
            <PinImage pin={pin} priority={priority} preload={preload} onError={() => setFailed(true)} />
          </div>
        </div>
      </Link>
      {/* Затемнение — только там, где есть ховер. Градиент снизу, а не
          плоская маска: картинка остаётся видно, а название читается.
          На тач-устройствах скрима нет — там подпись в своей плашке. */}
      <div className="pointer-events-none absolute inset-0 hidden rounded-2xl bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:block" />

      {/* Действия: на тач-устройствах видны всегда, на десктопе — по ховеру
          или фокусу клавиатурой (иначе «Сохранить» недостижим) */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100">
        <div className="absolute right-2 top-2" onClick={(e) => e.preventDefault()}>
          <SaveControls pin={pin} />
        </div>
        <p className="absolute inset-x-2 bottom-2 truncate rounded-full bg-black/45 px-3 py-1 text-sm font-semibold text-white sm:inset-x-3 sm:bg-transparent sm:px-0 sm:py-0 sm:drop-shadow">
          {pin.title}
        </p>
      </div>
    </div>
  );
});
