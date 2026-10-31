// Музей Кливленда: ~40 тыс. работ с открытой лицензией, размер есть в ответе.

import { cached } from "@/lib/server/providers/cache";
import type { Pin } from "@/lib/pin";
import { UA } from "@/lib/server/providers/ua";

type CleArtwork = {
  id: number;
  title: string;
  tombstone?: string;
  type?: string;
  creation_date?: string;
  url?: string;
  creators?: Array<{ description?: string }>;
  images?: { web?: { url?: string } };
};

function clePinFrom(d: CleArtwork, category: string): Pin {
  return {
    id: `cle-${d.id}`,
    title: (d.title || "Произведение искусства").slice(0, 120),
    description: (d.tombstone || "").slice(0, 300),
    category,
    tags: [d.type, d.creation_date].filter((t): t is string => Boolean(t)).slice(0, 4),
    author: d.creators?.[0]?.description || "Cleveland Museum of Art",
    width: 800,
    height: 1067,
    seed: String(d.id),
    likes: 0,
    sourceUrl: d.images?.web?.url as string,
    pageUrl: d.url,
    license: "CC0",
    provider: "cleveland",
  };
}

// Деталь по id: страница пина открывает и карточки из ленты, и прямые ссылки.
export async function getClevelandPin(id: string): Promise<Pin | undefined> {
  try {
    // одиночный эндпоинт отдаёт data объектом, поиск — массивом
    const data = await cached<{ data?: CleArtwork }>(`cle-id:${id}`, async () => {
      const res = await fetch(`https://openaccess-api.clevelandart.org/api/artworks/${id}`, {
        headers: UA,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`cleveland ${res.status}`);
      return (await res.json()) as { data?: CleArtwork };
    });
    const d = data.data;
    if (!d?.images?.web?.url) return undefined;
    return clePinFrom(d, "Искусство");
  } catch {
    return undefined;
  }
}

export async function clevelandPins(
  query: string,
  category: string,
  page: number,
  count = 8,
): Promise<Pin[]> {
  try {
    const data = await cached<{ data: CleArtwork[] }>(
      `cle:${query}:${page}:${count}`,
      async () => {
        const res = await fetch(
          `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query)}&cc0=1&has_image=1&limit=${count}&skip=${(page - 1) * count}`,
          { headers: UA, signal: AbortSignal.timeout(15000) },
        );
        if (!res.ok) throw new Error(`cleveland ${res.status}`);
        return (await res.json()) as { data: CleArtwork[] };
      },
    );
    return (data.data ?? [])
      .filter((d) => d.images?.web?.url)
      .map((d) => clePinFrom(d, category));
  } catch {
    return [];
  }
}
