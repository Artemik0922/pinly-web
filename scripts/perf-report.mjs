// Производительность по живым замерам, а не по ощущениям.
//
//   npm run build && npm start     # прод-сборка: dev не измеряет ничего
//   node scripts/perf-report.mjs   # exit 1, если LCP или CLS выше порога
//
// Метод: мобильный контур (Pixel 7) и CPU×4 — на таком железе и таком трафике
// живёт российская аудитория, а не MacBook автора. Каждый маршрут меряется
// RUNS раз (по умолчанию 3), наружу выходит медиана: с одного замера доверия
// цифрам нет.
//
// Пороги — общеотраслевые границы Core Web Vitals «удовлетворительно»:
// LCP 2.5 с, CLS 0.1. Строка «тормоз» под маршрутом — самые долгие запросы
// прогона: она и показывает, что оптимизировать.

import { chromium, devices } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RUNS = Number(process.env.RUNS ?? 3);
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE ?? 4);
const LCP_BUDGET_MS = Number(process.env.LCP_BUDGET_MS ?? 2500);
const CLS_BUDGET = Number(process.env.CLS_BUDGET ?? 0.1);

// Публичные адресa: их видит краулер и человек из чата, и именно на них
// зарабатывает реклама.
const ROUTES = [
  ["лента", "/"],
  ["категория", "/category/interior"],
  ["пин", "/pin/pin-1"],
  ["поиск", "/search?q=%D0%BA%D1%83%D1%85%D0%BD%D1%8F"],
];

// Наблюдатели ставятся до навигации. Для FCP нужен entryTypes: ['paint']:
// через observe({type: 'first-contentful-paint'}) браузер бросает
// SyntaxError, и метрика молча остаётся нулевой — то есть враньём.
const installVitals = () => {
  const v = { lcp: 0, cls: 0, fcp: 0, lcpEl: "" };
  window.__vitals = v;
  const observe = (fn, options) => {
    try {
      new PerformanceObserver(fn).observe(options);
    } catch {
      /* метрики нет в этом браузере — пусть будет ноль, а не выдумка */
    }
  };
  observe((list) => {
    const e = list.getEntries().pop();
    if (!e) return;
    v.lcp = e.startTime;
    // Какой именно элемент оказался самым крупным — без этого «LCP 2 с»
    // остаётся загадкой: на первой визите им вполне может быть заставка.
    const el = e.element;
    if (el) {
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" ? `.${el.className.trim().split(/\s+/)[0]}` : "";
      v.lcpEl = `${el.tagName.toLowerCase()}${id}${cls} · ${Math.round(e.size)} байт · ${
        (e.url || "").slice(0, 60)
      }`;
    }
  }, { type: "largest-contentful-paint", buffered: true });
  observe(
    (list) => {
      for (const e of list.getEntries()) if (e.name === "first-contentful-paint") v.fcp = e.startTime;
    },
    { entryTypes: ["paint"] },
  );
  observe(
    (list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) v.cls += e.value;
    },
    { type: "layout-shift", buffered: true },
  );
};

// Классификация по URL, а не по initiatorType: предзагруженная картинка
// приходит как «link», и логотип падал в столбец «шрифт», где его никто не
// искал.
const readTotals = () => {
  const classify = (u, kind) => {
    if (/\.woff2?($|\?)/.test(u)) return "font";
    if (/\.css($|\?)/.test(u)) return "css";
    if (/\.js($|\?)/.test(u)) return "js";
    if (/\.(png|jpe?g|avif|webp|gif|svg|mp4|webm)($|\?)/.test(u)) return "image";
    if (u.includes("/_next/image") || u.includes("/api/img") || u.includes("/api/uploads")) return "image";
    if (kind === "fetch" || kind === "xmlhttprequest") return "data";
    return "other";
  };
  const nav = performance.getEntriesByType("navigation")[0];
  const groups = { html: 0, js: 0, css: 0, font: 0, image: 0, data: 0, other: 0 };
  const slowest = [];
  let requests = 0;
  for (const e of performance.getEntriesByType("resource")) {
    requests += 1;
    // Чужой origin без Access-Control-Allow-Origin браузер не раскрывает по
    // размерам: тогда в столбец ложится 0, и это «не видно», а не «ноль байт».
    groups[classify(e.name, e.initiatorType)] += e.transferSize || e.encodedBodySize || 0;
    slowest.push({
      ms: Math.round(e.duration),
      kb: ((e.transferSize || e.encodedBodySize) / 1024).toFixed(1),
      url: e.name.slice(0, 78),
    });
  }
  groups.html = nav ? nav.transferSize || nav.encodedBodySize || 0 : 0;
  return {
    groups,
    requests,
    total: Object.values(groups).reduce((a, x) => a + x, 0),
    ttfb: nav ? nav.responseStart - nav.fetchStart : 0,
    slowest: slowest.sort((a, b) => b.ms - a.ms).slice(0, 3),
  };
};

const kb = (n) => (n / 1024).toFixed(1);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const measure = async (browser, path) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  await page.addInitScript(installVitals);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120_000 });
  // LCP имеет право обновиться после load, ленивые картинки доезжают
  // asynchronously — ждём тишину в сети и секунду запаса. Байты читаем здесь,
  // а не на событии load: на load лента ещё не доехала.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1000);

  const vitals = await page.evaluate(() => window.__vitals);
  const totals = await page.evaluate(readTotals);
  await ctx.close();
  return { ...vitals, ...totals };
};

const browser = await chromium.launch();
const rows = [];

for (const [label, path] of ROUTES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, path));
  const g = (k) => median(runs.map((r) => r.groups[k]));
  const row = {
    label,
    path,
    lcp: median(runs.map((r) => r.lcp)),
    fcp: median(runs.map((r) => r.fcp)),
    cls: median(runs.map((r) => r.cls)),
    ttfb: median(runs.map((r) => r.ttfb)),
    total: median(runs.map((r) => r.total)),
    requests: median(runs.map((r) => r.requests)),
  };
  rows.push(row);
  console.log(
    `${label.padEnd(11)} LCP ${Math.round(row.lcp)} мс · FCP ${Math.round(row.fcp)} мс · ` +
      `TTFB ${Math.round(row.ttfb)} мс · CLS ${row.cls.toFixed(3)} · ` +
      `HTML ${kb(g("html"))} · JS ${kb(g("js"))} · картинки ${kb(g("image"))} · ` +
      `шрифт ${kb(g("font"))} · CSS ${kb(g("css"))} · данные ${kb(g("data"))} · ` +
      `всего ${kb(row.total)} КБ · ${row.requests} запросов`,
  );
  console.log(`        LCP-элемент: ${runs[runs.length - 1].lcpEl || "не зафиксирован"}`);
  for (const s of runs[runs.length - 1].slowest.filter((x) => x.ms > 800)) {
    console.log(`        тормоз ${s.ms} мс · ${s.kb} КБ · ${s.url}`);
  }
}

await browser.close();

const bad = rows.filter((r) => r.lcp > LCP_BUDGET_MS || r.cls > CLS_BUDGET);
console.log(
  `\nпороги: LCP ≤ ${LCP_BUDGET_MS} мс, CLS ≤ ${CLS_BUDGET} (медиана из ${RUNS} замеров, ` +
    `Pixel 7 + CPU×4, ${BASE})`,
);
if (bad.length) {
  for (const r of bad) {
    console.error(
      `нарушение: ${r.label} ${r.path} — LCP ${Math.round(r.lcp)} мс, CLS ${r.cls.toFixed(3)}`,
    );
  }
  process.exit(1);
}
