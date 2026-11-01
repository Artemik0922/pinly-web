// Аудит дизайн-системы по живым страницам: меряет то, что видно в браузере,
// а не то, что написано в CSS. Смысл в том, чтобы гармония не деградировала
// молча — новый экран с «ещё одной красивой шириной» ломает ритм всего сайта,
// и заметить это глазами невозможно.
//
//   npm run build && npm start           # или любой запущенный прод-сборки
//   node scripts/ui-audit.mjs            # exit 1, если есть нарушение
//
// Правила взяты из DESIGN.md: шкала ширин страницы, шкала радиусов, сетка
// отступов 4 px, тап-цель 44 px, минимальный кегль 11 px, отсутствие
// горизонтального скролла.

import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Страницы, которые видят люди и краулер. Свои доски и чат требуют сессии —
// без неё они честно показывают «войдите», и этот путь тоже под проверкой.
const ROUTES = [
  "/",
  "/search?q=кухня",
  "/category/interior",
  "/pin/pin-1",
  "/privacy",
  "/terms",
  "/boards",
  "/media",
  "/subscriptions",
  "/messages",
  "/notifications",
  "/login",
  "/signup",
  "/no-such-page",
];

const VIEWPORTS = [
  { width: 390, height: 844, name: "mobile" },
  { width: 1280, height: 800, name: "desktop" },
];

// Шкала (DESIGN.md): лента широкая, детальная страница — средняя, форма —
// узкая, юридический текст — текстовая колонка, поля входа — своя.
const SHELLS = [1800, 1240, 900, 672, 448];
const RADII = [8, 12, 16, 24];
const MIN_TAP = 40;
const MIN_FONT = 11;

const probe = (limits) => {
  const px = (v) => parseFloat(v) || 0;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && +cs.opacity > 0.05;
  };
  const nodes = [...document.querySelectorAll("body *")].filter(visible);

  const shells = [];
  for (const el of nodes) {
    if (!el.className.toString().includes("mx-auto")) continue;
    const w = px(getComputedStyle(el).maxWidth);
    if (w > 400) shells.push(Math.round(w));
  }

  const radii = [...new Set(nodes.map((e) => px(getComputedStyle(e).borderRadius)))].filter(
    (v) => v > 0,
  );
  const gaps = [...new Set(nodes.map((e) => px(getComputedStyle(e).gap)))].filter((v) => v > 0);
  const fonts = [...new Set(nodes.map((e) => px(getComputedStyle(e).fontSize)))];

  // Встроенная в предложение ссылка (например «Пользовательское соглашение»
  // внутри абзаца) — не кнопка: для неё действует исключение по размеру цели.
  const taps = [];
  for (const el of nodes) {
    if (!/^(BUTTON|A)$/.test(el.tagName)) continue;
    const own = (el.textContent ?? "").trim().length;
    const parent = (el.parentElement?.textContent ?? "").trim().length;
    if (parent > own + 3) continue;
    const r = el.getBoundingClientRect();
    if (r.height < limits.minTap || r.width < 24) {
      taps.push({
        h: Math.round(r.height),
        w: Math.round(r.width),
        what: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24),
      });
    }
  }

  return {
    shells: [...new Set(shells)],
    radii,
    gaps,
    fonts,
    taps,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
};

const browser = await chromium.launch();
const problems = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp });
  // Заставка живёт одну сессию и на время перекрывает страницу — при замере
  // она только мешает, поэтому считаем её уже показанной.
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem("pinly:splash:seen", "1");
    } catch {}
  });
  const page = await ctx.newPage();

  for (const path of ROUTES) {
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    } catch {
      problems.push(`${vp.name} ${path}: страница не открылась`);
      continue;
    }
    await page.waitForTimeout(900);
    const r = await page.evaluate(probe, { minTap: MIN_TAP });

    for (const w of r.shells) {
      if (!SHELLS.some((s) => Math.abs(s - w) <= 1)) {
        problems.push(`${vp.name} ${path}: ширина страницы ${w}px вне шкалы ${SHELLS.join("/")}`);
      }
    }
    for (const rad of r.radii) {
      if (rad < 9999 && !RADII.some((v) => Math.abs(v - rad) <= 0.6)) {
        problems.push(`${vp.name} ${path}: радиус ${rad}px вне шкалы ${RADII.join("/")} (+ pill)`);
      }
    }
    for (const gap of r.gaps) {
      if (gap % 4 !== 0) problems.push(`${vp.name} ${path}: gap ${gap}px не кратен 4`);
    }
    for (const f of r.fonts) {
      if (f < MIN_FONT) problems.push(`${vp.name} ${path}: кегль ${f}px меньше ${MIN_FONT}px`);
    }
    for (const t of r.taps) {
      problems.push(
        `${vp.name} ${path}: тап-цель ${t.h}×${t.w}px — «${t.what}» (нужно ≥${MIN_TAP}px)`,
      );
    }
    if (r.overflowX) problems.push(`${vp.name} ${path}: горизонтальный скролл`);
  }
  await ctx.close();
}

await browser.close();

if (problems.length) {
  console.error(`дизайн-аудит: ${problems.length} нарушений`);
  for (const p of problems) console.error("  • " + p);
  process.exit(1);
}
console.log(
  `дизайн-аудит: чисто — ${ROUTES.length} адресов × ${VIEWPORTS.length} ширины, ` +
    `шкалы: ширины ${SHELLS.join("/")}, радиусы ${RADII.join("/")}+pill, сетка 4px, тап ≥${MIN_TAP}px`,
);
