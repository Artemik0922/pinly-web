// Главная страница. Первая порция пинов запрашивается на сервере,
// чтобы HTML сразу содержал пины; категория — из ?category=,
// вкладка подписок — из ?feed=subscriptions.

import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { SESSION_COOKIE, getFeedPage } from "@/lib/server/feed";
import { HomeFeed } from "@/components/feed/HomeFeed";
import { SkeletonGrid } from "@/components/ui/SkeletonGrid";
import { CATEGORY_BY_NAME, categoryHref } from "@/lib/categories";
import { pageMetadata } from "@/lib/server/seo";

type Props = { searchParams: Promise<{ category?: string; feed?: string }> };

// У ленты по категории есть постоянный адрес /category/<slug> — именно его
// надо отдавать поисковику. Старый query-путь оставляем живым (ссылки уже
// разосланы), но каноник наводит на чистый URL, а robots.ts закрывает его от
// обхода. Редирект из серверного компонента под PPR превращается в meta-тег
// на уже отправленной оболочке, то есть честного 308 краулер не увидит.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { category, feed } = await searchParams;
  if (feed === "subscriptions") {
    return pageMetadata({ title: "Лента подписок", path: "/", noIndex: true });
  }
  if (!category) return { alternates: { canonical: "/" } };
  const page = CATEGORY_BY_NAME[category];
  // Неизвестная категория — без своего заголовка: страница отдаёт ленту, но
  // в индекс под таким названием идти нельзя.
  if (!page) return { alternates: { canonical: categoryHref(category) } };
  return pageMetadata({ title: page.title, description: page.description, path: categoryHref(category) });
}

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
