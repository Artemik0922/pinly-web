"use client";

// Аватар без сети: картинка пользователя или цветной круг с инициалами
// (оттенок детерминирован именем — один и тот же автор выглядит одинаково
// в ленте, на странице пина и в комментариях).

import Image from "next/image";

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  url,
  size = 40,
  textSize = "text-sm",
}: {
  name: string;
  url?: string | null;
  size?: number;
  textSize?: string;
}) {
  let hue = 0;
  for (const ch of name) hue = (hue * 37 + ch.codePointAt(0)!) % 360;
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white ${textSize}`}
      style={{ background: `hsl(${hue} 45% 45%)`, width: size, height: size }}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          className="h-full w-full object-cover"
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
