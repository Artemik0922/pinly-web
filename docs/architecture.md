# Архитектура

## Один origin на два процесса

```
браузер
   │  один origin: http://хост:3000
   ▼
Next.js 16 (App Router, RSC, cacheComponents)
   ├── /api/feed, /api/img …… свои провайдеры в Node (Openverse, музеи, Commons)
   │                          + дисковый кэш .cache/
   └── rewrites /api/auth|boards|pins|uploads|users|comments|ev|notifications
        ▼
      FastAPI (backend/server.py) ── SQLite (.data/accounts.db, WAL)
                              └── файлы пользователей (.data/uploads)
```

Прокси один и тот же на всех этапах: `/api/*` уходят на тот же домен, поэтому
cookie-сессия ставится для сайта и CORS не нужен ни в браузере, ни в тестах.
Адрес бэкенда настраивается `ACCOUNTS_BACKEND_URL`.

## Слои

| Слой | Файлы |
| --- | --- |
| Страницы (App Router) | [`src/app/`](../src/app) |
| Компоненты — по доменам | [`ui/`](../src/components/ui), [`layout/`](../src/components/layout), [`feed/`](../src/components/feed), [`pin/`](../src/components/pin), [`board/`](../src/components/board), [`chat/`](../src/components/chat), [`profile/`](../src/components/profile) |
| REST-клиент: по одному модулю на домен бэкенда | [`src/lib/api/`](../src/lib/api) |
| Серверный слой ленты и провайдеры (node-only) | [`src/lib/server/`](../src/lib/server) |
| Клиентские состояния: сессия, доски, лайки | [`src/lib/state/`](../src/lib/state) |
| Модель пина (общий контракт для моков, источников и загрузок) | [`src/lib/pin.ts`](../src/lib/pin.ts) |
| Бэкенд: сервисы доменов + HTTP-роутеры | [`backend/`](../backend), [`backend/routers/`](../backend/routers) |
| Тесты | [`backend/tests/`](../backend/tests), [`e2e/pinly.spec.ts`](../e2e/pinly.spec.ts) |

Правило простое: HTTP-слой ничего не решает, сервисы домена не знают про
HTTP, а схема и миграции живут в одном месте (`backend/db.py`).

## Дерево проекта

```
src/
  app/                 — страницы, sitemap.ts, robots.ts
  data/mock-pins.ts    — моки (fallback) для ленты без внешнего API
  lib/
    pin.ts             — тип Pin, носители, размеры и URL картинки; клиент-безопасный
    api/               — REST-клиент: http.ts (транспорт) + auth, boards,
                         likes, pins, social, media, notifications, chats, feed
    state/             — клиентские провайдеры: session.tsx (useUser),
                         boards.tsx (useBoards), likes.tsx (useLikes),
                         board-storage.ts (локальный режим и миграция в БД)
    server/            — только Node: feed.ts (лента, векторный вкус, похожие),
                         backend.ts (запросы к Python-бэкенду), meta.ts, seo.ts,
                         img-proxy.ts (правила /api/img), vector-store.ts,
                         queries.ts, providers/ (openverse, extras, cache,
                         embeddings)
    storage.ts         — localStorage без исключений в приватном режиме
    share.ts           — нативный sheet и копирование ссылки с запасным путём
    image-dims.ts      — размеры картинки до загрузки
    categories.ts      — slug'и и тексты посадочных страниц категорий
    plural.ts, time.ts — русские счётчики и «5 минут назад»
    upload-limits.ts   — потолки файла и числа слайдов, те же, что на сервере
    site.ts, track.ts  — базовый адрес сайта; счётчик событий
  components/
    ui/                — Avatar, MasonryGrid, MediaCarousel, SlideImage, Toast,
                         Confirm, Field, Icons, SkeletonGrid, ThemeToggle,
                         LogoMark, CategoryChips
    layout/            — Header, Splash
    feed/              — HomeFeed, InfiniteFeed, PinCard, SubscriptionsFeed
    pin/               — PinDetail, PinActions, OwnerControls, Comments,
                         SaveControls, PinDropzone, usePinMedia
    board/             — BoardView, BoardStats, PublicBoardCard, BoardContact
    chat/              — ChatView, useChatThread, MessageList, MessageRow,
                         ChatHeader, Composer, PinAttachment, SendPinDialog,
                         PinPickerDialog
    profile/           — ProfileView, PublicProfile, ProfileEditor
    report/            — ReportButton
backend/
  app.py               — точка входа ASGI: `uvicorn backend.app:app` и `app:app`
  server.py            — сборка приложения: логи, CORS, request-id, порядок маршрутов
  db.py                — одна схема SQLite, упорядоченные миграции, соединение на запрос
  deps.py              — Depends: current_user (401), optional_user, session_payload
  schemas.py           — pydantic-модели всех принимаемых тел (падеж клиента — контракт)
  erasure.py           — единственное место, где каскад стирает строки всех доменов
  session.py           — секрет подписи, JWT HS256 и httpOnly-кука сессии
  ratelimit.py         — счётчик «action:ip» для входа, записи и событий
  accounts.py          — пароли (PBKDF2), таблица users, журнал согласий
  pins.py slides.py video.py uploads.py media.py boards.py likes.py
  chats.py social.py notifications.py events.py seo.py mealdb.py feed.py
  imgproxy.py images.py cache.py embeddings.py mock-pins.json
                       — сервисы доменов: запросы к БД и правила, без HTTP
  routers/             — HTTP-слой: auth, boards, likes, pins, media, social,
                         chats, notifications, events, seo, mealdb, feed, img
  tests/               — pytest-контур (изолированная .data)
e2e/                   — Playwright-смоук, fixtures/clip.mp4 — роликом для
                         загрузки его делает ffmpeg
scripts/               — warm (прогрев кэша), index (эмбеддинги пинов),
                         probe-embeddings, seo-report, ui-audit, make-logo, make-hero
Dockerfile             — образ «Next + FastAPI» (порт 3000, том /app/.data, ffmpeg)
docker/entrypoint.sh   — два процесса в одном контейнере
```

## Носители пина: слайды и видео

`pins` держит **обложку** (`file`, `width`, `height`), а сами носители лежат в
`pin_slides` — отдельной таблице, а не JSON в строке пина. Причина: порядок
важен и правится точечно, а файлы нужно уметь перечислить **до** удаления
строки, иначе каскад унесёт запись и стирать будет уже нечего.

| Поле | Зачем |
| --- | --- |
| `position` | порядок листания; `unique (pin_id, position)` |
| `kind` | `image` \| `video` — ставится по сигнатуре байтов, а не по имени файла |
| `file` | имя в `.data/uploads`, генерирует сервер |
| `width`, `height` | размеры; для видео — с учётом поворота из Display Matrix |
| `duration_ms` | из `ffprobe`, 0 если не прочиталось |
| `poster` | jpg-кадр из `ffmpeg`; он же обложка пина |

Три следствия этой модели:

1. **Обложка остаётся картинкой.** `og:image`, превью доски, masonry и чужие
   мессендеры продолжают работать с тем, что умеют, и не знают про видео.
2. **Снапшот доски несёт носители с собой.** `board_pins.pin_data` хранит
   карточку целиком, поэтому вложенные `url` и `posterUrl` проверяются на схему
   так же, как обложка: иначе снапшот принёс бы `javascript:` на чужую витрину.
3. **Без ffmpeg загрузка не падает.** Пин приезжает без постера, а карточка
   держит кадр сама через `<video preload="metadata">`.

Раздача файлов умеет `Range` (это обязанность Starlette `FileResponse`): без
диапазонов Safari не играет ролик, а Chrome перекачивает файл на каждый шаг
ползунка.

## Почему публичные читалки не лимитированы

`GET /api/boards/{id}/public`, `GET /api/users/{id}/pins` и профили в карте сайта
потолка частоты не имеют. Это решение, а не дыра:

- их главный читатель — поисковый краулер, а не человек;
- Node ходит в бэкенд с **одного** адреса, поэтому потолок по IP ударил бы и по
  обходу, и по всем посетителям сразу;
- интерфейс сегодня не умеет отличать 429 от «не найдено» и показал бы человеку
  пустую витрину вместо объяснения.

Прежде чем лимитить чтение, нужно: проксировать адрес посетителя из Node
(`X-Forwarded-For` + `PINLY_TRUST_PROXY`), добавить честное состояние «вы
слишком часто просите» и научить его рисоваться. Пишется в коде, чтобы не
забыть.

## Контракт API

Пути, методы, поля ответов и коды статусов заморожены тестами
([`backend/tests/test_contract.py`](../backend/tests/test_contract.py)).
Новое поле — аддитивная правка (так появились `slides` и `slide_view`),
переименование или смена статуса — повод для отдельного разговора.

## Дальше: нативное приложение

План переноса сайта в нативное приложение и список блокеров —
[`migration-progress.md`](../migration-progress.md). Бэкенд при этом не
переезжает: приложение становится обычным HTTP-клиентом.
