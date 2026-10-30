"use client";

// Главная (клиентская часть): чипсы категорий + бесконечная лента
// либо вкладка «Подписки».

import { CategoryChips } from "@/components/CategoryChips";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import { SubscriptionsFeed } from "@/components/SubscriptionsFeed";
import type { Pin } from "@/data/pins";
import { track } from "@/lib/track";
import { useEffect } from "react";

export function HomeFeed({
  category,
  feed,
  initialPins,
  initialCursor,
}: {
  category?: string;
  feed?: string;
  initialPins?: Pin[];
  initialCursor?: number | null;
}) {
  const subscriptions = feed === "subscriptions";

  // Показы считаются по входам в ленту: это базовая единица рекламной модели.
  useEffect(() => {
    track.visit();
  }, []);

  return (
    <>
      {/* заголовок страницы есть у всех остальных маршрутов — здесь он
          визуально скрыт, чтобы скринридер и поисковик понимали, что за лента */}
      <h1 className="sr-only">{subscriptions ? "Лента подписок" : "Лента идей Pinly"}</h1>
      <CategoryChips active={category} feed={feed} />
      <div className="mx-auto w-full max-w-[1800px] px-4">
        {subscriptions ? (
          <SubscriptionsFeed />
        ) : (
          <InfiniteFeed
            key={category ?? "all"}
            category={category}
            initialPins={initialPins}
            initialCursor={initialCursor}
          />
        )}
      </div>
    </>
  );
}
