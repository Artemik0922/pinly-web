<div align="center">

# Pinly

**Визуальная лента идей — веб-аналог Pinterest на Next.js 16 + FastAPI**

Лента-масонри, поиск, пины, доски, аккаунты, свои загрузки, подписки,
комментарии, секретные доски и персональная лента.

![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React 19](https://img.shields.io/badge/React-19-149eca?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-БД-003b57?logo=sqlite&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white)

</div>

---

<img src="docs/screenshots/feed-light.jpg" alt="Главная лента Pinly" width="100%">

## Скриншоты

<table>
  <tr>
    <td width="33%" align="center"><img src="docs/screenshots/splash.png" alt="Стартовый экран с летящими мышами" width="100%"></td>
    <td width="33%" align="center"><img src="docs/screenshots/pin.png" alt="Страница пина" width="100%"></td>
    <td width="33%" align="center"><img src="docs/screenshots/feed-dark.jpg" alt="Тёмная тема" width="100%"></td>
  </tr>
  <tr>
    <td align="center">Стартовый экран: из логотипа вылетает рой летучих мышей</td>
    <td align="center">Страница пина: лайк, скачивание, «поделиться», комментарии</td>
    <td align="center">Тёмная тема — включается до первой отрисовки, без мигания</td>
  </tr>
</table>

## Откуда контент

**Контент динамический:** лента собирается из нескольких открытых источников —
[Openverse](https://api.openverse.org/v1/) (flickr, wikimedia и др.),
Метрополитен-музей и музей Кливленда (CC0: «Искусство», «Архитектура», «Мода»),
Wikimedia Commons напрямую (общий фид и поиск) и TheMealDB («Рецепты»).
Все доступны из РФ без ключей и VPN. Запросы кэшируются на диск (`.cache/`),
картинки отдаются через собственный прокси `/api/img` с дисковым кэшем.
Источник недоступен — его вклад просто пустее, а лента прозрачно падает на
локальные моки (`src/data/pins.ts`), пустых экранов не бывает.

## Страницы

- `/` — лента-масонри с инфинити-скроллом, фильтром по категориям
  (`/?category=…`) и вкладкой «Подписки» (`/?feed=subscriptions`)
- `/pin/[id]` — страница пина: описание, автор (ссылка на профиль), теги,
  похожие пины, лайк, скачивание, «поделиться», комментарии
- `/pin/new` — загрузка своей картинки: drag&drop, название, описание,
  категория, теги, сразу «в доску»
- `/search?q=…` — поиск по названию, описанию, тегам и категории
  (с `EMBED_API_KEY` — сначала смысловой поиск по векторам)
- `/boards`, `/board/[id]` — доски: создание (в том числе секретных),
  переименование, удаление, коллажи превью; чужая открытая доска — read-only
- `/profile/[id]` — свой профиль с редактированием имени и аватара, своими
  пинами и удалением аккаунта; чужой — публичная страница с подпиской

## Быстрый старт

```bash
npm install                                     # один раз
python -m uvicorn backend.app:app --port 8000   # бэкенд: аккаунты, доски, пины
npm run dev                                     # http://localhost:3000
```

Без бэкенда сайт работает анонимно: доски и лайки — в localStorage.

Переменные окружения — в `.env.example` (все необязательные): ключ Openverse
поднимает лимиты, `EMBED_API_KEY` включает смысловой поиск и умную ленту,
`NEXT_PUBLIC_SITE_URL` нужен для canonical/OG-ссылок, `PINLY_TRUST_PROXY` —
если бэкенд стоит за своим reverse-proxy.

## Аккаунты

Один бэкенд, без внешних сервисов: FastAPI (`backend/app.py`) хранит
пользователей, доски, пины, лайки, подписки и комментарии в SQLite
(`.data/accounts.db`), сессия — httpOnly-cookie с JWT (30 дней). Файлы
пользователей — в `.data/uploads`, имена генерирует сервер, тип определяется
по сигнатуре.

Фронтенд проксирует `/api/auth|boards|likes|pins|uploads|users|comments`
на бэкенд (rewrites в `next.config.ts`, URL настраивается
`ACCOUNTS_BACKEND_URL`), поэтому cookie ставится для домена сайта.

Регистрация фиксирует согласие на обработку персональных данных (152-ФЗ) в
`consent_log`; удаление аккаунта стирает доски, пины, файлы, лайки, подписки
и комментарии, оставляя только факт согласия. Пароли — PBKDF2-HMAC-SHA256.
Email наружу не отдаётся никогда: в публичных ответах только имя, которое
человек ввёл сам. Сброса пароля по почте нет — для него нужен SMTP-контур.

## Умная лента

Для вошедших первые ~80% страницы подбираются по вектору вкуса: сумма
векторов лайкнутых (вес 1) и сохранённых (вес 2) пинов из `.cache/vectors.json`,
ближайшие к ней пины, кроме уже отмеченных. Остальные ~20% — прежняя ротация
категорий. Подборка кэшируется на 10 минут, id лайков/сохранений отдаёт
`GET /api/taste/pins`. Без `EMBED_API_KEY` и индекса (`npm run index`) лента
остаётся обычной — деградация прозрачна для пользователя.

## Производительность (что уже решено и почему)

Замерялось Lighthouse-трейсом DevTools и повторяемым прогоном Playwright
(LCP/CLS по 4–5 заходам). Базовое состояние главной: LCP 867 мс, из них 510 мс
— render delay. Сейчас: LCP 288 мс, CLS 0.00 (десктоп, без троттлинга);
на CPU×4 прогретая страница — 200–500 мс.

Что держит эти цифры и неочевидно из кода:

- **Карточки ленты не прячутся до загрузки картинки.** Место резервируется
  `aspect-ratio` коробки, поэтому сетка не пересобирается пачкой. Прежний
  `display:none` + опрос каждые 150 мс давал reflow на ~55 мс и полсотни
  узлов и держал LCP на 500 мс дольше.
- **`connection()` вызывается в корне страницы, а не под `Suspense`.** Иначе
  отдаётся статическая оболочка, а лента догоняет отдельным запросом после
  гидрации — картинки стартуют на ~450 мс позже, чем могут.
- **Приоритет у первых 4 карточек** (`fetchPriority="high"` + eager).
  Больше — хуже: с 10 приоритетными картинками LCP вырос со 156 мс до 292,
  они вытесняют друг друга с одного канала. `column-fill: balance` в CSS-
  колонках означает, что порядок в DOM ≠ порядок на экране, поэтому запас
  здесь сознательный, а не точный.
- **Картинки идут через `next/image` в AVIF/WebP** (20 карточек первого
  экрана ≈ 144 КБ). Моки ленты — исключение: они грузятся с внешнего хоста
  напрямую (`unoptimized`), потому что оптимизатор не достучится до weserv.
- **Моноширинный веб-шрифт удалён** — класс не использовался ни в одном
  компоненте, а запрос и ~20 КБ были.
- `npm run warm` прогревает дисковый кэш источников: без него первый
  посетитель платит задержкой внешнего API, а не сайта.

## Счётчик событий (модель — реклама)

Выручка в модели рекламы = показы × CPM, поэтому продукту нужно знать не «заплатили
ли», а «сколько пришло, откуда и остались ли». События пишет
`POST /api/ev?name=…&board=…&pin=…&category=…&source=…` (`backend/events.py`),
отправка — из `src/lib/track.ts` (`sendBeacon`, с запасным `fetch keepalive`);
в dev-строгом режиме дубли гасятся на клиенте, иначе показы считались бы дважды.

Что мерится: `visit` (вход в ленту), `board_view` (открытие доски, с явной меткой
`?from=…` и хостом реферера), `board_created`, `pin_save`, `share_copy`,
`signup_open`. Ключевой вопрос модели — «мастер приводит людей»: он читается из
разбивки `board_view` по источникам.

Приватность: IP, email и произвольные строки клиента не сохраняются. Посетитель —
`sha256(секрет + IP + дата)`, то есть суточный счётчик уникальных, который нельзя
склеить в историю одного человека; из реферера остаётся только хост; идентификатор
пользователя пишется лишь для вошедших. Таргетинг planned по контексту (категория,
запрос, тема доски), а не по профилю — поэтому cookie-баннер не нужен.

Сводка — `GET /api/ev/summary?days=7` (агрегаты, ничего персонального). В проде её
видит только `PINLY_OWNER_EMAIL`; если в проде адрес не задан — эндпоинт отключён
(404). Локально, где `PINLY_ENV` не выставлен, сводка доступна любому вошедшему —
это нужно смоук-тесту, а не пользователям.

```bash
curl -s localhost:3000/api/ev/summary?days=7 -H "Cookie: pinly_session=…"
```

## Деплой фронтенда на Netlify

Репозиторий готов к импорту: `netlify.toml` уже настроен. В Netlify —
**Add new site → Import an existing project → GitHub** и выбрать этот репозиторий;
команда сборки (`npm run build`) и плагин Next.js подтянутся из `netlify.toml`
автоматически.

Нюансы:

- **Python-бэкенда на Netlify нет** — сайт работает в анонимном режиме
  (доски и лайки в localStorage), это штатный сценарий. Бэкенд поднимается
  отдельно (Docker/VPS) и подключается переменной `ACCOUNTS_BACKEND_URL`.
- После первого деплоя задайте в **Site settings → Environment variables**:
  `NEXT_PUBLIC_SITE_URL=https://<имя-сайта>.netlify.app` — для canonical и
  OG-ссылок — и сделайте **Clear cache and deploy site**.
- `/api/feed` и `/api/img` работают как Netlify Functions из коробки
  (их поднимает `@netlify/plugin-nextjs`).

## Проверки

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint
npm run test:api           # pytest: валидация, права, каскады, кэш (без сети)
npm run test:e2e           # Playwright: лента, регистрация, комментарий, поиск
npm run build              # продакшн-сборка
```

`test:e2e` поднимает dev-сервер сам, но предполагает запущенный бэкенд на
порту 8000 (в CI он стартует отдельным шагом). Для Playwright один раз нужен
`npx playwright install chromium`.

## Структура

```
src/
  data/pins.ts         — моки (fallback) + контракт типов Pin
  lib/feed.ts          — серверный слой ленты: Openverse → моки, векторный
                         поиск, персональная подборка
  lib/providers/       — openverse.ts (API), cache.ts (кэш + backoff),
                         proxy.ts (/api/img), embeddings.ts (ROUTERAI)
  lib/queries.ts       — поисковые запросы категорий
  lib/store.tsx        — доски и сохранения: аноним — localStorage,
                         вошедший — БД бэкенда
  lib/account.ts       — REST-клиент аккаунтов, пинов и соцблока
  lib/user.tsx         — сессия пользователя (свой бэкенд)
  lib/likes.tsx        — лайки: localStorage или /api/likes
  lib/vector-store.ts  — .cache/vectors.json: косинусный поиск по эмбеддингам
  lib/meta.ts, site.ts — заголовки/OG для серверных страниц
  backend/app.py       — лента/поиск/картинки + сборка приложения, /healthz
  backend/accounts.py  — регистрация, сессии, доски, лайки, taste (SQLite)
  backend/pins.py      — свои пины: загрузка, раздача файлов, правка
  backend/social.py    — подписки, комментарии, публичные профили и доски
  backend/images.py    — определение типа по сигнатуре
  backend/tests/       — pytest-контур (изолированная .data)
  components/          — Header, CategoryChips, MasonryGrid, PinCard,
                         SaveControls, InfiniteFeed, PinDetail, Comments,
                         ProfileView, BoardView, SubscriptionsFeed, Avatar,
                         Splash, Toast, Confirm, Icons
  app/                 — страницы (App Router), sitemap.ts, robots.ts
e2e/                   — Playwright-смоук
Dockerfile             — образ «Next + FastAPI» (порт 3000, том /app/.data)
```

## Продакшн

```bash
docker build -t pinly .
docker run -d -p 3000:3000 -v pinly-data:/app/.data \
  -e PINLY_JWT_SECRET="$(openssl rand -hex 32)" \
  -e PINLY_ENV=production \
  -e NEXT_PUBLIC_SITE_URL=https://pinly.example \
  -e PINLY_TRUST_PROXY=1 \
  pinly
```

Без Docker: `npm run build && npm start` рядом с
`uvicorn backend.app:app --port 8000` за nginx/Caddy (проксировать только
3000; `/api/*` уже проксируется внутри Next). Обязательно:
`PINLY_JWT_SECRET` (иначе секрет генерируется в `.data/secret.key` и при
неудачной записи сервер не стартует в проде), бэкап `.data` — там база и
файлы пользователей, `.cache` переживёт потерю.

Лимиты Openverse (анонимно: 20 зап/мин и 200/день) снимаются дисковым кэшем:
один и тот же запрос уходит в API раз в сутки; при недоступности источника
включается экспоненциальная пауза и fallback на моки. Атрибуция автора и
CC-лицензии показывается на странице пина — это требование лицензий.

## Иконки и лицензии

- Иконки интерфейса — инлайновые SVG в стиле [Lucide](https://lucide.dev) (ISC).
- Летучая мышь стартового экрана — [«bat» от Delapouite](https://game-icons.net/1x1/delapouite/bat.html),
  набор [game-icons.net](https://game-icons.net) (CC BY 3.0).
