import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    // Аккаунты живут в Python-бэкенде (backend/app.py). Same-origin прокси,
    // поэтому cookie-сессия ставится для домена сайта без CORS.
    const backend = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";
    return {
      afterFiles: [
        { source: "/api/auth/:path*", destination: `${backend}/api/auth/:path*` },
        { source: "/api/boards", destination: `${backend}/api/boards` },
        { source: "/api/boards/:path*", destination: `${backend}/api/boards/:path*` },
        { source: "/api/likes", destination: `${backend}/api/likes` },
        { source: "/api/likes/:path*", destination: `${backend}/api/likes/:path*` },
        { source: "/api/pins", destination: `${backend}/api/pins` },
        { source: "/api/pins/:path*", destination: `${backend}/api/pins/:path*` },
        { source: "/api/uploads/:path*", destination: `${backend}/api/uploads/:path*` },
        { source: "/api/img/download", destination: `${backend}/api/img/download` },
        { source: "/api/users/:path*", destination: `${backend}/api/users/:path*` },
        { source: "/api/notifications", destination: `${backend}/api/notifications` },
        { source: "/api/notifications/:path*", destination: `${backend}/api/notifications/:path*` },
        { source: "/api/media", destination: `${backend}/api/media` },
        // События продукта: POST принимает бэкенд (пишет в свою SQLite).
        { source: "/api/ev", destination: `${backend}/api/ev` },
        { source: "/api/ev/summary", destination: `${backend}/api/ev/summary` },
        { source: "/api/ev/board", destination: `${backend}/api/ev/board` },
        { source: "/api/media/:path*", destination: `${backend}/api/media/:path*` },
        { source: "/api/comments/:path*", destination: `${backend}/api/comments/:path*` },
        { source: "/api/pin/:pid/comments", destination: `${backend}/api/pin/:pid/comments` },
        { source: "/api/feed/subscriptions", destination: `${backend}/api/feed/subscriptions` },
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
    // Ограниченный набор ширины вместо 100..7000 с шагом: иначе каждый новый
    // размер выносит в кэш отдельную картинку и попадание в кэш падает.
    deviceSizes: [390, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [96, 128, 192, 256, 384, 512, 640, 828, 1080],
    // Моки ленты едут через weserv (picsum блокирует хотлинкинг), остальные
    // картинки — внутренние пути /api/img и /api/uploads.
    remotePatterns: [{ protocol: "https", hostname: "images.weserv.nl" }],
    // Внутренние пути next/image пропускает только перечисленные в
    // localPatterns; у /api/img адрес источника живёт в query, поэтому
    // search не ограничиваем — сам прокси уже проверяет хосты.
    localPatterns: [{ pathname: "/api/img" }, { pathname: "/api/uploads/**" }],
  },
};

export default nextConfig;
