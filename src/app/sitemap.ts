// Картируются только публичные постоянные адреса: категории, лента, пины и
// доски пользователей, профили. Поиск, служебные маршруты и секретные доски
// в картах не участвуют — см. robots.ts и backend/seo.py.
//
// Карта живая, а не запечённая на билде: содержимое базы меняется между
// сборками, а `connection()` — это request-time API, без которого Next
// отдаёт застывший на сборке список.

import { connection } from "next/server";
import type { MetadataRoute } from "next";
import { PINS } from "@/data/pins";
import { CATEGORY_PAGES } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";

const BACKEND_URL = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";

type SeoUrl = { path: string; lastmod: string };

// Приоритет по типу адреса: доска мастера — витрина, её и показываем;
// отдельный пин вторичен, профиль третичен.
function priorityOf(path: string): number {
  if (path.startsWith("/board/")) return 0.6;
  if (path.startsWith("/pin/")) return 0.5;
  return 0.4;
}

// Обход приходит раз в сутки-двое, а запрос в бэкенд — на каждый заход карты.
// Десять минут достаточно, чтобы не гонять базу при перезагрузках в dev.
const TTL_MS = 10 * 60 * 1000;
let memory: { at: number; urls: SeoUrl[] } | null = null;

async function dbUrls(): Promise<SeoUrl[]> {
  if (memory && memory.at + TTL_MS > Date.now()) return memory.urls;
  let urls: SeoUrl[] = [];
  try {
    const res = await fetch(`${BACKEND_URL}/api/seo/urls`, {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (res.ok) urls = ((await res.json()) as { urls: SeoUrl[] }).urls ?? [];
  } catch {
    urls = []; // бэкенд молчит — карта остаётся статической, но не падает
  }
  memory = { at: Date.now(), urls };
  return urls;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const entry = (
    path: string,
    priority: number,
    lastModified?: string,
  ): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    ...(lastModified ? { lastModified } : null),
    priority,
  });

  const dynamic = await dbUrls();
  return [
    entry("/", 1),
    // чистые адреса категорий; старый ?category= закрыт от обхода в robots.ts
    ...CATEGORY_PAGES.map((page) => entry(`/category/${page.slug}`, 0.7)),
    // пины и доски из базы: без них карта описывает витрину, а не сайт
    ...dynamic.map((u) => entry(u.path, priorityOf(u.path), u.lastmod)),
    // моки ленты — тот же контент, что отдаёт гость без бэкенда
    ...PINS.slice(0, 200).map((p) => entry(`/pin/${p.id}`, 0.3)),
  ];
}
