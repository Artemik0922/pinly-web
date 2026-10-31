// Кэш ответов внешних API: память + диск (web/.cache).
// Лимиты Openverse — 20 зап/мин и 200/день анонимно, поэтому один и тот
// же запрос обязан браться из кэша, а не повторяться.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

type Entry<T> = { at: number; data: T };

const TTL_MS = 24 * 60 * 60 * 1000; // сутки
const FAIL_TTL_BASE_MS = 30 * 1000; // неудачу помним и удваиваем паузу
const FAIL_TTL_MAX_MS = 15 * 60 * 1000;
const SWEEP_TTL_MS = 30 * 24 * 60 * 60 * 1000; // файлы старше месяца убираем
const memory = new Map<string, Entry<unknown>>();
const failedUntil = new Map<string, number>();
const failedTimes = new Map<string, number>();
const CACHE_DIR = join(process.cwd(), ".cache");

let writesSinceSweep = 0;

// Имя файла — хеш ключа. Раньше ключ «чистили» заменой всего, кроме
// [a-zA-Z0-9_-], на подчёркивание: два разных кириллических запроса
// («кошки» и «собаки») сворачивались в один файл, и лента начинала
// отдавать чужие результаты.
function diskPath(key: string): string {
  const digest = createHash("sha1").update(key).digest("hex");
  return join(CACHE_DIR, `${digest}.json`);
}

// Раз в N запис проходим по каталогу и выбрасываем протухшее: иначе .cache
// растёт всю жизнь сервера. Трогаем только файлы-ключи (40 hex): vectors.json
// и прочие полезные соседи лежат в том же каталоге.
const KEY_FILE = /^[0-9a-f]{40}\.json$/;

async function sweep(): Promise<void> {
  const { readdir, stat, unlink } = await import("node:fs/promises");
  const cutoff = Date.now() - SWEEP_TTL_MS;
  for (const name of await readdir(CACHE_DIR)) {
    if (!KEY_FILE.test(name)) continue;
    const path = join(CACHE_DIR, name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < cutoff) await unlink(path).catch(() => undefined);
  }
}

function maybeSweep(): void {
  if (++writesSinceSweep < 200) return;
  writesSinceSweep = 0;
  sweep().catch(() => undefined);
}

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hitMem = memory.get(key) as Entry<T> | undefined;
  if (hitMem && Date.now() - hitMem.at < TTL_MS) return hitMem.data;

  const retryAfter = failedUntil.get(key) ?? 0;
  if (retryAfter > Date.now()) throw new Error(`cached: backoff for ${key}`);

  try {
    const raw = await readFile(diskPath(key), "utf8");
    const hit = JSON.parse(raw) as Entry<T>;
    if (Date.now() - hit.at < TTL_MS) {
      memory.set(key, hit);
      return hit.data;
    }
  } catch {
    // нет файла на диске — норма для первого запроса
  }

  let data: T;
  try {
    data = await fetcher();
  } catch (err) {
    // Сбой запоминаем: без этого каждый хост после 429 или таймаута снова
    // платит за него полной задержкой. Пауза удваивается с каждой неудачей
    // (30 с → 15 мин), поэтому при лежащем источнике лента мгновенно
    // уходит на моки, а проверка сети случается всё реже.
    const attempts = (failedTimes.get(key) ?? 0) + 1;
    failedTimes.set(key, attempts);
    failedUntil.set(key, Date.now() + Math.min(FAIL_TTL_BASE_MS * 2 ** attempts, FAIL_TTL_MAX_MS));
    throw err;
  }
  failedUntil.delete(key);
  failedTimes.delete(key);

  const entry: Entry<T> = { at: Date.now(), data };
  memory.set(key, entry);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(diskPath(key), JSON.stringify(entry));
    maybeSweep();
  } catch {
    // диск недоступен — работаем на памяти
  }
  return data;
}
