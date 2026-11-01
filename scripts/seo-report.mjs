// Отчёт «что поисковик и мессенджер видят без JavaScript».
//
// Берёт публичный /sitemap.xml (то есть ровно то, что мы сами обещаем
// краулеру), выборочно обходит адреса обычным fetch — без браузера, без
// гидрации — и печатает, сколько содержимого приехало в HTML. Это точка отсчёта
// для фазы «витрина видна без JS»: до и после сравниваются одними и теми же
// числами, а не ощущениями.
//
// Запуск: node scripts/seo-report.mjs            (или npm run seo:report)
// Адрес сайта: SEO_BASE_URL (по умолчанию http://localhost:3000)
// Сколько адресов на тип: SEO_SAMPLE (по умолчанию 6)

const BASE = process.env.SEO_BASE_URL ?? "http://localhost:3000";
const SAMPLE = Number(process.env.SEO_SAMPLE ?? 6);
const TIMEOUT_MS = 20_000;

const TYPES = ["category", "pin", "board", "profile"];

function group(urls) {
  const by = new Map(TYPES.map((t) => [t, []]));
  for (const u of urls) {
    const match = /^\/(category|pin|board|profile)\//.exec(new URL(u).pathname);
    if (match) by.get(match[1]).push(u);
  }
  return by;
}

async function text(path) {
  const res = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "pinly-seo-report" },
  });
  return { status: res.status, body: await res.text() };
}

async function audit(url) {
  const path = url.slice(BASE.length) || "/";
  let row = { url: path, status: 0, bytes: 0, pins: 0, boards: 0, og: false, ogLocal: false, loader: false, abs: true };
  try {
    const { status, body } = await text(path);
    // Next пишет и property=, и content= в одном теге, порядок атрибутов не
    // гарантирован — поэтому ищем тег целиком, а не склейку двух атрибутов.
    const ogImage = [...body.matchAll(/<meta[^>]*property="og:image"[^>]*>/g)].find(
      (m) => !/og:image:/.test(m[0]),
    )?.[0];
    const ogContent = /content="([^"]*)"/.exec(ogImage ?? "")?.[1] ?? "";
    row = {
      url: path,
      status,
      bytes: Buffer.byteLength(body),
      pins: (body.match(/href="\/pin\//g) ?? []).length,
      boards: (body.match(/href="\/board\//g) ?? []).length,
      og: /^https?:\/\//.test(ogContent),
      // localhost в превью = мессенджер картинку не получит
      ogLocal: /localhost|127\.0\.0\.1/.test(ogContent),
      loader: body.includes("Загрузка…"),
      // canonical должен вести на домен карты, а не на localhost
      abs: !/rel="canonical"[^>]*href="http:\/\/localhost/.test(body),
    };
  } catch (err) {
    row.error = err.message.slice(0, 40);
  }
  // «пустой» витриной считаем адрес, где нет ни ссылок на пины, ни ссылок на
  // доски: содержимое приехало бы только после гидрации
  row.empty = row.pins === 0 && row.boards === 0;
  return row;
}

function table(rows) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    pad("адрес", 46), pad("код", 5), pad("КБ", 6), pad("пины", 6), pad("доски", 7),
    pad("og:image", 11), "пустой HTML",
  );
  for (const r of rows) {
    console.log(
      pad(r.url, 46),
      pad(r.error ? "ERR" : r.status, 5),
      pad((r.bytes / 1024).toFixed(1), 6),
      pad(r.pins, 6),
      pad(r.boards, 7),
      pad(r.og ? (r.ogLocal ? "localhost" : "да") : "НЕТ", 11),
      r.empty ? "ПУСТОЙ" : "",
      r.error ?? "",
    );
  }
}

async function main() {
  const map = await text("/sitemap.xml");
  if (map.status !== 200) {
    console.error(`sitemap.xml -> ${map.status}, обход невозможен`);
    process.exit(1);
  }
  const urls = [...map.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const by = group(urls);
  const all = [];

  console.log(`${BASE}: в карте ${urls.length} адресов`);
  for (const [type, list] of by) {
    if (!list.length) {
      // пустой список досок/профилей почти всегда означает, что бэкенд
      // недоступен: карта собирается из его /api/seo/urls
      console.log(`\n── ${type}: 0 адресов в карте`);
      continue;
    }
    // детерминированная выборка: первые N, иначе каждый прогон меряет разное
    const rows = [];
    for (const url of list.slice(0, SAMPLE)) rows.push(await audit(url));
    all.push(...rows);
    const emptyCount = rows.filter((r) => r.empty).length;
    console.log(
      `\n── ${type}: ${list.length} в карте, проверено ${rows.length}, пустых HTML: ${emptyCount}` +
        ` (${Math.round((emptyCount / rows.length) * 100)}%)`,
    );
    table(rows);
  }

  const empties = all.filter((r) => r.empty).length;
  const noOg = all.filter((r) => !r.og).length;
  const localOg = all.filter((r) => r.ogLocal).length;
  const localhost = all.filter((r) => !r.abs).length;
  console.log(
    `\nИТОГ: проверено ${all.length}, пустых HTML ${empties} (${Math.round((empties / all.length) * 100)}%),` +
      ` og:image нет у ${noOg}, og:image на localhost у ${localOg}, canonical на localhost: ${localhost}`,
  );
}

main().catch((e) => {
  console.error("seo-report failed:", e.message);
  process.exit(1);
});
