// Векторное хранилище: .cache/vectors.json — пины с эмбеддингами.
// Для демо-масштаба (сотни–тысячи пинов) JSON + полный перебор с
// косинусной близостью быстрее и проще любой векторной БД.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pin } from "@/lib/pin";
import { EMBEDDING_MODEL } from "@/lib/server/providers/embeddings";

const STORE_PATH = join(process.cwd(), ".cache", "vectors.json");

// Векторы разных моделей (и размерностей) несовместимы для cosine, поэтому
// хранилище помнит имя модели напрямую: «version + dim» различить две модели
// с одинаковой размерностью не могли. Несовместимое хранилище считаем пустым
// и переиндексируем (npm run index).
const STORE_VERSION = 3;

/** Чем проиндексирован пин: текстом или самой картинкой. */
export type VectorKind = "text" | "image";

type VectorItem = { pin: Pin; vector: number[]; kind: VectorKind };
type Store = { version: number; model: string; dim: number; items: VectorItem[] };

let memory: Store | null = null;

function emptyStore(): Store {
  return { version: STORE_VERSION, model: EMBEDDING_MODEL.name, dim: EMBEDDING_MODEL.dim, items: [] };
}

export async function loadStore(): Promise<Store> {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8")) as Partial<Store>;
    const compatible =
      parsed.version === STORE_VERSION &&
      parsed.model === EMBEDDING_MODEL.name &&
      parsed.dim === EMBEDDING_MODEL.dim;
    memory = compatible ? (parsed as Store) : emptyStore();
  } catch {
    memory = emptyStore();
  }
  return memory;
}

export function cosine(a: number[], b: number[]): number {
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

// Ближайшие пины к вектору запроса, исключая excludeId. Один пин может стоять
// в индексе дважды (вектор по тексту и по картинке), поэтому берём лучший
// score на пин: иначе в выдаче появляются одинаковые карточки.
export async function searchVectors(
  queryVector: number[],
  topK: number,
  excludeId?: string,
): Promise<Array<{ pin: Pin; score: number }>> {
  const store = await loadStore();
  const best = new Map<string, { pin: Pin; score: number }>();
  for (const it of store.items) {
    if (it.pin.id === excludeId) continue;
    const score = cosine(queryVector, it.vector);
    const current = best.get(it.pin.id);
    if (!current || score > current.score) best.set(it.pin.id, { pin: it.pin, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}
