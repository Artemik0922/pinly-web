// Прогрев кэша: заполняет дисковый кэш ленты (Openverse) и картинок
// (/api/img), обращаясь к запущенному серверу через обычные роуты —
// ровно тот же кодpath, что и у реальных пользователей.
//
// Использование: запустите сервер (npm start), затем `npm run warm`.
// Троттлинг 4с между запросами ленты — чтобы не выйти за анонимный
// лимит Openverse 20 запросов/мин.

const BASE = process.env.WARM_BASE_URL ?? "http://localhost:3000";
const CATEGORIES = [
  "Интерьер",
  "Рецепты",
  "Путешествия",
  "Мода",
  "Искусство",
  "Природа",
  "Архитектура",
  "Рукоделие",
  "Фитнес",
  "Книги и рабочее место",
];
const PAGES_PER_CATEGORY = 3; // cursors 0..2 = все 3 запроса категории
const ALL_FEED_PAGES = 6;
const IMAGE_CONCURRENCY = 5;
const FEED_DELAY_MS = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function warmFeed(params) {
  const url = `${BASE}/api/feed?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`${res.status} @ ${url}`);
  return res.json();
}

async function main() {
  console.log(`Прогрев кэша через ${BASE}…`);
  const imageUrls = new Set();
  let feeds = 0;
  let failures = 0;

  const jobs = [];
  for (const category of CATEGORIES) {
    for (let cursor = 0; cursor < PAGES_PER_CATEGORY; cursor++) {
      jobs.push({ category, cursor });
    }
  }
  for (let cursor = 0; cursor < ALL_FEED_PAGES; cursor++) {
    jobs.push({ cursor });
  }

  for (const job of jobs) {
    try {
      const page = await warmFeed(job);
      feeds++;
      for (const pin of page.pins) {
        if (pin.sourceUrl) imageUrls.add(pin.sourceUrl);
      }
      process.stdout.write(`\rлента: ${feeds}/${jobs.length} (пинов в кэше картинок: ${imageUrls.size})`);
    } catch (err) {
      failures++;
      console.error(`\nfail: ${JSON.stringify(job)} — ${err.message}`);
    }
    await sleep(FEED_DELAY_MS);
  }
  console.log("");

  // Картинки идут напрямую с flickr/wikimedia — лимитов Openverse нет,
  // греем параллельно.
  let done = 0;
  const queue = [...imageUrls];
  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      try {
        const res = await fetch(`${BASE}/api/img?u=${encodeURIComponent(u)}`, {
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(String(res.status));
        await res.arrayBuffer();
      } catch (err) {
        failures++;
        console.error(`img fail: ${u.slice(0, 90)} — ${err.message}`);
      }
      done++;
      process.stdout.write(`\rкартинки: ${done}/${imageUrls.size}`);
    }
  }
  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, worker));
  console.log(`\nГотово: ${feeds} страниц ленты, ${done} картинок, ошибок: ${failures}.`);
}

main().catch((e) => {
  console.error("warm failed:", e.message);
  process.exit(1);
});
