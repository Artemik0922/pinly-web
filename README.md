# Pinly — веб-аналог Pinterest

Фронтенд на Next.js: бесконечная лента-масонри, поиск, категории, страницы пинов и доски с сохранением (localStorage).

**Контент динамический:** лента и поиск подтягивают CC-изображения из [Openverse](https://api.openverse.org/v1/) (flickr, wikimedia и др.). Запросы кэшируются на диск (`.cache/`), картинки отдаются через собственный маршрут `/api/img` с дисковым кэшем. При недоступности API сайт прозрачный падает на локальные моки (`src/data/pins.ts`) — лента никогда не пустая.

## Запуск

```bash
npm install   # один раз
npm run dev   # http://localhost:3000
```

Сборка: `npm run build && npm start`.

## Что внутри

- `/` — лента-масонри с инфинити-скроллом и фильтром по категориям (`/?category=…`)
- `/pin/[id]` — страница пина: описание, автор, теги, похожие пины
- `/search?q=…` — поиск по названию, описанию, тегам и категории
- `/boards`, `/board/[id]` — доски: создание, удаление, коллажи превью

## Структура

```
src/
  data/pins.ts         — моки (fallback) + контракт типов Pin
  lib/feed.ts          — серверный слой ленты: Openverse → fallback на моки
  lib/providers/       — openverse.ts (API), cache.ts (кэш на диске),
                         proxy.ts (/api/img)
  lib/queries.ts       — поисковые запросы категорий
  lib/store.tsx        — доски и сохранения, персист в localStorage
  lib/api.ts           — клиентские помощники (/api/feed)
  app/api/feed/route.ts, app/api/img/route.ts
  components/          — Header, CategoryChips, MasonryGrid, PinCard,
                         SaveControls, InfiniteFeed, PinDetail, Icons
  app/                 — страницы (App Router)
```

Лимиты Openverse (анонимно: 20 зап/мин, 200/день) снимаются кэшем — один и тот же запрос бьёт в API один раз в сутки. Атрибуция автора и CC-лицензии показывается на странице пина (требование лицензий).
