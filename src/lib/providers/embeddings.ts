// Клиент эмбеддингов google/gemini-embedding-2 через routerai.ru
// (OpenAI-совместимый /api/v1/embeddings, мультимодальная модель с
// Matryoshka-размерностями 128–3072). Ключ и настройки из env:
//   EMBED_API_KEY       — ключ routerai.ru (fallback: VOYAGE_API_KEY)
//   EMBED_BASE_URL      — по умолчанию https://routerai.ru/api/v1
//   EMBED_MODEL         — по умолчанию google/gemini-embedding-2
//   EMBED_DIMENSIONS    — по умолчанию 768 (рекомендуемый уровень MRL)
// Без ключа все функции векторного поиска мягко отключаются.
// ВАЖНО: векторы разных моделей несовместимы — при смене EMBED_MODEL
// нужна переиндексация (npm run index), хранилище различает модели
// по version/dim (см. vector-store.ts).

import { cached } from "@/lib/providers/cache";

const BASE_URL =
  process.env.EMBED_BASE_URL ?? process.env.VOYAGE_BASE_URL ?? "https://routerai.ru/api/v1";
const MODEL = process.env.EMBED_MODEL ?? "google/gemini-embedding-2";
const DIMENSIONS = Number(process.env.EMBED_DIMENSIONS ?? 768);
const API_KEY = process.env.EMBED_API_KEY ?? process.env.VOYAGE_API_KEY;

export function embeddingsEnabled(): boolean {
  return Boolean(API_KEY);
}

async function postEmbeddings(input: string[], withDimensions: boolean): Promise<Response> {
  const body: Record<string, unknown> = {
    model: MODEL,
    input,
    encoding_format: "float",
  };
  if (withDimensions) body.dimensions = DIMENSIONS;
  return fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
}

async function callEmbeddings(input: string[]): Promise<number[][]> {
  let res = await postEmbeddings(input, true);
  if (res.status === 400) {
    // Часть провайдеров не знает параметр dimensions — тогда режем
    // вектор сами (Matryoshka: первые измерения сохраняют качество).
    res = await postEmbeddings(input, false);
  }
  if (!res.ok) {
    throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding.slice(0, DIMENSIONS));
}

// Эмбеддинги текстов с кэшем (один и тот же состав батча не оплачивается
// дважды: повторные запуски индексатора берут ответ из дискового кэша).
// В ключе кэша участвуют модель и размерность — иначе при смене модели
// кэш вернул бы несовместимые векторы старой.
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsEnabled()) return null;
  const results: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32);
    const batchKey = `emb-batch:${MODEL}:${DIMENSIONS}:${hashText(batch.join("\u0000"))}`;
    const vectors = await cached(batchKey, () => callEmbeddings(batch));
    batch.forEach((_, j) => {
      results[i + j] = vectors[j];
    });
  }
  return results;
}

function hashText(text: string): string {
  // FNV-1a: короткий стабильный ключ кэша
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
