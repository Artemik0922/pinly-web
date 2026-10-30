// Серверный слой ленты: Openverse как источник, моки как fallback.
// Используется и серверными страницами (SSR), и маршрутом /api/feed.
// При сессии пользователя первые ~80% страницы подбираются по вектору
// вкуса (лайки + сохранения), остальное — обычная ротация категорий.
import { createHash } from "node:crypto";
import { cache } from "react";
import { PINS, type Pin } from "@/data/pins";
import { getOpenversePin, getOpenverseRelated, searchOpenverse } from "@/lib/providers/openverse";
import {
  commonsPins,
  clevelandPins,
  getClevelandPin,
  getCommonsPin,
  getMealPin,
  getMetPin,
  mealdbPins,
  metPins,
} from "@/lib/providers/extras";
import { embedTexts, embeddingsEnabled } from "@/lib/providers/embeddings";
import { loadStore, searchVectors } from "@/lib/vector-store";
import { queriesFor } from "@/lib/queries";

export type FeedPage = {
  pins: Pin[];
  nextCursor: number | null; // номер следующей страницы (0-based)
};

const PAGE_SIZE = 20;

// Имя cookie сессии совпадает с SESSION_COOKIE в backend/accounts.py.
export const SESSION_COOKIE = "pinly_session";

// Пины пользователей живут в Python-бэкенде (backend/pins.py). Node
// подтягивает их для SSR-ленты и страниц пинов; бэкенд недоступен —
// сайт работает как раньше, только без своих пинов.
const BACKEND_URL = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";

async function fetchUserPins(opts: {
  category?: string;
  q?: string;
  limit?: number;
}): Promise<Pin[]> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.q) params.set("q", opts.q);
  if (opts.limit) params.set("limit", String(opts.limit));
  try {
    const res = await fetch(`${BACKEND_URL}/api/user-pins?${params}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { pins: Pin[] };
    return data.pins ?? [];
  } catch {
    return []; // бэкенд не запущен — без пользовательских пинов
  }
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
async function categoryExtras(category: string | undefined, cursor: number): Promise<Pin[]> {
  const page = cursor + 1;
  try {
    if (category === "Рецепты") {
      return await mealdbPins(page, 8);
    }
    if (category === "Искусство") {
      const [met, cle] = await Promise.all([
        metPins("painting", category, page, 5),
        clevelandPins("painting", category, page, 5),
      ]);
      return [...met, ...cle];
    }
    if (category === "Архитектура") {
      const [met, cle] = await Promise.all([
        metPins("architecture", category, page, 5),
        clevelandPins("architecture", category, page, 5),
      ]);
      return [...met, ...cle];
    }
    if (category === "Мода") {
      const [met, cle] = await Promise.all([
        metPins("costume", category, page, 5),
        clevelandPins("dress", category, page, 5),
      ]);
      return [...met, ...cle];
    }
    // общий фид и остальные категории — Wikimedia Commons
    const queries = queriesFor(category);
    const query = queries[cursor % queries.length];
    return await commonsPins(query, category ?? "идеи", page, 6);
  } catch {
    return [];
  }
}

// ── Вектор вкуса (умная лента) ───────────────────────────────────────────
// Сумма векторов лайкнутых (вес 1) и сохранённых (вес 2) пинов из
// .cache/vectors.json — эмбеддингов вызывать не нужно, только сложение.
// Результат кэшируется на 10 минут: лента листается часто, лайки редки.

type Taste = { vector: number[]; exclude: Set<string> };

const tasteCache = new Map<string, { at: number; taste: Taste | null }>();
const TASTE_TTL_MS = 10 * 60 * 1000;
const PERSONAL_SLOTS = 16; // ~80% страницы

async function getTaste(session: string | null | undefined): Promise<Taste | null> {
  if (!session) return null;
  const key = createHash("sha256").update(session).digest("hex").slice(0, 16);
  const hit = tasteCache.get(key);
  if (hit && hit.at + TASTE_TTL_MS > Date.now()) return hit.taste;

  let taste: Taste | null = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/taste/pins`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      userId: string | null;
      likeIds: string[];
      saveIds: string[];
    };
    const store = await loadStore();
    if (data.userId && store.items.length > 0) {
      const vectors = new Map(store.items.map((it) => [it.pin.id, it.vector]));
      const acc = new Array<number>(store.dim).fill(0);
      let weightSum = 0;
      const add = (ids: string[], weight: number) => {
        for (const id of ids) {
          const v = vectors.get(id);
          if (!v) continue;
          const len = Math.min(acc.length, v.length);
          for (let i = 0; i < len; i++) acc[i] += weight * v[i];
          weightSum += weight;
        }
      };
      add(data.likeIds, 1);
      add(data.saveIds, 2);
      if (weightSum > 0) {
        taste = { vector: acc, exclude: new Set([...data.likeIds, ...data.saveIds]) };
      }
    }
  } catch {
    return null; // бэкенд недоступен — обычная лента, не кэшируем
  }
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
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/saves-count?ids=${ids.map(encodeURIComponent).join(",")}`,
      {
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!res.ok) return {};
    const data = (await res.json()) as { counts: Record<string, number> };
    return data.counts ?? {};
  } catch {
    return {};
  }
}

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
  session?: string | null;
}): Promise<FeedPage> {
  const { category, q, cursor = 0, session } = opts;

  // Поиск: приоритет — векторный (смысловой), затем Openverse, затем моки.
  if (q?.trim()) {
    const query = q.trim();

    if (embeddingsEnabled()) {
      try {
        const [store, embeddings] = await Promise.all([loadStore(), embedTexts([query])]);
        const emb = embeddings?.[0];
        if (store.items.length > 0 && emb) {
          const hits = await searchVectors(emb, 20);
          if (hits.length > 0) {
            return { pins: hits.map((h) => h.pin), nextCursor: null };
          }
        }
      } catch {
        // векторный поиск не удался — обычные ветки ниже
      }
    }

    // свои пины по названию/тегам — наверх выдачи
    const userHits = await fetchUserPins({ q: query, limit: 4 });
    // Wikimedia Commons по тому же запросу — дополнительная выдача
    const commonsHits = await commonsPins(query, category ?? "идеи", cursor + 1, 4);

    const lower = query.toLowerCase();
    try {
      const page = await searchOpenverse(query, cursor + 1, PAGE_SIZE);
      if (page.pins.length > 0) {
        return {
          pins: mergeGroups([userHits, commonsHits, page.pins]),
          nextCursor: cursor + 1 < page.pageCount ? cursor + 1 : null,
        };
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
    return {
      pins: mergeGroups([userHits, commonsHits, pins]),
      nextCursor: (cursor + 1) * PAGE_SIZE < matches.length ? cursor + 1 : null,
    };
  }

  // Лента: свои загрузки → персональная подборка (если есть сессия и
  // векторы) → дополнительные источники (музеи/коммонс/рецепты) → ротация
  // категорий. Независимые запросы идут параллельно: последовательные
  // await складывали бы их задержки в сумму.
  const queries = queriesFor(category);
  const query = queries[cursor % queries.length];
  const openversePage = Math.floor(cursor / queries.length) + 1;

  const [uploads, taste, extras, organic] = await Promise.all([
    cursor === 0 ? fetchUserPins({ category, limit: 6 }) : Promise.resolve([] as Pin[]),
    getTaste(session),
    categoryExtras(category, cursor),
    searchOpenverse(query, openversePage, PAGE_SIZE, category ?? "Открытый контент").catch(
      () => null,
    ),
  ]);
  const personal = taste ? await personalizedPins(taste, category, cursor) : [];

  if (organic && organic.pins.length > 0) {
    const last = openversePage >= organic.pageCount && personal.length === 0;
    return {
      pins: mergeGroups([uploads, extras, personal, organic.pins]),
      nextCursor: last ? null : cursor + 1,
    };
  }
  // Пусто или API недоступен (странный запрос, конец выдачи, лимит) — моки.
  const mock = mockPage(category, cursor);
  return {
    pins: mergeGroups([uploads, extras, personal, mock.pins]),
    nextCursor: mock.nextCursor,
  };
}

// Один пин: свой (id "up-…"), деталь внешнего источника (ov-/met-/cle-/wc-/
// meal-, префикс совпадает с provider) или мок. Обёрнут в React.cache():
// generateMetadata и контент страницы просят один и тот же пин в одном
// запросе, без обёртки он тянулся бы дважды (и кэш сохранений тоже).
async function loadPinById(id: string): Promise<Pin | undefined> {
  if (id.startsWith("up-")) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/pin/${id}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return (await res.json()) as Pin;
    } catch {
      return undefined; // бэкенд недоступен
    }
    return undefined;
  }
  // id пинов известен заранее — деталь и счётчик сохранений можно не ждать по очереди
  const detail = id.startsWith("ov-")
    ? getOpenversePin(id.slice(3))
    : id.startsWith("met-")
      ? getMetPin(id.slice(4))
      : id.startsWith("cle-")
        ? getClevelandPin(id.slice(4))
        : id.startsWith("wc-")
          ? getCommonsPin(id.slice(3))
          : id.startsWith("meal-")
            ? getMealPin(id.slice(5))
            : Promise.resolve(PINS.find((p) => p.id === id));
  const [pin, counts] = await Promise.all([detail, fetchSaves([id])]);
  return pin ? { ...pin, saves: counts[pin.id] ?? 0 } : undefined;
}

export const getPinById = cache(loadPinById);

// Похожие: приоритет — векторы (визуально-смысловые), затем related
// Openverse, для моков — теги.
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
  if (pin.id.startsWith("up-")) {
    // свои пины: сначала другие загрузки той же категории, потом моки
    const sameUser = (await fetchUserPins({ category: pin.category, limit: limit + 1 })).filter(
      (p) => p.id !== pin.id,
    );
    if (sameUser.length > 0) return sameUser.slice(0, limit);
  } else if (pin.id.startsWith("ov-")) {
    const query = pin.tags[0] || pin.title.split(" ").slice(0, 3).join(" ") || pin.category;
    try {
      return await getOpenverseRelated(pin.id.slice(3), query, limit);
    } catch {
      return [];
    }
  }
  const sameCategory = PINS.filter((p) => p.id !== pin.id && p.category === pin.category);
  const sharedTags = PINS.filter(
    (p) =>
      p.id !== pin.id && p.category !== pin.category && p.tags.some((t) => pin.tags.includes(t)),
  );
  return [...sameCategory, ...sharedTags].slice(0, limit);
}
