import { request, type FullConfig } from "@playwright/test";

// Turbopack собирает маршрут при первом запросе, и в обычном прогоне это
// происходит уже внутри теста: «первая» навигация регистрирующегося человека
// ждала компиляцию /boards и не укладывалась в бюджет. Сборка никуда не
// девается — она просто случается здесь, один раз, до первого теста.
//
// Ответ здесь не важен (часть маршрутов без сессии отдаст редирект или 404),
// важен сам факт, что маршрут скомпилирован.
const ROUTES = [
  "/",
  "/signup",
  "/login",
  "/boards",
  "/search?q=sofa",
  "/pin/pin-1",
  "/pin/new",
  "/board/00000000-0000-0000-0000-000000000000",
  "/profile/00000000-0000-0000-0000-000000000000",
  "/category/interior",
];

export default async function globalSetup(config: FullConfig) {
  // Тот же адрес, что в playwright.config: наружу отдаёт его проект, а не
  // корневой конфиг.
  const base = config.projects[0].use.baseURL ?? "http://localhost:3000";
  const ctx = await request.newContext();
  const t0 = Date.now();
  for (const route of ROUTES) {
    // Ошибку не глотаем: если dev-сервера ещё нет, прогрев бессмысленен, и
    // лучше упасть здесь с внятным текстом, чем потом на таймаутах тестов.
    await ctx.get(`${base}${route}`, { timeout: 180_000 });
  }
  console.log(`прогрето ${ROUTES.length} маршрутов за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  await ctx.dispose();
}
