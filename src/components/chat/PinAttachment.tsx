"use client";

// Пин-вложение в сообщении. Если картинка не доехала (пин удалили, файл
// пропал) — компактная подпись вместо пустой коробки: пустая клетка
// выглядела бы как заглушка.

import Link from "next/link";
import { useState } from "react";
import { PinImage } from "@/components/feed/PinCard";
import { IconPin } from "@/components/ui/Icons";
import type { Pin } from "@/lib/pin";

export function PinAttachment({ pin }: { pin: { id: string; card: Pin | null } }) {
  const [failed, setFailed] = useState(false);
  if (failed || !pin.card) {
    return (
      <Link
        href={`/pin/${pin.id}`}
        className="flex max-w-52 items-center gap-2 rounded-full bg-surface-card px-4 py-2.5 text-sm font-semibold hover:opacity-90"
      >
        <IconPin size={16} className="shrink-0" />
        <span className="truncate">{pin.card?.title || pin.id}</span>
      </Link>
    );
  }
  return (
    <Link
      href={`/pin/${pin.id}`}
      className="block w-52 overflow-hidden rounded-2xl bg-surface-card p-1.5 ring-1 ring-border-soft hover:opacity-90"
    >
      <PinImage
        pin={pin.card}
        sizes="208px"
        className="w-full"
        onError={() => setFailed(true)}
      />
      <span className="mt-1 line-clamp-2 block px-1.5 pb-1 text-xs font-semibold">
        {pin.card.title}
      </span>
    </Link>
  );
}
