"use client";

// Один носитель в карточке и на странице пина: картинка через next/image с
// зарезервированной ячейкой. Отдельный модуль, а не метод PinCard, потому что
// карусель (ui/MediaCarousel) тоже рисует картинки — иначе получился бы цикл
// импортов карточка ⇄ карусель.

import Image from "next/image";
import { useState } from "react";

export function SlideImage({
  src,
  width,
  height,
  alt,
  sizes,
  priority = false,
  preload = false,
  fit = "cover",
  fill = false,
  className = "w-full",
  onError,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  sizes?: string;
  preload?: boolean;
  priority?: boolean;
  // cover — карточка: слайды разной пропорции не должны ломать сетку.
  // contain — страница пина: работу мастера резать незачем, лучше поля.
  fit?: "cover" | "contain";
  // fill — высота уже зарезервирована родителем (карусель стоит в коробке
  // с пропорцией обложки); своя aspect-ratio-коробка тогда не нужна.
  fill?: boolean;
  className?: string;
  onError?: () => void;
}) {
  const [error, setError] = useState(false);
  // Абсолютный URL — это моки через weserv: их берёт сам браузер, потому
  // что сервер до weserv не достучится (оптимизатор next/image качает
  // картинку на своей стороне и вернул бы 504). Внутренние пути /api/img и
  // /api/uploads оптимизируются — это и есть основная экономия трафика.
  const external = src.startsWith("http");

  // Никаких цветных заглушек: битая картинка — это отсутствие картинки.
  if (error) {
    onError?.();
    return null;
  }

  const image = (
    <Image
      src={src}
      alt={alt}
      {...(fill ? {} : { width, height })}
      fill={fill}
      sizes={sizes}
      unoptimized={external}
      preload={preload}
      fetchPriority={priority || preload ? "high" : undefined}
      loading={preload || priority ? "eager" : "lazy"}
      onError={() => setError(true)}
      className={`${className} h-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
    />
  );

  if (fill) {
    return image;
  }

  return (
    // Коробка с aspect-ratio резервирует место всегда: картинка доезжает и
    // вставляется в уже готовую ячейку, сетка не перетекает. Пока байтов нет,
    // ячейка не белая дыра — под картинкой лежит скелетон, и закрытая ссылка
    // на доску в чате выглядит как «работы сейчас появятся», а не как пустой
    // сайт. JS для этого не нужен: картинка перекрывает скелетон сама.
    <div style={{ aspectRatio: `${width} / ${height}` }} className="pin-skeleton w-full overflow-hidden">
      {image}
    </div>
  );
}
