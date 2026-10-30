// Посадочная страница категории: /category/<slug>.
//
// Зачем она, если лента уже есть на `/?category=…`: у query-адреса нет
// постоянного лица — его не положить в sitemap, он дублирует главную и
// плохо ранжируется. Реклама кормится показами, показы — входом из поиска и
// из чата, поэтому у каждой категории появляется нормальный адрес со своим
// заголовком, описанием и вступлением.
//
// Профиль рендера повторяет главную: `connection()` в корне, а не под
// Suspense. Иначе наружу отдаётся статическая оболочка, лента догоняет
// отдельным запросом после гидрации — и в HTML краулера картинок нет.

import { Suspense, cache } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HomeFeed } from "@/components/HomeFeed";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { pinImageUrl } from "@/data/pins";
import { slugToCategory } from "@/lib/categories";
import { getFeedPage } from "@/lib/feed";
import { SITE_URL, absoluteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

// оболочка без пинов заставляла бы ленту догонять отдельным запросом после
// гидрации, а поисковик получал бы страницу без содержимого — см. раздел
// «Производительность» в README.
export const instant = false;

// Первая порция ленты нужна и метаданным (og:image), и самой странице.
// cache() склеивает оба вызова в один: без него страница дважды ходила бы
// во внешние источники за одними и теми же картинками.
const categoryFeed = cache((name: string) => getFeedPage({ category: name, cursor: 0 }));

async function CategoryContent({ params }: Props) {
  const { slug } = await params;
  const page = slugToCategory(slug);
  if (!page) notFound();
  const first = await categoryFeed(page.name);
  return (
    <HomeFeed
      category={page.name}
      heading={page.name}
      intro={page.intro}
      initialPins={first.pins}
      initialCursor={first.nextCursor}
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Метаданные тоже читают кэш с Date.now() — без connection() пререндер
  // падает на нестабильном значении (тот же приём, что на /pin/[id]).
  await connection();
  const { slug } = await params;
  const page = slugToCategory(slug);
  if (!page) notFound();
  const path = `/category/${page.slug}`;
  // Превью для ссылок в чатах: без og:image доска и категория — серая
  // полоска текста, и в мессенджере на неё не кликают.
  const image = (await categoryFeed(page.name)).pins[0];
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `${SITE_URL}${path}`,
      images: image ? [{ url: absoluteUrl(pinImageUrl(image)), alt: page.title }] : undefined,
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  await connection();
  // Адрес проверяем в корне, чтобы выдуманные slug'и не гнали запрос в
  // внешние источники. Честный 404 из этого не выходит: под PPR оболочка
  // уходит до notFound(), и статус остаётся 200 — фреймворк добавляет к
  // странице noindex, и в индекс она не попадает.
  const { slug } = await params;
  if (!slugToCategory(slug)) notFound();
  return (
    <Suspense fallback={<SkeletonGrid />}>
      <CategoryContent params={params} />
    </Suspense>
  );
}
