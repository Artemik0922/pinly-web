// Векторное хранилище: .cache/vectors.json — пины с эмбеддингами.
// Для демо-масштаба (сотни–тысячи пинов) JSON + полный перебор с
// косинусной близостью быстрее и проще любой векторной БД.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pin } from "@/data/pins";

const STORE_PATH = join(process.cwd(), ".cache", "vectors.json");

type VectorItem = { pin: Pin; vector: number[] };
type Store = { version: 1; dim: number; items: VectorItem[] };

let memory: Store | null = null;

export function vectorStoreEnabled(): boolean {
  return memory !== null && memory.items.length > 0;
}

export async function loadStore(): Promise<Store> {
  if (memory) return memory;
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    memory = JSON.parse(raw) as Store;
  } catch {
    memory = { version: 1, dim: 512, items: [] };
  }
  return memory;
}

export async function saveStore(store: Store): Promise<void> {
  memory = store;
  await mkdir(join(process.cwd(), ".cache"), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store));
}

export function upsertPins(store: Store, items: VectorItem[]): void {
  const byId = new Map(store.items.map((it) => [it.pin.id, it]));
  for (const item of items) byId.set(item.pin.id, item);
  store.items = [...byId.values()];
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

// Ближайшие пины к вектору запроса, исключая excludeId.
export async function searchVectors(
  queryVector: number[],
  topK: number,
  excludeId?: string,
): Promise<Array<{ pin: Pin; score: number }>> {
  const store = await loadStore();
  return store.items
    .filter((it) => it.pin.id !== excludeId)
    .map((it) => ({ pin: it.pin, score: cosine(queryVector, it.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
