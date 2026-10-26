// Кэш ответов внешних API: память + диск (web/.cache).
// Лимиты Openverse — 20 зап/мин и 200/день анонимно, поэтому один и тот
// же запрос обязан браться из кэша, а не повторяться.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Entry<T> = { at: number; data: T };

const TTL_MS = 24 * 60 * 60 * 1000; // сутки
const memory = new Map<string, Entry<unknown>>();
const CACHE_DIR = join(process.cwd(), ".cache");

async function diskPath(key: string) {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return join(CACHE_DIR, `${safe}.json`);
}

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hitMem = memory.get(key) as Entry<T> | undefined;
  if (hitMem && Date.now() - hitMem.at < TTL_MS) return hitMem.data;

  try {
    const raw = await readFile(await diskPath(key), "utf8");
    const hit = JSON.parse(raw) as Entry<T>;
    if (Date.now() - hit.at < TTL_MS) {
      memory.set(key, hit);
      return hit.data;
    }
  } catch {
    // нет файла на диске — норма для первого запроса
  }

  const data = await fetcher();
  const entry: Entry<T> = { at: Date.now(), data };
  memory.set(key, entry);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(await diskPath(key), JSON.stringify(entry));
  } catch {
    // диск недоступен — работаем на памяти
  }
  return data;
}
