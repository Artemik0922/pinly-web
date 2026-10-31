// Диагностика векторного поиска. Показывает то, чего нет в документации
// RouterAI:
//
//   1. принимает ли провайдер параметр dimensions;
//   2. какой из форматов запроса с картинкой работает (voyage-native /
//      openai-parts / data-url) — для картинок формат не описан;
//   3. лежит ли текст и картинка в одном пространстве (косинус «текст своего
//      пина vs картинка своего пина» должен быть выше, чем «текст своего пина
//      vs картинка чужого»);
//   4. совместим ли текущий .cache/vectors.json с настроенной моделью.
//
// Запуск: npm run probe:embeddings   (нужен EMBED_API_KEY в web/.env.local)
// Для пункта 3 нужен запущенный сайт (npm start) — картинки идут через /api/img.

import { readFile } from "node:fs/promises";
import { STORE_PATH, cosine, embedClient, siteBase } from "./embed-client.mjs";
import { collectFeedPins, pinDataUrl, pinText } from "./pins-source.mjs";

// 1×1 PNG: годится проверить формат запроса, но не смысл косинуса.
const FALLBACK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function line(text) {
  console.log(`\n── ${text}`);
}

async function indexInfo(config) {
  try {
    const store = JSON.parse(await readFile(STORE_PATH, "utf8"));
    const kinds = new Map();
    for (const item of store.items ?? []) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
    const compatible = store.version === 3 && store.model === config.model && store.dim === config.dimensions;
    console.log(
      `vectors.json: v${store.version} ${store.model} dim ${store.dim}, векторов: ${
        [...kinds].map(([k, n]) => `${k} ${n}`).join(", ") || "нет"
      }`,
    );
    console.log(
      compatible
        ? "совместим с текущей моделью — сайт его использует"
        : "НЕ совместим с EMBED_MODEL/EMBED_DIMENSIONS: сайт считает такой индекс пустым → npm run index",
    );
    if (!(kinds.get("image") > 0)) {
      console.log("картинок в индексе нет → поиск по фото ищет только по текстам пинов: npm run index -- --images");
    }
  } catch {
    console.log("vectors.json нет — индекс пуст, поиск по фото ответит 503 → npm run index");
  }
}

async function main() {
  const client = await embedClient();
  const { config } = client;
  console.log(`base: ${config.baseUrl}\nmodel: ${config.model}\ndim: ${config.dimensions}`);
  if (!config.key) {
    console.error("\nНет EMBED_API_KEY в env или web/.env.local — дальше проверять нечего.");
    process.exit(1);
  }
  console.log(`ключ: …${config.key.slice(-4)} (${config.key.length} символов)`);

  line("текст");
  try {
    const [vector] = await client.texts(["кошка на подоконнике"]);
    console.log(`OK: вектор длины ${vector.length} (нужно ${config.dimensions})`);
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    process.exitCode = 1;
  }

  line("формат запроса с картинкой");
  const pins = (await collectFeedPins(siteBase())).slice(0, 2);
  const images = [];
  for (const pin of pins) {
    try {
      images.push({ pin, dataUrl: await pinDataUrl(siteBase(), pin) });
    } catch (err) {
      console.log(`картинку пина ${pin.id} получить не удалось: ${err.message}`);
    }
  }
  if (images.length === 0) {
    console.log(
      `через сайт (${siteBase()}) картинки не пришли — пробую формат на служебном PNG; сайт запускают так: npm start`,
    );
    images.push({ pin: null, dataUrl: FALLBACK_PNG });
  }

  for (const result of await client.probeImage(images[0].dataUrl)) {
    console.log(
      result.ok
        ? `OK   ${result.format} ${result.path} → dim ${result.dim}`
        : `FAIL ${result.format} ${result.path} → ${result.error}`,
    );
  }
  if (images[0].pin === null) {
    console.log("картинка служебная 1×1: вывод про формат верный, про смысл — нет");
  }

  line("общее пространство текст/картинка");
  if (images.length < 2 || !images.every((i) => i.pin)) {
    console.log("нужны два настоящих пина и рабочий формат картинок — пропущено");
  } else {
    try {
      const [t0] = await client.texts(images.map(({ pin }) => pinText(pin)));
      const v0 = await client.image(images[0].dataUrl);
      const v1 = await client.image(images[1].dataUrl);
      const own = cosine(t0, v0);
      const other = cosine(t0, v1);
      console.log(`свой пин:  ${own.toFixed(3)}   чужой пин: ${other.toFixed(3)}`);
      console.log(
        own > other
          ? "OK: текст и картинка одного пина ближе — поиск по фото ищет по смыслу"
          : "ПОДОЗРИТЕЛЬНО: своей пары не хватает — эндпоинт, возможно, не мультимодальный",
      );
    } catch (err) {
      // дальше всё равно интересно состояние индекса
      console.log(`FAIL: ${err.message}`);
      process.exitCode = 1;
    }
  }

  line("индекс");
  await indexInfo(config);
}

main().catch((e) => {
  console.error("probe failed:", e.message);
  process.exit(1);
});
