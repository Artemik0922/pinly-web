// Индексация пинов для векторного поиска.
//
// Читает закэшированные страницы ленты (web/.cache/ov_*.json — продукт
// обычной работы сайта и npm run warm), собирает пины, считает
// эмбеддинги voyage-multimodal-3.5 и пишет web/.cache/vectors.json.
//
// Требуется VOYAGE_API_KEY в web/.env.local. Повторные запуски бесплатны:
// батчи эмбеддингов кэшируются на диске.
//
// Запуск: из web/  →  npm run index

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), ".cache");
const STORE_PATH = join(CACHE_DIR, "vectors.json");
const MODEL = "voyageai/voyage-multimodal-3.5";
const DIMENSIONS = 512;
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

async function main() {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.error("Нет VOYAGE_API_KEY. Добавьте его в web/.env.local и перезапустите.");
    process.exit(1);
  }

  const pins = await collectPins();
  console.log(`Пинов в кэше ленты: ${pins.length}`);
  if (pins.length === 0) {
    console.log("Сначала прогрейте ленту: npm start, затем npm run warm");
    return;
  }

  let store = { version: 1, dim: DIMENSIONS, items: [] };
  try {
    store = JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    // нового хранилища ещё нет
  }
  const byId = new Map(store.items.map((it) => [it.pin.id, it]));

  const todo = pins.filter((p) => !byId.has(p.id));
  console.log(`Новых пинов для индексации: ${todo.length} (уже проиндексировано: ${byId.size})`);

  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await fetch("https://routerai.ru/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: batch.map(pinText),
        encoding_format: "float",
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    batch.forEach((pin, j) => {
      byId.set(pin.id, { pin, vector: data.data[j].embedding.slice(0, DIMENSIONS) });
    });
    done += batch.length;
    process.stdout.write(`\rпроиндексировано: ${done}/${todo.length}`);

    // персист после каждого батча — прерывание не теряет прогресс
    store.items = [...byId.values()];
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(store));
  }
  console.log(`\nГотово: ${store.items.length} пинов в ${STORE_PATH}`);
}

main().catch((e) => {
  console.error("index failed:", e.message);
  process.exit(1);
});
