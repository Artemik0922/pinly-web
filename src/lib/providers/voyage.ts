// Клиент эмбеддингов voyage-multimodal-3.5 через routerai.ru
// (OpenAI-совместимый /api/v1/embeddings). Ключ берётся из env:
//   VOYAGE_API_KEY=...   в web/.env.local
// Без ключа все функции векторного поиска мягко отключаются.

import { cached } from "@/lib/providers/cache";

const BASE_URL = process.env.VOYAGE_BASE_URL ?? "https://routerai.ru/api/v1";
const MODEL = "voyageai/voyage-multimodal-3.5";
// Matryoshka-эмбеддинг: первые 512 измерений сохраняют качество —
// меньше данных, быстрее косинус.
const DIMENSIONS = 512;

export function voyageEnabled(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

async function callEmbeddings(input: string[]): Promise<number[][]> {
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      encoding_format: "float",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding.slice(0, DIMENSIONS));
}

// Эмбеддинги текстов с кэшем (один и тот же состав батча не оплачивается
// дважды: повторные запуски индексатора берут ответ из дискового кэша).
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!voyageEnabled()) return null;
  const results: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32);
    const batchKey = `emb-batch:${hashText(batch.join("\u0000"))}`;
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
