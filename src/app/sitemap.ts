import type { MetadataRoute } from "next";
import { CATEGORIES, PINS } from "@/data/pins";
import { SITE_URL } from "@/lib/site";

// Картируются только публичные постоянные адреса: лента по категориям и
// пины. Поиск, служебные маршруты и пользовательские URL (доски/профили)
// в картах не участвуют — см. robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    priority,
  });

  return [
    entry("/", 1),
    ...CATEGORIES.map((c) => entry(`/?category=${encodeURIComponent(c)}`, 0.7)),
    ...PINS.map((p) => entry(`/pin/${p.id}`, 0.6)),
  ];
}
