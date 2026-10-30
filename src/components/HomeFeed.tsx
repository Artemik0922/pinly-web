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
  heading,
  intro,
}: {
  category?: string;
  feed?: string;
  initialPins?: Pin[];
  initialCursor?: number | null;
  // Видимый заголовок нужен посадочной странице категории: без h1 страница
  // для поисковика — набор картинок. На главной он остаётся скрытым.
  heading?: string;
  intro?: string;
}) {
  const subscriptions = feed === "subscriptions";

  // Показы считаются по входам в ленту: это базовая единица рекламной модели.
  useEffect(() => {
    track.visit();
  }, []);

  return (
    <>
      {/* на главной заголовок скрыт (лента говорит сама за себя), у
          посадочной страницы категории он видимый: без h1 страница для
          поисковика — набор картинок */}
      <h1
        className={
          heading
            ? "mx-auto w-full max-w-[1800px] px-4 pt-4 text-3xl font-extrabold"
            : "sr-only"
        }
      >
        {heading ?? (subscriptions ? "Лента подписок" : "Лента идей Pinly")}
      </h1>
      <CategoryChips active={category} feed={feed} />
      <div className="mx-auto w-full max-w-[1800px] px-4">
        {intro && (
          <p className="max-w-3xl pb-6 text-sm leading-relaxed text-muted sm:text-[15px]">
            {intro}
          </p>
        )}
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
