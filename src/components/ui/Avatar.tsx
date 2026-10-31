"use client";

// Аватар без сети: картинка пользователя или нейтральный круг с силуэтом
// человека. Раньше без картинки рисовалась первая буква имени — выглядело
// как заглушка-плейсхолдер.

import Image from "next/image";
import { IconUser } from "@/components/ui/Icons";

export function Avatar({
  url,
  size = 40,
}: {
  // name остаётся в пропсах для совместимости вызовов, но больше не рисуется
  name?: string;
  url?: string | null;
  size?: number;
  /** устарел: размер буквы; иконка масштабируется от size */
  textSize?: string;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface"
      style={{ width: size, height: size }}
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
        <IconUser
          size={Math.max(14, Math.round(size * 0.52))}
          className="text-muted"
        />
      )}
    </span>
  );
}
