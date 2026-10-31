// Источник пинов для node-скриптов: те же страницы ленты, что греет warm.mjs,
// только снятые через сайт (GET /api/feed). Читать .cache/ov_*.json напрямую
// нельзя: там сырой ответ Openverse (data.results), а не пины. Через сайт
// индексатор видит ровно тот контракт Pin, по которому ищет сам сайт.

import { toDataUrl } from "../src/lib/server/providers/embeddings-wire.mjs";

export const CATEGORIES = [
  "Интерьер",
  "Рецепты",
  "Путешествия",
  "Мода",
  "Искусство",
  "Природа",
  "Архитектура",
  "Рукоделие",
  "Фитнес",
  "Книги и рабочее место",
];
export const PAGES_PER_CATEGORY = 3;
export const ALL_FEED_PAGES = 6;

/** План обхода ленты: общий у прогревателя и индексатора, иначе они разойдутся по покрытию. */
export function feedJobs() {
  const jobs = [];
  for (const category of CATEGORIES) {
    for (let cursor = 0; cursor < PAGES_PER_CATEGORY; cursor++) jobs.push({ category, cursor });
  }
  for (let cursor = 0; cursor < ALL_FEED_PAGES; cursor++) jobs.push({ cursor });
  return jobs;
}

export async function fetchFeedPage(base, job, timeoutMs = 45000) {
  const params = new URLSearchParams();
  if (job.category) params.set("category", job.category);
  if (job.q) params.set("q", job.q);
  params.set("cursor", String(job.cursor));
  const res = await fetch(`${base}/api/feed?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} @ ${base}/api/feed?${params}`);
  return res.json();
}

// Тот же потолок, что на стороне запроса (photo-search.ts): индексировать
// больше — значит копить векторы, которые запрос никогда не догонит.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Пины ленты через сайт. Только динамические (со sourceUrl): моки picsum в
 * индекс не попадают, их смысл только в картинке-заглушке.
 */
export async function collectFeedPins(base, onProgress = () => {}) {
  const pins = new Map();
  const jobs = feedJobs();
  for (let i = 0; i < jobs.length; i++) {
    try {
      const page = await fetchFeedPage(base, jobs[i]);
      for (const pin of page.pins ?? []) {
        if (pin.sourceUrl) pins.set(pin.id, pin);
      }
    } catch (err) {
      // страница недоступна — идём дальше: частичный индекс лучше пустого
      console.error(`\nстраница ${JSON.stringify(jobs[i])}: ${err.message}`);
    }
    onProgress(i + 1, jobs.length, pins.size);
  }
  return [...pins.values()];
}

export function pinText(pin) {
  // Tags дублируем: они сильнее всего влияют на смысл.
  return [pin.title, pin.description, pin.category, ...pin.tags, `author: ${pin.author}`]
    .filter(Boolean)
    .join(". ");
}

// Свои пины уже лежат у нас (/api/uploads/…); чужие идут через /api/img —
// там allowlist хостов и дисковый кэш, тот же, что у сайта.
export function imageUrl(base, sourceUrl) {
  return sourceUrl.startsWith("/")
    ? `${base}${sourceUrl}`
    : `${base}/api/img?u=${encodeURIComponent(sourceUrl)}`;
}

const proxiedUrl = (base, pin) => imageUrl(base, pin.sourceUrl);

export async function pinDataUrl(base, pin) {
  const res = await fetch(proxiedUrl(base, pin), { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`прокси отдал HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error("пустой файл");
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${Math.round(bytes.length / 1024)} КБ — больше 5 МБ`);
  return toDataUrl((res.headers.get("content-type") ?? "image/jpeg").split(";")[0], bytes);
}
