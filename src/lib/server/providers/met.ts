// Метрополитен-музей: CC0-работы без ключа и VPN. Карточка нормализуется в
// Pin, картинка идёт через прокси /api/img с дисковым кэшем.
//
// Met не отдаёт размеры изображения — берём вертикальный дефолт, у картин он
// чаще всего и правда вертикальный.

import { cached } from "@/lib/server/providers/cache";
import type { Pin } from "@/lib/pin";

// ── Метрополитен-музей: ~400 тыс. CC0 работ ────────────────────────────

type MetObject = {
  objectID: number;
  isPublicDomain: boolean;
  primaryImageSmall?: string;
  title?: string;
  artistDisplayName?: string;
  objectURL?: string;
  objectDate?: string;
  medium?: string;
  department?: string;
};

const MET_API = "https://collectionapi.metmuseum.org/public/collection/v1";

// У Met-CDН капризный WAF: нестандартный User-Agent получает 404, поэтому
// к их API ходим с дефолтным UA платформы. Wikimedia, наоборот, просит
// представиться — для остальных источников UA задан.
async function metSearchIds(query: string): Promise<number[]> {
  const data = await cached<{ total: number; objectIDs: number[] | null }>(
    `met-search:${query}`,
    async () => {
      const res = await fetch(
        `${MET_API}/1.1/search?q=${encodeURIComponent(query)}&hasImages=true`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!res.ok) throw new Error(`met ${res.status}`);
      return (await res.json()) as { total: number; objectIDs: number[] | null };
    },
  );
  return data.objectIDs ?? [];
}

async function metObject(id: number, category: string): Promise<Pin | null> {
  const obj = await cached<MetObject>(`met-obj:${id}`, async () => {
    const res = await fetch(`${MET_API}/objects/${id}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`met ${res.status}`);
    return (await res.json()) as MetObject;
  });
  if (!obj.isPublicDomain || !obj.primaryImageSmall) return null;
  const tags = [obj.department, obj.medium]
    .filter((t): t is string => Boolean(t))
    .map((t) => t.toLowerCase().slice(0, 24))
    .slice(0, 4);
  return {
    id: `met-${obj.objectID}`,
    title: (obj.title || "Произведение из Метрополитен-музея").slice(0, 120),
    description: [obj.medium, obj.objectDate].filter(Boolean).join(", ").slice(0, 300),
    category,
    tags,
    author: obj.artistDisplayName || "The Met",
    width: 800,
    height: 1067,
    seed: String(obj.objectID),
    likes: 0,
    sourceUrl: obj.primaryImageSmall,
    pageUrl: obj.objectURL,
    license: "CC0",
    provider: "met",
  };
}

// Деталь по id: metObject сам кэширован, WAF-ошибки глушим как в metPins.
export async function getMetPin(id: string): Promise<Pin | undefined> {
  try {
    return (await metObject(Number(id), "Искусство")) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function metPins(
  query: string,
  category: string,
  page: number,
  count = 5,
): Promise<Pin[]> {
  try {
    const ids = await metSearchIds(query);
    if (ids.length === 0) return [];
    // окно страницы по кругу: база пополняется, хвост выдачи не «застревает».
    // Объекты берём строго последовательно: у Met агрессивный WAF, и
    // параллельный всплеск из восьми запросов он отвечает 404.
    const start = ((page - 1) * count) % Math.max(ids.length - count, 1);
    const pins: Pin[] = [];
    for (const id of ids.slice(start, start + count)) {
      const pin = await metObject(id, category);
      if (pin) pins.push(pin);
      if (pins.length >= count) break;
    }
    return pins;
  } catch {
    // Met за Incapsula WAF, который intermittently отдаёт 404 долгоживущим
    // процессам: пустой вклад, backoff-кэш retry-ит с растущим интервалом.
    return [];
  }
}
