// Серверный слой ленты: Openverse как источник, моки как fallback.
// Используется и серверными страницами (SSR), и маршрутом /api/feed.

import { PINS, type Pin } from "@/data/pins";
import { getOpenversePin, getOpenverseRelated, searchOpenverse } from "@/lib/providers/openverse";
import { embedTexts, voyageEnabled } from "@/lib/providers/voyage";
import { loadStore, searchVectors, vectorStoreEnabled } from "@/lib/vector-store";
import { queriesFor } from "@/lib/queries";

export type FeedPage = {
  pins: Pin[];
  nextCursor: number | null; // номер следующей страницы (0-based)
};

const PAGE_SIZE = 20;

function mockPage(category: string | undefined, cursor: number): FeedPage {
  const source = category ? PINS.filter((p) => p.category === category) : PINS;
  const pins = source.slice(cursor * PAGE_SIZE, (cursor + 1) * PAGE_SIZE);
  const next = cursor + 1;
  return { pins, nextCursor: next * PAGE_SIZE < source.length ? next : null };
}

// Страница ленты. Курсор = номер страницы. Для категории страницы
// циклически обходят запросы категории: одна страница = один запрос API,
// поэтому лимиты Openverse расходуются экономно.
export async function getFeedPage(opts: {
  category?: string;
  q?: string;
  cursor?: number;
}): Promise<FeedPage> {
  const { category, q, cursor = 0 } = opts;

  // Поиск: приоритет — векторный (смысловой), затем Openverse, затем моки.
  if (q?.trim()) {
    const query = q.trim();

    if (voyageEnabled() && (await loadStore()).items.length > 0) {
      try {
        const [emb] = (await embedTexts([query])) ?? [];
        if (emb) {
          const hits = await searchVectors(emb, 20);
          if (hits.length > 0) {
            return { pins: hits.map((h) => h.pin), nextCursor: null };
          }
        }
      } catch {
        // векторный поиск не удался — обычные ветки ниже
      }
    }

    const lower = query.toLowerCase();
    try {
      const page = await searchOpenverse(query, cursor + 1, PAGE_SIZE);
      if (page.pins.length > 0) {
        return { pins: page.pins, nextCursor: cursor + 1 < page.pageCount ? cursor + 1 : null };
      }
      // Пусто — покажем моки, лучше пустой страницы.
    } catch {
      // API недоступен — моки.
    }
    // fallback: локальный поиск по мокам
    const matches = PINS.filter(
      (p) =>
        p.title.toLowerCase().includes(lower) ||
        p.tags.some((t) => t.toLowerCase().includes(lower)) ||
        p.category.toLowerCase().includes(lower),
    );
    const pins = matches.slice(cursor * PAGE_SIZE, (cursor + 1) * PAGE_SIZE);
    return { pins, nextCursor: (cursor + 1) * PAGE_SIZE < matches.length ? cursor + 1 : null };
  }

  // Лента: запросы категории по ротации.
  const queries = queriesFor(category);
  const query = queries[cursor % queries.length];
  const openversePage = Math.floor(cursor / queries.length) + 1;

  try {
    const page = await searchOpenverse(query, openversePage, PAGE_SIZE);
    if (page.pins.length > 0) {
      const last = openversePage >= page.pageCount;
      const nextCursor = last ? null : cursor + 1;
      return { pins: page.pins, nextCursor };
    }
    // Пусто (странный запрос или конец выдачи) — показываем моки категории.
  } catch {
    // API недоступен — моки.
  }
  return mockPage(category, cursor);
}

// Один пин: мок по id или деталь Openverse (id вида "ov-<uuid>").
export async function getPinById(id: string): Promise<Pin | undefined> {
  if (id.startsWith("ov-")) {
    return getOpenversePin(id.slice(3));
  }
  return PINS.find((p) => p.id === id);
}

// Похожие: приоритет — векторы (визуально-смысловые), затем related
// Openverse, для моков — теги.
export async function getRelated(pin: Pin, limit = 12): Promise<Pin[]> {
  if (voyageEnabled() && (await loadStore()).items.length > 0) {
    try {
      const text = [pin.title, pin.description, pin.category, ...pin.tags].filter(Boolean).join(". ");
      const [emb] = (await embedTexts([text])) ?? [];
      if (emb) {
        const hits = await searchVectors(emb, limit + 1, pin.id);
        if (hits.length > 0) return hits.map((h) => h.pin);
      }
    } catch {
      // fallthrough к обычным веткам
    }
  }
  if (pin.id.startsWith("ov-")) {
    const query = pin.tags[0] || pin.title.split(" ").slice(0, 3).join(" ") || pin.category;
    try {
      return await getOpenverseRelated(pin.id.slice(3), query, limit);
    } catch {
      return [];
    }
  }
  const sameCategory = PINS.filter((p) => p.id !== pin.id && p.category === pin.category);
  const sharedTags = PINS.filter(
    (p) => p.id !== pin.id && p.category !== pin.category && p.tags.some((t) => pin.tags.includes(t)),
  );
  return [...sameCategory, ...sharedTags].slice(0, limit);
}
