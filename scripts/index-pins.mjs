// Индексация пинов для векторного поиска.
//
// Собирает пины лентами через запущенный сайт (GET /api/feed — тот же план
// страниц, что у npm run warm, поэтому ответы берутся из прогретого кэша),
// считает эмбеддинги voyageai/voyage-multimodal-3.5 через routerai.ru и пишет
// web/.cache/vectors.json.
//
//   npm run index              — текстовые векторы (умный поиск по слову)
//   npm run index -- --images  — векторы картинок (поиск по фото)
//
// Модель мультимодальная: текст и картинка лежат в одном пространстве, поэтому
// запрос-фото находит и текстовые векторы. Отдельный проход по картинкам нужен,
// чтобы «найди похожее» сравнивало фотографию с фотографией: стиль и композиция
// в тексте описаны плохо.
//
// Формат записи — version 3: векторы разных моделей (и размерностей) для
// косинуса несовместимы, поэтому хранилище помнит model и dim, а сайт при
// несовпадении считает индекс пустым.
//
// Нужен запущенный сайт (npm start) — он же прокси картинок /api/img; без него
// --images качать оригиналы негде.
// Требуется EMBED_API_KEY в web/.env.local (скрипт читает файл сам).
// Повторные запуски бесплатны: уже проиндексированные пины пропускаются.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { STORE_PATH, embedClient, siteBase } from "./embed-client.mjs";
import { collectFeedPins, pinDataUrl, pinText } from "./pins-source.mjs";

const STORE_VERSION = 3;
const BATCH = 32;

const IMAGE_MODE = process.argv.includes("--images");

async function readStore(config) {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8"));
    const compatible =
      parsed.version === STORE_VERSION &&
      parsed.model === config.model &&
      parsed.dim === config.dimensions;
    if (compatible) return parsed;
    console.log(
      `хранилище другой модели/размерности (v${parsed.version} ${parsed.model} dim ${parsed.dim}) — переиндексация с нуля`,
    );
  } catch {
    // нового хранилища ещё нет
  }
  return { version: STORE_VERSION, model: config.model, dim: config.dimensions, items: [] };
}

async function persist(store) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store));
}

// Ключ — вид + пин: один и тот же пин может стоять в индексе и текстом, и
// картинкой, и эти векторы не должны перезаписывать друг друга.
const key = (kind, id) => `${kind}:${id}`;
const indexItems = (store) => new Map(store.items.map((it) => [key(it.kind, it.pin.id), it]));

async function indexText(client, pins, store) {
  const byKey = indexItems(store);
  const todo = pins.filter((p) => !byKey.has(key("text", p.id)));
  console.log(`новых текстов: ${todo.length} (векторов в хранилище: ${store.items.length})`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const vectors = await client.texts(batch.map(pinText));
    batch.forEach((pin, j) => byKey.set(key("text", pin.id), { pin, vector: vectors[j], kind: "text" }));
    store.items = [...byKey.values()];
    // персист после каждого батча — прерывание не теряет прогресс
    await persist(store);
    process.stdout.write(`\rтекст: ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  console.log("");
}

async function indexImages(client, pins, store) {
  const byKey = indexItems(store);
  const todo = pins.filter((p) => !byKey.has(key("image", p.id)));
  console.log(`новых картинок: ${todo.length} (векторов в хранилище: ${store.items.length})`);

  let done = 0;
  let failed = 0;
  for (const pin of todo) {
    try {
      const vector = await client.image(await pinDataUrl(siteBase(), pin));
      byKey.set(key("image", pin.id), { pin, vector, kind: "image" });
      store.items = [...byKey.values()];
      await persist(store);
    } catch (err) {
      failed++;
      console.log(`\nпропущен ${pin.id}: ${err.message}`);
    }
    process.stdout.write(`\rкартинки: ${++done}/${todo.length} (ошибок: ${failed})`);
  }
  console.log("");
}

async function main() {
  const client = await embedClient();
  if (!client.config.key) {
    console.error("Нет EMBED_API_KEY. Добавьте ключ routerai.ru в web/.env.local.");
    process.exit(1);
  }
  const base = siteBase();
  console.log(`сайт: ${base}\nmodel: ${client.config.model}, dim: ${client.config.dimensions}`);

  const pins = await collectFeedPins(base, (done, total, count) =>
    process.stdout.write(`\rлента: ${done}/${total} (пинов: ${count})`),
  );
  console.log(`\nПинов с оригиналами: ${pins.length}`);
  if (pins.length === 0) {
    console.log("Нужен запущенный сайт: npm start (и прогрев ленты — npm run warm)");
    process.exitCode = 1;
    return;
  }

  const store = await readStore(client.config);
  if (IMAGE_MODE) await indexImages(client, pins, store);
  else await indexText(client, pins, store);

  const kinds = new Map();
  for (const item of store.items) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
  console.log(
    `Готово: ${store.items.length} векторов (${[...kinds].map(([k, n]) => `${k}: ${n}`).join(", ")}) в ${STORE_PATH}`,
  );
}

main().catch((e) => {
  console.error("index failed:", e.message);
  process.exit(1);
});
