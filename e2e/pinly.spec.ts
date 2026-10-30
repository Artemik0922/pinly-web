import { expect, test } from "@playwright/test";

// Три сценария, которые дороже всего ломать: лента, новый аккаунт с
// секретной доской и комментарий под пином. Всё — через интерфейс, как
// это делает человек; бэкенд при этом настоящий.

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("лента открывается и показывает пины", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Лента идей/ })).toBeVisible();
  // карточки — ссылки на страницы пинов; ждём хотя бы первую
  await expect(page.locator('main a[href^="/pin/"]').first()).toBeVisible();
  // ошибок гидрации в консоли быть не должно
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.reload();
  await expect(page.locator('main a[href^="/pin/"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("регистрация, секретная доска и комментарий", async ({ page }) => {
  // 1. новый аккаунт
  await page.goto("/signup");
  await page.getByLabel("Имя", { exact: true }).fill("Тестовый Смоук");
  await page.getByLabel("Email", { exact: true }).fill(`smoke${stamp}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("secret12345");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL("/");
  // шапка увидела сессию без перезагрузки
  await expect(page.getByRole("button", { name: "Меню пользователя" })).toBeVisible();

  // 2. секретная доска
  await page.goto("/boards");
  await page.getByPlaceholder("Название новой доски…").fill(`Смоук ${stamp}`);
  await page.getByLabel("Секретная").check();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText(`Смоук ${stamp}`).first()).toBeVisible();
  await expect(page.getByText("Секретная").first()).toBeVisible();

  // 3. комментарий под пином
  // domcontentloaded: карточки тянут картинки с внешнего хоста, и на медленной
  // сети событие load может не дойти до нас вовсе
  await page.goto("/pin/pin-1", { waitUntil: "domcontentloaded" });
  const box = page.getByPlaceholder("Добавьте комментарий…");
  await box.fill(`Смоук-комментарий ${stamp}`);
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText(`Смоук-комментарий ${stamp}`)).toBeVisible();
  // и его можно удалить со страницы
  await page.getByRole("button", { name: "Удалить комментарий" }).first().click();
  await expect(page.getByText(`Смоук-комментарий ${stamp}`)).toHaveCount(0);
});

test("поиск отвечает заголовком и результатами", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent("кухня")}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Поиск");
  // поиск либо находит пины, либо честно сообщает, что ничего нет
  await expect(
    page
      .locator('main a[href^="/pin/"]')
      .first()
      .or(page.getByText(/ничего не нашлось/)),
  ).toBeVisible({ timeout: 20_000 });
  // и не должен попадать в индекс
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("доска отдаёт превью для мессенджера и кнопку «Поделиться»", async ({ page, request, context }) => {
  // Мастер показывает работы клиенту ссылкой — проверка, что ссылка не
  // пустая: превью-картинка в серверном HTML и кнопка шаринга на своей доске.
  const title = `Портфолио ${stamp}`;

  await page.goto("/signup");
  await page.getByLabel("Имя", { exact: true }).fill("Мастер Смоук");
  await page.getByLabel("Email", { exact: true }).fill(`share${stamp}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("secret12345");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  // пока сессия не поднята, доски уходят в localStorage
  await expect(page).toHaveURL("/");

  await page.goto("/boards");
  await page.getByPlaceholder("Название новой доски…").fill(title);
  await page.getByRole("button", { name: "Создать", exact: true }).click();

  // ссылка должна вести на серверный UUID, а не на временный b-…
  const link = page.locator('main a[href^="/board/"]').filter({ hasText: title });
  await expect(link).toHaveAttribute("href", /^\/board\/[0-9a-f-]{36}$/);
  const boardPath = (await link.getAttribute("href"))!;

  // domcontentloaded: карточки тянут картинки с внешнего хоста, и на медленной
  // сети событие load может не дойти до нас вовсе
  await page.goto("/pin/pin-1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Доска для сохранения/ }).first().click();
  await page.getByRole("menuitemcheckbox", { name: title }).click();
  await expect(page.getByRole("button", { name: "Сохранено" })).toBeVisible();

  // og:image читаем из серверного HTML: боты мессенджеров cookies не носят
  const html = await (await request.get(boardPath)).text();
  expect(html).toContain('property="og:image" content="http');
  expect(html).toContain(`property="og:title" content="${title}`);

  await page.goto(boardPath);
  await expect(page.getByRole("button", { name: "Поделиться" })).toBeVisible({ timeout: 40_000 });
  // сама карточка может быть ещё не видима (картинка едет через прокси),
  // но доска обязана показывать, что работа в ней одна
  await expect(page.getByText(/1 пин/)).toBeVisible();
  await expect(page.locator('main a[href^="/pin/pin-1"]')).toHaveCount(1);

  // клик по «Поделиться» обязан положить в буфер ровно адрес этой доски
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Поделиться" }).click();
  await expect(page.getByText("Ссылка на доску скопирована")).toBeVisible();
  // порт берём из текущего адреса, иначе проверка привязана к 3000 и падает
  // на любом другом порту (прод-сборка, CI, параллельный запуск)
  const origin = new URL(page.url()).origin;
  // в ссылке обязана быть пометка канала: без неё весь трафик из чатов
  // прилетает в сводку как «напрямую», и «привёл мастер людей или нет»
  // становится неизмеримо
  expect(await page.evaluate("navigator.clipboard.readText()")).toBe(
    `${origin}${boardPath}?from=link`,
  );
});

test("браузер считает визит и приход на доску по метке источника", async ({ page }) => {
  // Рекламная модель живёт на показах: если трекер не стреляет из браузера,
  // цифры в сводке означают только curl-проверки, а не поведение людей.
  const title = `Счётчик ${stamp}`;

  await page.goto("/signup");
  await page.getByLabel("Имя", { exact: true }).fill("Счётчик Смоук");
  await page.getByLabel("Email", { exact: true }).fill(`track${stamp}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("secret12345");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/boards");
  await page.getByPlaceholder("Название новой доски…").fill(title);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const link = page.locator('main a[href^="/board/"]').filter({ hasText: title });
  await expect(link).toHaveAttribute("href", /^\/board\/[0-9a-f-]{36}$/);

  // переход «как из чата»: ссылка с меткой источника
  const boardPath = (await link.getAttribute("href"))!;
  await page.goto(`${boardPath}?from=vk`);
  await expect(page.getByRole("button", { name: "Поделиться" })).toBeVisible({ timeout: 40_000 });

  // сводка под замком: нужен page.request, он разделит cookie со страницей
  const summary = await (await page.request.get("/api/ev/summary?days=1")).json();
  expect(summary.events.some((e: { name: string }) => e.name === "visit")).toBe(true);
  expect(summary.events.some((e: { name: string }) => e.name === "board_created")).toBe(true);
  expect(summary.boardViewSources.some((s: { source: string }) => s.source === "vk")).toBe(true);
});

test("у категории есть постоянный адрес для поиска", async ({ page, request }) => {
  // Реклама кормится показами, показы — входом извне. Значит у ленты по
  // категории должен быть адрес, который можно отдать краулеру: со своим
  // заголовком, h1 в серверном HTML и каноником, не дублирующим главную.
  const res = await request.get("/category/interior");
  expect(res.ok()).toBe(true);
  const html = await res.text();
  expect(html).toContain("Интерьер");
  expect(html).toMatch(/<h1[^>]*>Интерьер/);
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  expect(canonical).toBeTruthy();
  expect(new URL(canonical!).pathname).toBe("/category/interior");

  // старый query-адрес остаётся живым (ссылки уже разосланы), но каноник
  // ведёт на чистый URL — иначе десять лент склеиваются в дубли
  const query = await request.get(`/?category=${encodeURIComponent("Рецепты")}`);
  expect(query.ok()).toBe(true);
  const queryCanonical = (await query.text()).match(/rel="canonical" href="([^"]+)"/)?.[1];
  expect(new URL(queryCanonical!).pathname).toBe("/category/recepty");

  // чипс над лентой ведут на чистые адреса
  await page.goto("/category/recepty", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Интерьер" })).toHaveAttribute(
    "href",
    "/category/interior",
  );

  // выдуманная категория не должна попадать в индекс. Статус при этом 200:
  // под PPR оболочка уходит раньше, чем доходит до notFound(), и Next сам
  // добавляет странице noindex — проверяем именно его
  const bogus = await request.get("/category/net-takoi");
  expect(bogus.ok()).toBe(true);
  expect(await bogus.text()).toContain('content="noindex"');
});

test("мастер видит цифры своей доски", async ({ page, browser }) => {
  // Главное допущение продукта — «расшаренная доска приводит чужих людей».
  // Проверка, что мастеру это видно на его же доске, а не только владельцу
  // сайта в сводке.
  const title = `Цифры ${stamp}`;

  await page.goto("/signup");
  await page.getByLabel("Имя", { exact: true }).fill("Мастер Цифр");
  await page.getByLabel("Email", { exact: true }).fill(`stats${stamp}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("secret12345");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/boards");
  await page.getByPlaceholder("Название новой доски…").fill(title);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const link = page.locator('main a[href^="/board/"]').filter({ hasText: title });
  await expect(link).toHaveAttribute("href", /^\/board\/[0-9a-f-]{36}$/);

  await page.goto((await link.getAttribute("href"))!, { waitUntil: "domcontentloaded" });
  const panel = page.getByText("Цифры доски");
  await expect(panel).toBeVisible({ timeout: 40_000 });
  await panel.click();
  // открывал доску пока только сам мастер — чужих открытий быть не должно,
  // и панель обязана сказать это прямо, а не нарисовать единицу
  await expect(page.getByText(/открывали только вы/)).toBeVisible();
  expect(await page.locator("details").textContent()).not.toContain("testclient");

  // чужая доска цифр не показывает: гость видит её как read-only
  const boardUrl = page.url();
  const anon = await browser.newPage();
  await anon.goto(boardUrl, { waitUntil: "domcontentloaded" });
  await expect(anon.getByText("Цифры доски")).toHaveCount(0);
  await anon.close();
});
