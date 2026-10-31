"""Python-бэкенд Pinly: FastAPI-приложение за Next.js (rewrites в next.config.ts).

Слои (импорты направлены только вниз):

* инфраструктура — db, uploads, images, cache, embeddings;
* аккаунты и защита — accounts (пароли, JWT, сессия, лимиты), deps, schemas;
* домены — boards, likes, pins, media, social, chats, notifications, events,
  seo, feed, imgproxy, mealdb, erasure;
* HTTP — routers/*, они включают домены в server.create_app.

ASGI-объект живёт в app.py: там только create_app() из server.py.
"""
