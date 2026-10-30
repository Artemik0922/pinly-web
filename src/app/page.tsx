// Главная страница. Первая порция пинов запрашивается на сервере,
// чтобы HTML сразу содержал пины; категория — из ?category=,
// вкладка подписок — из ?feed=subscriptions.

import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getFeedPage } from "@/lib/feed";
import { HomeFeed } from "@/components/HomeFeed";
import { SkeletonGrid } from "@/components/SkeletonGrid";

type Props = { searchParams: Promise<{ category?: string; feed?: string }> };

async function HomeContent({ searchParams }: Props) {
  const { category, feed } = await searchParams;

  // Вкладку подписок грузит клиент: у неё свой эндпоинт и своё состояние.
  if (feed === "subscriptions") return <HomeFeed feed={feed} />;

  const session = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const first = await getFeedPage({ category, session });
  return <HomeFeed category={category} initialPins={first.pins} initialCursor={first.nextCursor} />;
}

export default async function Home({ searchParams }: Props) {
  // connection() в корне страницы, а не под Suspense: иначе статическая
  // оболочка отдаётся сразу, а лента догоняет отдельным запросом после
  // гидрации — картинки стартуют на ~500 мс позже, чем могли бы.
  await connection();
  return (
    <Suspense fallback={<SkeletonGrid />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}
