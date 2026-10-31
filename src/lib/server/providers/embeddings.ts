// Эмбеддинги через RouterAI (https://routerai.ru). Модель по умолчанию —
// voyageai/voyage-multimodal-3.5: она кладёт текст и картинку в одно
// пространство, поэтому поиск по фото ищет среди пинов, проиндексированных
// по тексту, и наоборот.
//
// Настройки из env:
//   EMBED_API_KEY       — ключ routerai.ru (fallback: VOYAGE_API_KEY)
//   EMBED_MODEL         — по умолчанию voyageai/voyage-multimodal-3.5
//   EMBED_DIMENSIONS    — по умолчанию 1024 (у модели 2048/1024/512/256)
//   EMBED_BASE_URL      — по умолчанию https://routerai.ru/api/v1
// Без ключа весь векторный поиск мягко выключается.
//
// ВАЖНО: векторы разных моделей несовместимы для косинуса. Хранилище помнит
// имя модели (см. vector-store.ts), при смене нужна переиндексация
// `npm run index`.
//
// Формат запроса с картинкой RouterAI в публичной документации не описан
// (страница модели показывает только текстовый /embeddings). Поэтому сюда
// идут три правдоподобных варианта по очереди, победитель запоминается на
// процесс, а `npm run probe:embeddings` показывает, какой именно сработал.

import { cached } from "@/lib/server/providers/cache";
import { imageRequests, parseVectors, textBody, toDataUrl } from "@/lib/server/providers/embeddings-wire.mjs";

const BASE_URL =
  process.env.EMBED_BASE_URL ?? process.env.VOYAGE_BASE_URL ?? "https://routerai.ru/api/v1";
const MODEL = process.env.EMBED_MODEL ?? "voyageai/voyage-multimodal-3.5";
const DIMENSIONS = Number(process.env.EMBED_DIMENSIONS ?? 1024);
const API_KEY = process.env.EMBED_API_KEY ?? process.env.VOYAGE_API_KEY;
const TIMEOUT_MS = 30_000;

export type EmbeddingModel = { name: string; dim: number };

/** Что сейчас проиндексировано — нужно хранилищу, чтобы не смешивать векторы. */
export const EMBEDDING_MODEL: EmbeddingModel = { name: MODEL, dim: DIMENSIONS };

export function embeddingsEnabled(): boolean {
  return Boolean(API_KEY);
}

/** Ответ провайдера с кодом статуса: по 400 выбирают другой формат запроса. */
class EmbeddingsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new EmbeddingsError(res.status, `${path} ${res.status}: ${detail}`);
  }
  return res.json();
}

// ── текст ────────────────────────────────────────────────────────────────

async function callText(input: string[], withDimensions: boolean): Promise<number[][]> {
  const payload = await post("/embeddings", textBody(MODEL, input, DIMENSIONS, withDimensions));
  return parseVectors(payload, input.length, DIMENSIONS) as number[][];
}

async function embedTextInput(input: string[]): Promise<number[][]> {
  try {
    return await callText(input, true);
  } catch (err) {
    // часть провайдеров не знает dimensions — режем вектор сами
    if (!(err instanceof EmbeddingsError) || err.status !== 400) throw err;
    return callText(input, false);
  }
}

// ── картинки: форматы перебирает проводка, победитель запоминается ───────

let workingFormat: string | null = null;

/**
 * Эмбеддинги картинок по data-URL. Формат запроса подбирается: первый
 * успешный запоминается, остальные не дёргаются.
 */
export async function embedImageDataUrls(urls: string[]): Promise<number[][]> {
  if (!embeddingsEnabled()) throw new Error("EMBED_API_KEY не задан");
  const requests = imageRequests(MODEL, urls, DIMENSIONS);
  const winner = requests.find((r) => r.format === workingFormat);
  const order = winner ? [winner, ...requests.filter((r) => r !== winner)] : requests;
  let lastError: unknown = null;

  for (const request of order) {
    try {
      const payload = await post(request.path, request.body);
      const vectors = parseVectors(payload, urls.length, DIMENSIONS) as number[][];
      if (workingFormat !== request.format) {
        console.info(`[embeddings] формат картинок: ${request.format}`);
        workingFormat = request.format;
      }
      return vectors;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`ни один формат запроса с картинкой не принят: ${String(lastError)}`);
}

export function imageBytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return toDataUrl(mime, bytes) as string;
}


/** Одна картинка по data-URL — то, что нужно для запроса «найди похожее». */
export async function embedImage(dataUrl: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  const [vector] = await embedImageDataUrls([dataUrl]);
  return vector ?? null;
}

// ── кэш батчей ───────────────────────────────────────────────────────────

function hashText(text: string): string {
  // FNV-1a: короткий стабильный ключ кэша
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Эмбеддинги текстов с кэшем: повторный запуск индексатора не платит за
// тот же состав батча. В ключе — модель и размерность, иначе при смене
// модели кэш вернул бы несовместимые векторы.
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsEnabled()) return null;
  const results: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32);
    const batchKey = `emb-batch:${MODEL}:${DIMENSIONS}:${hashText(batch.join("\u0000"))}`;
    const vectors = await cached(batchKey, () => embedTextInput(batch));
    batch.forEach((_, j) => {
      results[i + j] = vectors[j];
    });
  }
  return results;
}

/** Что именно сейчас настроено — показывают диагностика и probe-скрипт. */
export function embeddingConfig(): EmbeddingModel & { baseUrl: string; enabled: boolean } {
  return { ...EMBEDDING_MODEL, baseUrl: BASE_URL, enabled: embeddingsEnabled() };
}
