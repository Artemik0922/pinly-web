// Дополнительные источники CC0-контента: Метрополитен-музей, музей
// Кливленда, Wikimedia Commons и TheMealDB. Все доступны из РФ без
// ключей и VPN (проверено 2026-10-29). Карточки нормализуются в Pin;
// картинки идут через прокси /api/img с дисковым кэшем.
//
// Met не отдаёт размеры изображения — берём вертикальный дефолт,
// у картин он чаще всего и правда вертикальный. Commons отдаёт
// точные размеры через imageinfo.

import { cached } from "@/lib/providers/cache";
import type { Pin } from "@/data/pins";

const UA = { "User-Agent": "Pinly/1.0 (local demo)" };

// TheMealDB за Cloudflare: Node-клиенту сайт tarpit'ит TLS-рукопожатие
// (проверено 2026-10-30: curl и httpx проходят, Node висит), поэтому
// запросы блюд идут через Python-бэкенд (httpx, общий дисковый кэш
// .cache с теми же ключами). Бэкенд недоступен — вклад рецептов пустеет.
const MEAL_BACKEND = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";

async function mealApi<T>(path: string, key: string): Promise<T> {
  return cached<T>(key, async () => {
    const res = await fetch(`${MEAL_BACKEND}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`mealdb ${res.status}`);
    return (await res.json()) as T;
  });
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/g, " ")
    .trim()
    .slice(0, 80);
}

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

// ── Wikimedia Commons напрямую: точные размеры и лицензия ──────────────

type CommonsPage = {
  pageid: number;
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    extmetadata?: {
      LicenseShortName?: { value?: string };
      Artist?: { value?: string };
    };
  }>;
};

export async function commonsPins(
  query: string,
  category: string,
  page: number,
  count = 6,
): Promise<Pin[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: String(count),
      gsroffset: String((page - 1) * count),
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "800",
      iiextmetadatafilter: "LicenseShortName|Artist",
    });
    const data = await cached<{ query?: { pages?: Record<string, CommonsPage> } }>(
      `wc:${query}:${page}:${count}`,
      async () => {
        const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
          headers: UA,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`commons ${res.status}`);
        return (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
      },
    );
    const pages = Object.values(data.query?.pages ?? {});
    const pins = pages
      .map((p): Pin | null => commonsPinFrom(p, category))
      .filter((p): p is Pin => p !== null);
    return pins;
  } catch {
    return [];
  }
}

function commonsPinFrom(p: CommonsPage, category: string): Pin | null {
  const ii = p.imageinfo?.[0];
  if (!ii?.thumburl) return null;
  const license = ii.extmetadata?.LicenseShortName?.value ?? "";
  if (/non-free|fair use/i.test(license)) return null;
  const title = (p.title || "").replace(/^File:/, "").replace(/\.(jpe?g|png|webp|gif|tiff?)$/i, "");
  return {
    id: `wc-${p.pageid}`,
    title: title.slice(0, 120) || "Из Wikimedia Commons",
    description: "",
    category,
    tags: license ? [license.toLowerCase().slice(0, 24)] : [],
    author: stripHtml(ii.extmetadata?.Artist?.value) || "Wikimedia Commons",
    width: ii.width || 800,
    height: ii.height || 1000,
    seed: String(p.pageid),
    likes: 0,
    sourceUrl: ii.thumburl,
    pageUrl: ii.descriptionurl,
    license: license || undefined,
    provider: "commons",
  };
}

// Деталь по pageid: тот же запрос imageinfo, но без генератора поиска.
// Категория по pageid не восстанавливается — берём нейтральную «идеи».
export async function getCommonsPin(pageid: string): Promise<Pin | undefined> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      pageids: pageid,
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "800",
      iiextmetadatafilter: "LicenseShortName|Artist",
    });
    const data = await cached<{ query?: { pages?: Record<string, CommonsPage> } }>(
      `wc-id:${pageid}`,
      async () => {
        const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
          headers: UA,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`commons ${res.status}`);
        return (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
      },
    );
    const pages = Object.values(data.query?.pages ?? {});
    for (const p of pages) {
      const pin = commonsPinFrom(p, "идеи");
      if (pin) return pin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ── TheMealDB: фото готовых блюд для категории «Рецепты» ───────────────

type Meal = {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
  strInstructions?: string;
  strArea?: string;
  strCategory?: string;
};

const MEAL_CATEGORIES = [
  "Dessert",
  "Seafood",
  "Chicken",
  "Beef",
  "Vegetarian",
  "Breakfast",
  "Pasta",
  "Side",
  "Starter",
  "Lamb",
];

export async function mealdbPins(page: number, count = 8): Promise<Pin[]> {
  try {
    const cat = MEAL_CATEGORIES[(page - 1) % MEAL_CATEGORIES.length];
    const list = await mealApi<{ meals?: Array<{ idMeal: string; strMeal: string; strMealThumb: string }> | null }>(
      `/api/mealdb/list?c=${encodeURIComponent(cat)}`,
      `meal-list:${cat}`,
    );
    const meals = list.meals ?? [];
    if (meals.length === 0) return [];
    const start = ((page - 1) * count) % Math.max(meals.length - count, 1);
    const pins = await Promise.all(
      meals.slice(start, start + count).map(async (m): Promise<Pin> => {
        const detail = await cached<{ meals?: Meal[] | null }>(`meal:${m.idMeal}`, async () => {
          const res = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${m.idMeal}`, {
            headers: UA,
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`mealdb ${res.status}`);
          return (await res.json()) as { meals?: Meal[] | null };
        });
        const meal = detail.meals?.[0];
        return mealPinFrom(m, meal);
      }),
    );
    return pins;
  } catch {
    return [];
  }
}

function mealPinFrom(
  m: { idMeal: string; strMeal: string; strMealThumb: string },
  meal?: Meal,
): Pin {
  return {
    id: `meal-${m.idMeal}`,
    title: m.strMeal.slice(0, 120),
    description: (meal?.strInstructions || "").slice(0, 240),
    category: "Рецепты",
    tags: [meal?.strArea, meal?.strCategory].filter((t): t is string => Boolean(t)).slice(0, 3),
    author: "TheMealDB",
    width: 800,
    height: 800,
    seed: m.idMeal,
    likes: 0,
    sourceUrl: m.strMealThumb,
    pageUrl: `https://www.themealdb.com/meal/${m.idMeal}`,
    provider: "themealdb",
  };
}

// Деталь по id: lookup отдаёт блюдо целиком, включая картинку.
export async function getMealPin(id: string): Promise<Pin | undefined> {
  try {
    const detail = await mealApi<{ meals?: Meal[] | null }>(
      `/api/mealdb/lookup?i=${encodeURIComponent(id)}`,
      `meal:${id}`,
    );
    const meal = detail.meals?.[0];
    if (!meal) return undefined;
    return mealPinFrom(meal, meal);
  } catch {
    return undefined;
  }
}
