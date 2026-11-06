import type { NextConfig } from "next";

// canonical, og:url и sitemap строятся из NEXT_PUBLIC_SITE_URL; при пустом
// значении site.ts подставляет localhost:3000. Сайт при этом собирается и
// работает — просто все его адреса ведут на машинку разработчика. Проверка
// включается явным флагом, потому что CI и локальные прогоны собирают без
// боевого домена намеренно.
if (process.env.PINLY_REQUIRE_SITE_URL === "1" && !process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL пуст, а PINLY_REQUIRE_SITE_URL=1: соберётся сайт, у которого " +
      "canonical, og:image и sitemap.xml указывают на localhost. Задайте домен в окружении сборки.",
  );
}

// Same-origin прокси в Python-бэкенд: cookie-сессия ставится для домена сайта,
// поэтому CORS не нужен ни в браузере, ни в тестах.
//
// Список — то, чем владеет бэкенд. source и destination здесь всегда
// совпадают, поэтому один перечень префиксов вместо 25 рукописных пар:
// забытый подпуть — это не 404, а тихо вернувшийся Next-роут.
//
// Особые случаи отдельно: /api/feed и /api/img — роуты самого Next (у ленты
// оттуда только /api/feed/subscriptions), /api/pin/:pid/comments живёт внутри
// чужого префикса.
const BACKEND_PREFIXES = [
  "/api/auth",
  "/api/boards",
  "/api/likes",
  "/api/pins",
  "/api/uploads",
  "/api/users",
  "/api/notifications",
  "/api/media",
  "/api/comments",
  "/api/chats",
  "/api/messages",
];

const BACKEND_EXACT = [
  // События продукта: POST принимает бэкенд (пишет в свою SQLite).
  "/api/ev",
  "/api/ev/summary",
  "/api/ev/board",
  "/api/img/download",
  "/api/feed/subscriptions",
];

function toBackend(backend: string, path: string) {
  return { source: path, destination: `${backend}${path}` };
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    const backend = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";
    return {
      afterFiles: [
        ...BACKEND_PREFIXES.flatMap((prefix) => [
          toBackend(backend, prefix),
          toBackend(backend, `${prefix}/:path*`),
        ]),
        ...BACKEND_EXACT.map((path) => toBackend(backend, path)),
        toBackend(backend, "/api/pin/:pid/comments"),
      ],
    };
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // AVIF для всего, что его понимает: те же 384px весят заметно меньше WebP.
    formats: ["image/avif", "image/webp"],
    // Оптимизированные варианты живут сутки — столько же, сколько кэш ленты.
    minimumCacheTTL: 86400,
    // Ограниченный набор ширины: 100..7000 с шагом выносил в кэш отдельную
    // копию на каждый размер. 12 значений вместо 17 — не вкусовщина, а потолок
    // того, что сайт действительно рисует: карточка ленты на широком экране
    // при DPR 2 — ~730 px, крупный носитель на странице пина — ~1536 px
    // (45vw от 1920 при DPR 2). Каждый кандидат живёт и в HTML (~1,5 КБ на
    // картинку), и в <link rel=preload> первых карточек, поэтому список
    // измеряется байтами, которые летят пользователю.
    deviceSizes: [390, 768, 1024, 1280, 1536],
    imageSizes: [96, 128, 192, 256, 384, 512, 640],
    // Моки ленты едут через weserv (picsum блокирует хотлинкинг), остальные
    // картинки — внутренние пути /api/img и /api/uploads.
    remotePatterns: [{ protocol: "https", hostname: "images.weserv.nl" }],
    // Внутренние пути next/image пропускает только перечисленные в
    // localPatterns; у /api/img адрес источника живёт в query, поэтому
    // search не ограничиваем — сам прокси уже проверяет хосты.
    localPatterns: [
      { pathname: "/api/img" },
      { pathname: "/api/uploads/**" },
      // Знак в шапке и на заставке: 186-килобайтный PNG отдавался как есть,
      // хотя на экране это 36 и 64 px. Через оптимизатор те же пиксели весят
      // единицы килобайт (см. docs/performance.md).
      { pathname: "/logo-mark.png" },
    ],
  },
};

export default nextConfig;
