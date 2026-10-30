import { defineConfig } from "@playwright/test";

// Смоук-контур: три пользовательских сценария против реального сайта и
// реального Python-бэкенда. В CI бэкенд запускается отдельным шагом,
// локально — `python -m uvicorn backend.app:app --port 8000` + этот конфиг.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    // http://localhost, а не 127.0.0.1: Next 16 блокирует dev-ресурсы по
    // чужому origin, гидрация не доходит, и каждый селектор клиентского
    // компонента падает с «элемент не найден» вместо «сайт не гидратировался».
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ru-RU",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
