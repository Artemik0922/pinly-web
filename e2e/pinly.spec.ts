import { expect, test, type APIRequestContext } from "@playwright/test";

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

test("заставка показывается один раз за сессию и не запирает скролл", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main a[href^="/pin/"]').first()).toBeVisible();
  // в первый заход экран был (любая из фаз — on уже мог смениться hidden)
  expect(["on", "burst", "hidden"]).toContain(
    await page.evaluate(() => document.documentElement.dataset.splash),
  );

  await page.reload();
  // второй заход в той же сессии: ни экрана, ни роя мышей, сразу страница
  expect(await page.evaluate(() => document.documentElement.dataset.splash)).toBe("skipped");
  await expect(page.locator('main a[href^="/pin/"]').first()).toBeVisible({ timeout: 4000 });
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
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
  // exact: на странице пина есть и кнопка «Отправить в сообщении» (чат),
    // без exact строгий локатор находит оба
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
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

test("заголовок пина не разрывает блок структурированных данных", async ({ page }) => {
  // Payload в названии: страница пина отдаётся без авторизации, а JSON-LD
  // вставляется как текст <script>. Если его не экранировать, закрывающий тег
  // из названия обрывает блок, и дальше браузер исполняет уже разметку
  // (stored XSS). Проверено живым запросом 2026-10-31 — тест нужен, чтобы это
  // не вернулось под видом «мелкой правки метаданных».
  const payload = `XSS ${Date.now()}</script><b class="xss">BB</b>`;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );

  await page.goto("/signup");
  await page.getByLabel("Имя", { exact: true }).fill("Тихон Эксплоит");
  await page.getByLabel("Email", { exact: true }).fill(`xss${Date.now()}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("secret12345");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/pin/new");
  await page.setInputFiles('input[type="file"]', { name: "x.png", mimeType: "image/png", buffer: png });
  await page.getByPlaceholder("Название").fill(payload);
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page).toHaveURL(/\/pin\/up-[0-9a-f]{32}$/);

  // ни одного «лишнего» узла из payload: экранирование обязано остаться в тексте
  await expect(page.locator("b.xss")).toHaveCount(0);
  const ld = page.locator('script[type="application/ld+json"]');
  await expect(ld).toHaveCount(1);
  // toContainText читает innerText, а у <script> он пустой: смотрим textContent
  const ldText = (await ld.textContent()) ?? "";
  expect(ldText).toContain("\\u003c/script\\u003e");
  expect(ldText).not.toContain("</script>");
  // и при этом заголовок виден читателю целиком — escape не портит содержимое
  await expect(page.getByRole("heading", { level: 1 })).toContainText("XSS");
});

// ── поиск по фото ────────────────────────────────────────────────────────

// 1×1 PNG: настоящая сигнатура, которую проходит sniffImageType на сервере.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const sendPhoto = (
  request: APIRequestContext,
  buffer: Buffer,
  headers?: Record<string, string>,
) =>
  request.post("/api/search/image", {
    multipart: { file: { name: "photo.png", mimeType: "image/png", buffer } },
    ...(headers ? { headers } : null),
  });

test("режим «по фото» открывается из поиска и держит форму", async ({ page }) => {
  await page.goto("/search?by=image");
  await expect(page.getByRole("heading", { level: 1, name: "Поиск по фото" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Добавить фото/ })).toBeVisible();
  // переключение режима не теряет набранный запрос
  await page.goto("/search?q=sofa&by=image");
  await expect(page.getByRole("link", { name: "По тексту" })).toHaveAttribute("href", /q=sofa/);
});

test("поле, режим и источник фото — в одной строке, а не на разных концах экрана", async ({ page }) => {
  await page.goto("/search?q=sofa");
  const field = page.getByLabel("Поиск пинов");
  await expect(field).toBeVisible();
  // в шапке поля больше нет: два одинаковых ввода на одной странице — это два
  // места, где искать
  await expect(field).toHaveCount(1);
  const box = await field.boundingBox();
  const tabs = await page.getByRole("navigation", { name: "Режим поиска" }).boundingBox();
  expect(box && tabs && Math.abs(box.y - tabs.y) < 40).toBeTruthy();
  // и поле не растянуто на весь экран
  expect(box?.width).toBeLessThan(700);
});

test("меню источников фото: камера, файл, буфер — открывается сразу по pick=1", async ({ page }) => {
  const menu = page.getByRole("menu");
  // вход в режим по ссылке из шапки разворачивает меню без лишнего тапа
  await page.goto("/search?by=image&pick=1");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Камера/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Файл с компьютера/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Из буфера обмена/ })).toBeVisible();
  // закрыли — флаг сбрасывается, чтобы перезагрузка не открывала меню заново
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL("/search?by=image");
});

test("поиск по фото отвечает честным статусом и объясняет по-русски", async ({ request }) => {
  // Мусор с расширением .png — 400, и именно это проверка порядка: ошибка
  // клиента важнее конфигурации сервера, иначе без ключа был бы всегда 503.
  const garbage = await sendPhoto(request, Buffer.from("<html><script>alert(1)</script></html>"));
  expect(garbage.status()).toBe(400);
  expect((await garbage.json()).error).toContain("не читается");

  const huge = await sendPhoto(request, Buffer.alloc(6 * 1024 * 1024, 1));
  expect(huge.status()).toBe(413);
  expect((await huge.json()).error).toContain("5 МБ");

  // Настоящая картинка: настройка зависит от env сервера, поэтому проверяем
  // контракт, а не конкретный статус — 500 тут быть не может никогда.
  const real = await sendPhoto(request, TINY_PNG);
  expect([200, 502, 503]).toContain(real.status());
  const body = await real.json();
  if (real.status() === 200) {
    expect(Array.isArray(body.pins)).toBe(true);
    expect(typeof body.indexed).toBe("number");
  } else {
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(10);
  }
});

test("поиск по фото ограничили по частоте: он платный", async ({ request }) => {
  // Каждый запрос — вызов платного API эмбеддингов. Корзина — первый адрес из
  // X-Forwarded-For, поэтому тест берёт свой адрес и не мешает остальным.
  // Случайный последний октет может совпасть с чужой корзиной — тогда 429
  // придёт раньше, что тесту и нужно.
  const bucket = { "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` };
  const statuses: number[] = [];
  for (let i = 0; i < 24 && !statuses.includes(429); i++) {
    const res = await sendPhoto(request, TINY_PNG, bucket);
    statuses.push(res.status());
  }
  expect(statuses).toContain(429);
  expect(statuses[statuses.length - 1]).toBe(429);
});
