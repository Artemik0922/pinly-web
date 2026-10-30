// Индексация пинов для векторного поиска.
//
// Читает закэшированные страницы ленты (web/.cache/ov_*.json — продукт
// обычной работы сайта и npm run warm), собирает пины, считает
// эмбеддинги google/gemini-embedding-2 через routerai.ru и пишет
// web/.cache/vectors.json (version 2 — векторы других моделей
// несовместимы, при смене модели/размерности индексация идёт с нуля).
//
// Требуется EMBED_API_KEY (или VOYAGE_API_KEY) в web/.env.local.
// Повторные запуски бесплатны: батчи эмбеддингов кэшируются на диске.
//
// Запуск: из web/  →  npm run index

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), ".cache");
const STORE_PATH = join(CACHE_DIR, "vectors.json");
const BASE_URL = process.env.EMBED_BASE_URL ?? process.env.VOYAGE_BASE_URL ?? "https://routerai.ru/api/v1";
const MODEL = process.env.EMBED_MODEL ?? "google/gemini-embedding-2";
const DIMENSIONS = Number(process.env.EMBED_DIMENSIONS ?? 768);
const STORE_VERSION = 2;
const BATCH = 32;

function pinText(pin) {
  // Текстовое представление пина для эмбеддинга. Tags дублируем —
  // они сильнее всего влияют на смысл.
  return [pin.title, pin.description, pin.category, ...pin.tags, `author: ${pin.author}`]
    .filter(Boolean)
    .join(". ");
}

async function collectPins() {
  const pins = new Map();
  const files = (await readdir(CACHE_DIR)).filter((f) => f.startsWith("ov_") && f.endsWith(".json"));
  for (const file of files) {
    try {
      const entry = JSON.parse(await readFile(join(CACHE_DIR, file), "utf8"));
      const page = entry.data;
      for (const pin of page?.pins ?? []) {
        if (pin.sourceUrl) pins.set(pin.id, pin); // только динамические
      }
    } catch {
      // битый файл кэша — пропускаем
    }
  }
  return [...pins.values()];
}

async function embedBatch(texts) {
  const call = (withDimensions) =>
    fetch(`${BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts,
        encoding_format: "float",
        ...(withDimensions ? { dimensions: DIMENSIONS } : {}),
      }),
      signal: AbortSignal.timeout(60000),
    });

  let res = await call(true);
  if (res.status === 400) {
    // провайдер не знает параметр dimensions — Matryoshka-трюк: режем сами
    res = await call(false);
  }
  if (!res.ok) {
    throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding.slice(0, DIMENSIONS));
}

let apiKey = "";

async function main() {
  apiKey = process.env.EMBED_API_KEY ?? process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.error("Нет EMBED_API_KEY. Добавьте ключ routerai.ru в web/.env.local и перезапустите.");
    process.exit(1);
  }

  const pins = await collectPins();
  console.log(`Пинов в кэше ленты: ${pins.length}`);
  if (pins.length === 0) {
    console.log("Сначала прогрейте ленту: npm start, затем npm run warm");
    return;
  }

  let store = { version: STORE_VERSION, dim: DIMENSIONS, items: [] };
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8"));
    if (parsed.version === STORE_VERSION && parsed.dim === DIMENSIONS) {
      store = parsed;
    } else {
      console.log(
        `Хранилище другой модели/размерности (version ${parsed.version}, dim ${parsed.dim}) — переиндексация с нуля.`,
      );
    }
  } catch {
    // нового хранилища ещё нет
  }
  const byId = new Map(store.items.map((it) => [it.pin.id, it]));

  const todo = pins.filter((p) => !byId.has(p.id));
  console.log(`Новых пинов для индексации: ${todo.length} (уже проиндексировано: ${byId.size})`);

  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const vectors = await embedBatch(batch.map(pinText));
    batch.forEach((pin, j) => {
      byId.set(pin.id, { pin, vector: vectors[j] });
    });
    done += batch.length;
    process.stdout.write(`\rпроиндексировано: ${done}/${todo.length}`);

    // персист после каждого батча — прерывание не теряет прогресс
    store.items = [...byId.values()];
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(store));
  }
  console.log(`\nГотово: ${store.items.length} пинов в ${STORE_PATH} (model: ${MODEL}, dim: ${DIMENSIONS})`);
}

main().catch((e) => {
  console.error("index failed:", e.message);
  process.exit(1);
});
