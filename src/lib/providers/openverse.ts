// Провайдер Openverse (api.openverse.org): поиск CC-изображений по запросу.
// Запросы кэшируются, картинки отдаются через weserv-прокси.

import { cached } from "@/lib/providers/cache";
import type { Pin } from "@/data/pins";

const API = "https://api.openverse.org/v1/images";
const TIMEOUT_MS = 20000; // первый запрос в этой сети медленный (DNS/TLS)

async function fetchJson(url: string): Promise<unknown> {
  // Одна повторная попытка: холодный TLS-хендшейк иногда выходит
  // за таймаут, повторный запрос проходит за сотни миллисекунд.
  // OPENVERSE_API_KEY поднимает лимиты с 200/день до 10000/день
  // (бесплатная регистрация на api.openverse.org).
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.OPENVERSE_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers,
      });
      if (!res.ok) throw new Error(`Openverse ${res.status} @ ${url}`);
      return res.json();
    } catch (err) {
      if (attempt >= 1) throw err;
    }
  }
}
type OvTag = { name: string };
type OvImage = {
  id: string;
  title: string;
  url: string;
  foreign_landing_url: string;
  creator: string | null;
  creator_url: string | null;
  license: string;
  license_version: string;
  provider: string;
  tags: OvTag[];
  width: number | null;
  height: number | null;
};

// Хосты, блокирующие хотлинк (403 через /api/img) — их картинки
// не показываем вовсе.
const BROKEN_HOSTS = /images\.rawpixel\.com$/;

function normalize(img: OvImage, category: string): Pin | null {
  let host: string;
  try {
    host = new URL(img.url).host;
  } catch {
    return null;
  }
  if (BROKEN_HOSTS.test(host)) return null;
  const width = img.width || 800;
  const height = img.height || 1200;
  return {
    id: `ov-${img.id}`,
    title: img.title?.trim() || "Без названия",
    description: "",
    category,
    tags: (img.tags ?? [])
      .map((t) => t.name)
      .filter((t) => t && t.length <= 24)
      .slice(0, 6),
    author: img.creator || img.provider || "Неизвестный автор",
    width,
    height,
    seed: img.id,
    likes: 0,
    sourceUrl: img.url,
    pageUrl: img.foreign_landing_url,
    license: `${img.license} ${img.license_version}`.trim(),
    provider: img.provider,
  };
}

export type OpenversePage = {
  pins: Pin[];
  pageCount: number;
};

export async function searchOpenverse(
  query: string,
  page: number, // 1-based
  pageSize = 20,
): Promise<OpenversePage> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: String(pageSize),
    // вертикальные и квадратные картинки — масонри выглядит живее
    aspect_ratio: "tall,square,wide",
    mature: "false",
  });
  const data = await cached(
    `ov:${query}:${page}:${pageSize}`,
    () => fetchJson(`${API}?${params}`) as Promise<{ result_count: number; page_count: number; results: OvImage[] }>,
  );
  const pageCount = Math.min(data.page_count ?? 1, 20); // глубокие страницы не нужны
  return {
    pins: (data.results ?? []).map((img) => normalize(img, query)).filter((p): p is Pin => p !== null),
    pageCount: Math.max(pageCount, 1),
  };
}

export async function getOpenversePin(uuid: string): Promise<Pin | undefined> {
  try {
    const img = await cached(`ov-id:${uuid}`, () =>
      fetchJson(`${API}/${uuid}`) as Promise<OvImage>,
    );
    return normalize(img, "открытый контент") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function getOpenverseRelated(
  uuid: string,
  fallbackQuery: string,
  limit = 12,
): Promise<Pin[]> {
  // Сначала официальный related-эндпоинт, при сбое — поиск по тегу/названию.
  try {
    const data = await cached(`ov-rel:${uuid}`, () =>
      fetchJson(`${API}/${uuid}/related?page_size=${limit}`) as Promise<{ results: OvImage[] }>,
    );
    if (data.results?.length) {
      return data.results.map((img) => normalize(img, "похожее")).filter((p): p is Pin => p !== null);
    }
  } catch {
    // fallthrough
  }
  const alt = await searchOpenverse(fallbackQuery, 1, limit);
  return alt.pins.filter((p) => p.id !== `ov-${uuid}`);
}
