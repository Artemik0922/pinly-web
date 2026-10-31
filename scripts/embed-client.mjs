// Транспорт до RouterAI для node-скриптов (index-pins, probe-embeddings).
// Формы запросов берутся из embeddings-wire.mjs — тот же источник правды, что
// у TS-провайдера сайта, поэтому формат не может разойтись между сайтом и
// индексатором.

import { join } from "node:path";
import { imageRequests, parseVectors, textBody } from "../src/lib/server/providers/embeddings-wire.mjs";
import { apiKey, loadEnv } from "./env.mjs";

/** Куда пишется векторный индекс — общий путь у индексатора и пробника. */
export const STORE_PATH = join(process.cwd(), ".cache", "vectors.json");

// Сайт, с которого скрипты берут пины и картинки: тот же /api/feed и /api/img,
// что видят пользователи (нужен запущенный npm start или npm run dev).
// Функция, а не константа: .env.local подгружается только внутри embedClient().
export const siteBase = () => process.env.INDEX_BASE_URL ?? "http://localhost:3000";

export async function embedClient() {
  const env = await loadEnv();
  const key = apiKey(env);
  const config = {
    baseUrl: env.EMBED_BASE_URL ?? env.VOYAGE_BASE_URL ?? "https://routerai.ru/api/v1",
    model: env.EMBED_MODEL ?? "voyageai/voyage-multimodal-3.5",
    dimensions: Number(env.EMBED_DIMENSIONS ?? 1024),
    key,
  };

  async function post(path, body) {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  /** Текстовые векторы батчем; без dimensions — если провайдер их не знает. */
  async function texts(list) {
    try {
      const withDims = await post("/embeddings", textBody(config.model, list, config.dimensions, true));
      return parseVectors(withDims, list.length, config.dimensions);
    } catch (err) {
      // Matryoshka-трюк: режем вектор сами
      if (!/ 400\b/.test(err.message)) throw err;
      const plain = await post("/embeddings", textBody(config.model, list, config.dimensions, false));
      return parseVectors(plain, list.length, config.dimensions);
    }
  }

  // Формат запроса с картинкой в документации не описан: перебираем варианты,
  // победителя помним на весь прогон и ставим первым.
  let workingFormat = null;

  async function image(dataUrl) {
    const requests = imageRequests(config.model, [dataUrl], config.dimensions);
    const winner = requests.find((r) => r.format === workingFormat);
    const order = winner ? [winner, ...requests.filter((r) => r !== winner)] : requests;
    let lastError = null;
    for (const request of order) {
      try {
        const vectors = parseVectors(await post(request.path, request.body), 1, config.dimensions);
        workingFormat = request.format;
        return vectors[0];
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`ни один формат не принят: ${lastError.message}`);
  }

  /** По одному запросу на каждый вариант: что именно принимает провайдер. */
  async function probeImage(dataUrl) {
    const requests = imageRequests(config.model, [dataUrl], config.dimensions);
    const results = [];
    for (const request of requests) {
      try {
        const vectors = parseVectors(await post(request.path, request.body), 1, config.dimensions);
        workingFormat = request.format;
        results.push({ format: request.format, path: request.path, ok: true, dim: vectors[0].length });
      } catch (err) {
        results.push({ format: request.format, path: request.path, ok: false, error: err.message });
      }
    }
    return results;
  }

  return { config, post, texts, image, probeImage, format: () => workingFormat };
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
