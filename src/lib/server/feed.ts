// Серверный слой ленты: внешние источники как основной контент, моки как
// fallback. Используется и серверными страницами (SSR), и маршрутом /api/feed.
// При сессии пользователя первые ~80% страницы подбираются по вектору вкуса
// (лайки + сохранения), остальное — обычная ротация категорий.

import { createHash } from "node:crypto";
import { cache } from "react";
import { PINS } from "@/data/mock-pins";
import type { Pin } from "@/lib/pin";
import type { FeedPage } from "@/lib/feed-page";
import { getOpenversePin, getOpenverseRelated, searchOpenverse } from "@/lib/server/providers/openverse";
import { commonsPins, getCommonsPin } from "@/lib/server/providers/commons";
import { clevelandPins, getClevelandPin } from "@/lib/server/providers/cleveland";
import { getMealPin, mealdbPins } from "@/lib/server/providers/mealdb";
import { getMetPin, metPins } from "@/lib/server/providers/met";
import { embedTexts, embeddingsEnabled } from "@/lib/server/providers/embeddings";
import { loadStore, searchVectors } from "@/lib/server/vector-store";
import { queriesFor } from "@/lib/server/queries";
import { backendJson } from "@/lib/server/backend";

export { SESSION_COOKIE } from "@/lib/server/backend";
export type { FeedPage };

const PAGE_SIZE = 20;

// ── Источники по префиксу id ────────────────────────────────────────────
// Префикс id пина = кто его выдал (ov-, met-, cle-, wc-, meal-), свои
// загрузки — up-. Деталь и похожие просим у владельца id.
const UPLOAD_SOURCE = "up";

type DetailLoader = (numericId: string) => Promise<Pin | undefined>;

const DETAIL_LOADERS: Record<string, DetailLoader> = {
  ov: getOpenversePin,
  met: getMetPin,
  cle: getClevelandPin,
  wc: getCommonsPin,
  meal: getMealPin,
};

function splitId(id: string): { source: string; rest: string } {
  const dash = id.indexOf("-");
  return dash < 0
    ? { source: "", rest: id }
    : { source: id.slice(0, dash), rest: id.slice(dash + 1) };
}

// ── Пины пользователей (backend/pins.py) ────────────────────────────────
// Node подтягивает их для SSR-ленты и страниц пинов; бэкенд недоступен —
// сайт работает как раньше, только без своих пинов.
async function fetchUserPins(opts: {
  category?: string;
  q?: string;
  limit?: number;
}): Promise<Pin[]> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.q) params.set("q", opts.q);
  if (opts.limit) params.set("limit", String(opts.limit));
  const data = await backendJson<{ pins: Pin[] }>(`/api/user-pins?${params}`, { timeoutMs: 2500 });
  return data?.pins ?? [];
}

// Свои пины — наверх страницы, добор из основного источника.
function mergeGroups(groups: Pin[][], limit = PAGE_SIZE): Pin[] {
  const seen = new Set<string>();
  const out: Pin[] = [];
  for (const group of groups) {
    for (const pin of group) {
      if (seen.has(pin.id)) continue;
      seen.add(pin.id);
      out.push(pin);
      if (out.length === limit) return out;
    }
  }
  return out;
}

// ── Дополнительные источники (музеи, Wikimedia Commons, рецепты) ────────
// У каждой категории свой профиль источников; всё без ключей и доступно
// из РФ, недоступность источника = пустой вклад. Курсор листает выдачу.
const MUSEUM_TERMS: Record<string, { met: string; cleveland: string }> = {
  Искусство: { met: "painting", cleveland: "painting" },
  Архитектура: { met: "architecture", cleveland: "architecture" },
  Мода: { met: "costume", cleveland: "dress" },
};

async function categoryExtras(category: string | undefined, cursor: number): Promise<Pin[]> {
  const page = cursor + 1;
  try {
    if (category === "Рецепты") return await mealdbPins(page, 8);

    const terms = category ? MUSEUM_TERMS[category] : undefined;
    // проверка category рядом с terms — иначе TS не видит, что строка уже не undefined
    if (terms && category) {
      const [met, cleveland] = await Promise.all([
        metPins(terms.met, category, page, 5),
        clevelandPins(terms.cleveland, category, page, 5),
      ]);
      return [...met, ...cleveland];
    }

    // общий фид и остальные категории — Wikimedia Commons
    const queries = queriesFor(category);
    return await commonsPins(queries[cursor % queries.length], category ?? "идеи", page, 6);
  } catch {
    return [];
  }
}

// ── Вектор вкуса (умная лента) ───────────────────────────────────────────
// Сумма векторов лайкнутых (вес 1) и сохранённых (вес 2) пинов из
// .cache/vectors.json — эмбеддингов вызывать не нужно, только сложение.
// Результат кэшируется на 10 минут: лента листается часто, лайки редки.

type Taste = { vector: number[]; exclude: Set<string> };
type TasteIds = { userId: string | null; likeIds: string[]; saveIds: string[] };

const tasteCache = new Map<string, { at: number; taste: Taste | null }>();
const TASTE_TTL_MS = 10 * 60 * 1000;
const PERSONAL_SLOTS = 16; // ~80% страницы

async function tasteFrom({ userId, likeIds, saveIds }: TasteIds): Promise<Taste | null> {
  const store = await loadStore();
  if (!userId || store.items.length === 0) return null;

  const vectors = new Map(store.items.map((it) => [it.pin.id, it.vector]));
  const acc = new Array<number>(store.dim).fill(0);
  let weightSum = 0;
  const add = (ids: string[], weight: number) => {
    for (const id of ids) {
      const vector = vectors.get(id);
      if (!vector) continue;
      const len = Math.min(acc.length, vector.length);
      for (let i = 0; i < len; i++) acc[i] += weight * vector[i];
      weightSum += weight;
    }
  };
  add(likeIds, 1);
  add(saveIds, 2);
  if (weightSum === 0) return null;
  return { vector: acc, exclude: new Set([...likeIds, ...saveIds]) };
}

async function getTaste(session: string | null | undefined): Promise<Taste | null> {
  if (!session) return null;
  const key = createHash("sha256").update(session).digest("hex").slice(0, 16);
  const hit = tasteCache.get(key);
  if (hit && hit.at + TASTE_TTL_MS > Date.now()) return hit.taste;

  const ids = await backendJson<TasteIds>("/api/taste/pins", { session });
  if (!ids) return null; // бэкенд недоступен — обычная лента, не кэшируем
  const taste = await tasteFrom(ids);
  tasteCache.set(key, { at: Date.now(), taste });
  return taste;
}

// Персональные candidates: близко к vector вкуса, без того, что уже
// лайкнуто/сохранено, в нужной категории; курсор листает подборку.
async function personalizedPins(
  taste: Taste,
  category: string | undefined,
  cursor: number,
): Promise<Pin[]> {
  const hits = await searchVectors(taste.vector, PERSONAL_SLOTS * (cursor + 1) + 60);
  const pool = hits
    .map((h) => h.pin)
    .filter((p) => !taste.exclude.has(p.id) && (!category || p.category === category));
  return pool.slice(cursor * PERSONAL_SLOTS, cursor * PERSONAL_SLOTS + PERSONAL_SLOTS);
}

// Счётчик сохранений для не-своих пинов (свои отдают saves сами).
async function fetchSaves(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const data = await backendJson<{ counts: Record<string, number> }>(
    `/api/saves-count?ids=${ids.map(encodeURIComponent).join(",")}`,
  );
  return data?.counts ?? {};
}

function mockPage(category: string | undefined, cursor: number): FeedPage {
  const source = category ? PINS.filter((p) => p.category === category) : PINS;
  const pins = source.slice(cursor * PAGE_SIZE, (cursor + 1) * PAGE_SIZE);
  const next = cursor + 1;
  return { pins, nextCursor: next * PAGE_SIZE < source.length ? next : null };
}

// Локальный поиск по мокам — последний довод, когда внешние источники
// не ответили или не нашли ничего.
function localMockSearch(query: string, cursor: number): FeedPage {
  const lower = query.toLowerCase();
  const matches = PINS.filter(
    (p) =>
      p.title.toLowerCase().includes(lower) ||
      p.tags.some((t) => t.toLowerCase().includes(lower)) ||
      p.category.toLowerCase().includes(lower),
  );
  return {
    pins: matches.slice(cursor * PAGE_SIZE, (cursor + 1) * PAGE_SIZE),
    nextCursor: (cursor + 1) * PAGE_SIZE < matches.length ? cursor + 1 : null,
  };
}

// Поиск: приоритет — векторный (смысловой), затем Openverse, затем моки.
async function searchedPins(
  query: string,
  category: string | undefined,
  cursor: number,
): Promise<FeedPage> {
  if (embeddingsEnabled()) {
    try {
      const [store, embeddings] = await Promise.all([loadStore(), embedTexts([query])]);
      const emb = embeddings?.[0];
      if (store.items.length > 0 && emb) {
        const hits = await searchVectors(emb, 20);
        if (hits.length > 0) return { pins: hits.map((h) => h.pin), nextCursor: null };
      }
    } catch {
      // векторный поиск не удался — обычные ветки ниже
    }
  }

  // свои пины, Wikimedia Commons и Openverse не зависят друг от друга —
  // ждём их вместе: последовательные await складывали бы задержки в сумму
  const [userHits, commonsHits, organic] = await Promise.all([
    fetchUserPins({ q: query, limit: 4 }),
    commonsPins(query, category ?? "идеи", cursor + 1, 4),
    searchOpenverse(query, cursor + 1, PAGE_SIZE).catch(() => null),
  ]);

  // Пусто или API недоступен (странный запрос, конец выдачи, лимит) — моки,
  // лучше чем пустая страница.
  const rest = organic?.pins.length
    ? { pins: organic.pins, nextCursor: cursor + 1 < organic.pageCount ? cursor + 1 : null }
    : localMockSearch(query, cursor);

  return { pins: mergeGroups([userHits, commonsHits, rest.pins]), nextCursor: rest.nextCursor };
}

/** Страница ленты. Курсор = номер страницы.
 *
 *  Ответ живёт в памяти 15 секунд: SSR главной, prefetch Next и догрузка
 *  курсором часто просят одну и ту же страницу в одну и ту же секунду, а за
 *  каждым ответом — веер из трёх-четырёх внешних API.
 */
export async function getFeedPage(opts: {
  category?: string;
  q?: string;
  cursor?: number;
  session?: string | null;
}): Promise<FeedPage> {
  const key = feedKey(opts);

  const fresh = pageCache.get(key);
  if (fresh && fresh.at + PAGE_TTL_MS > Date.now()) return fresh.page;

  // Тот же запрос уже собирается — дождаться дешевле, чем повторить веер
  // заново.
  const flight = pending.get(key);
  if (flight) return flight;

  const task = buildFeedPage(opts).then((page) => {
    remember(key, page);
    return page;
  });
  pending.set(key, task);
  try {
    return await task;
  } finally {
    // Ошибка не кэшируется: следующий запрос попробует снова, а не получает
    // чужой провал все 15 секунд.
    pending.delete(key);
  }
}

// Ключ страницы: кто просит, категория, запрос и номер страницы. Хеш сессии
// вместо cookie — персональная подборка не должна уезжать к другому
// посетителю, а полный ключ в памяти хранить лишним секретом нельзя.
function feedKey(opts: {
  category?: string;
  q?: string;
  cursor?: number;
  session?: string | null;
}): string {
  const who = opts.session
    ? createHash("sha256").update(opts.session).digest("hex").slice(0, 16)
    : "anon";
  return `${who}|${opts.category ?? ""}|${opts.q?.trim().toLowerCase() ?? ""}|${opts.cursor ?? 0}`;
}

const PAGE_TTL_MS = 15_000;
const PAGE_CACHE_MAX = 400;
const pageCache = new Map<string, { at: number; page: FeedPage }>();
const pending = new Map<string, Promise<FeedPage>>();

// Живёт в памяти процесса: при нескольких воркерах кэш не синхронизируется, и
// это нормально — он снимает дубли, а не гарантирует идентичную выдачу.
function remember(key: string, page: FeedPage): void {
  while (pageCache.size >= PAGE_CACHE_MAX) {
    const oldest = pageCache.keys().next().value;
    if (oldest === undefined) break;
    pageCache.delete(oldest);
  }
  pageCache.set(key, { at: Date.now(), page });
}

async function buildFeedPage(opts: {
  category?: string;
  q?: string;
  cursor?: number;
  session?: string | null;
}): Promise<FeedPage> {
  const { category, q, cursor = 0, session } = opts;

  const query = q?.trim();
  if (query) return searchedPins(query, category, cursor);

  // Лента: свои загрузки → персональная подборка (если есть сессия и
  // векторы) → дополнительные источники (музеи/коммонс/рецепты) → ротация
  // категорий. Независимые запросы идут параллельно.
  const queries = queriesFor(category);
  const openversePage = Math.floor(cursor / queries.length) + 1;

  const [uploads, taste, extras, organic] = await Promise.all([
    cursor === 0 ? fetchUserPins({ category, limit: 6 }) : Promise.resolve([] as Pin[]),
    getTaste(session),
    categoryExtras(category, cursor),
    searchOpenverse(
      queries[cursor % queries.length],
      openversePage,
      PAGE_SIZE,
      category ?? "Открытый контент",
    ).catch(() => null),
  ]);
  const personal = taste ? await personalizedPins(taste, category, cursor) : [];

  if (organic && organic.pins.length > 0) {
    const last = openversePage >= organic.pageCount && personal.length === 0;
    return {
      pins: mergeGroups([uploads, extras, personal, organic.pins]),
      nextCursor: last ? null : cursor + 1,
    };
  }
  const mock = mockPage(category, cursor);
  return {
    pins: mergeGroups([uploads, extras, personal, mock.pins]),
    nextCursor: mock.nextCursor,
  };
}

// Один пин: свой (id "up-…"), деталь внешнего источника или мок. Обёрнут в
// React.cache(): generateMetadata и контент страницы просят один и тот же пин
// в одном запросе, без обёртки он тянулся бы дважды (и кэш сохранений тоже).
async function loadPinById(id: string): Promise<Pin | undefined> {
  const { source, rest } = splitId(id);

  if (source === UPLOAD_SOURCE) {
    // бэкенд недоступен — undefined, и страница честно отдаст 404
    return (await backendJson<Pin>(`/api/pin/${id}`, { timeoutMs: 3000 })) ?? undefined;
  }

  const loader = DETAIL_LOADERS[source];
  // id пинов известен заранее — деталь и счётчик сохранений можно не ждать по очереди
  const detail = loader ? loader(rest) : Promise.resolve(PINS.find((p) => p.id === id));
  const [pin, counts] = await Promise.all([detail, fetchSaves([id])]);
  return pin ? { ...pin, saves: counts[pin.id] ?? 0 } : undefined;
}

export const getPinById = cache(loadPinById);

// Похожие: приоритет — векторы (визуально-смысловые), затем related
// источника, для моков — теги.
export async function getRelated(pin: Pin, limit = 12): Promise<Pin[]> {
  // Хранилище векторов и эмбеддинг текста независимы — ждём их вместе
  if (embeddingsEnabled()) {
    try {
      const text = [pin.title, pin.description, pin.category, ...pin.tags]
        .filter(Boolean)
        .join(". ");
      const [store, embeddings] = await Promise.all([loadStore(), embedTexts([text])]);
      const emb = embeddings?.[0];
      if (store.items.length > 0 && emb) {
        const hits = await searchVectors(emb, limit + 1, pin.id);
        if (hits.length > 0) return hits.map((h) => h.pin);
      }
    } catch {
      // fallthrough к обычным веткам
    }
  }

  const { source, rest } = splitId(pin.id);
  if (source === UPLOAD_SOURCE) {
    // свои пины: сначала другие загрузки той же категории, потом моки
    const sameCategory = (
      await fetchUserPins({ category: pin.category, limit: limit + 1 })
    ).filter((p) => p.id !== pin.id);
    if (sameCategory.length > 0) return sameCategory.slice(0, limit);
  } else if (source === "ov") {
    const query = pin.tags[0] || pin.title.split(" ").slice(0, 3).join(" ") || pin.category;
    return getOpenverseRelated(rest, query, limit).catch(() => []);
  }

  const sameCategory = PINS.filter((p) => p.id !== pin.id && p.category === pin.category);
  const sharedTags = PINS.filter(
    (p) =>
      p.id !== pin.id && p.category !== pin.category && p.tags.some((t) => pin.tags.includes(t)),
  );
  return [...sameCategory, ...sharedTags].slice(0, limit);
}
