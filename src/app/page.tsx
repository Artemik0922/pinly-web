// Главная страница. Первая страница ленты запрашивается на сервере,
// чтобы HTML сразу содержал пины; категория — из ?category=.

import { Suspense } from "react";
import { connection } from "next/server";
import { getFeedPage } from "@/lib/feed";
import { HomeFeed } from "@/components/HomeFeed";

type Props = { searchParams: Promise<{ category?: string }> };

async function HomeContent({ searchParams }: Props) {
  // Лента приходит из внешних API и дискового кэша с Date.now() —
  // connection() переводит рендер в серверный, без пререндера.
  await connection();
  const { category } = await searchParams;
  const first = await getFeedPage({ category });
  return (
    <HomeFeed
      category={category}
      initialPins={first.pins}
      initialCursor={first.nextCursor}
    />
  );
}

export default function Home({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-gray-400">Загрузка ленты…</p>}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}
