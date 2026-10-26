"use client";

/* eslint-disable @next/next/no-img-element -- внешние картинки picsum,
   для моков проще обычный img с width/height, чтобы не настраивать next/image */

import Link from "next/link";
import { useState } from "react";
import { pinImageUrl, type Pin } from "@/data/pins";
import { SaveControls } from "@/components/SaveControls";
import { IconImage } from "@/components/Icons";

// Цвет заглушки, если picsum недоступен: стабильный оттенок по категории.
function fallbackHue(category: string): number {
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function PinImage({ pin }: { pin: Pin }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        style={{ aspectRatio: `${pin.width} / ${pin.height}`, background: `hsl(${fallbackHue(pin.category)} 55% 82%)` }}
        className="grid w-full place-items-center rounded-2xl"
      >
        <IconImage size={28} className="text-muted opacity-50" />
      </div>
    );
  }

  return (
    <img
      src={pinImageUrl(pin)}
      alt={pin.title}
      width={pin.width}
      height={pin.height}
      loading="lazy"
      onError={() => setError(true)}
      className="w-full rounded-2xl"
    />
  );
}

export function PinCard({ pin }: { pin: Pin }) {
  return (
    <div className="group relative">
      <Link href={`/pin/${pin.id}`} className="block cursor-zoom-in">
        <div className="overflow-hidden rounded-2xl transition-shadow duration-200 group-hover:shadow-lg group-hover:shadow-black/20">
          <div className="transition-transform duration-200 group-hover:scale-[1.02]">
            <PinImage pin={pin} />
          </div>
        </div>
      </Link>

      {/* Ховер-оверлей: затемнение, быстрое сохранение, название */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/40 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
        <div className="absolute right-2 top-2" onClick={(e) => e.preventDefault()}>
          <SaveControls pin={pin} />
        </div>
        <p className="absolute bottom-2 left-3 right-3 truncate text-sm font-semibold text-white drop-shadow">
          {pin.title}
        </p>
      </div>
    </div>
  );
}
