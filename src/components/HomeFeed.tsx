"use client";

// Главная (клиентская часть): чипсы категорий + бесконечная лента.
// Первая порция пинов приходит с сервера, дальше — инфинити-скролл.

import { CategoryChips } from "@/components/CategoryChips";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import type { Pin } from "@/data/pins";

export function HomeFeed({
  category,
  initialPins,
  initialCursor,
}: {
  category?: string;
  initialPins: Pin[];
  initialCursor: number | null;
}) {
  return (
    <>
      <CategoryChips active={category} />
      <div className="mx-auto w-full max-w-[1800px] px-4">
        <InfiniteFeed
          key={category ?? "all"}
          category={category}
          initialPins={initialPins}
          initialCursor={initialCursor}
        />
      </div>
    </>
  );
}
