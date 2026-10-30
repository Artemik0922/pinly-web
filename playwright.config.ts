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
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "ru-RU",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
