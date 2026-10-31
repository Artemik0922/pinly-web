// POST /api/search/image — поиск по фотографии.
//
// Файл принимает multipart, тип определяется по сигнатуре байтов (заголовок
// запроса клиенту не верим), размер ограничен до чтения эмбеддинга. Ключ
// провайдера живёт в env сервера и наружу не отдаётся никогда.

import { NextRequest, NextResponse } from "next/server";
import { MAX_PHOTO_BYTES, searchByPhoto } from "@/lib/server/photo-search";

const MAX_LIMIT = 60;

// Тексты идут в интерфейс как есть, поэтому по-русски и без жаргона.
const TOO_LARGE_TEXT = `Фото больше ${MAX_PHOTO_BYTES / (1024 * 1024)} МБ.`;
const NO_FILE_TEXT = "Не удалось прочитать файл — попробуйте другой.";

// Каждый запрос — платный вызов провайдера эмбеддингов, поэтому частоту
// ограничиваем на всякий случай. Счётчик живёт в памяти процесса и не
// синхронизируется между воркерами: смысл лимита — «не спамь», а не квота
// (так же устроен backend/ratelimit.py).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

// Запросов без XFF-заголовка (прямое обращение, без reverse-proxy) все
// попадают в одну корзину «anon» — локально это только dev, а за прокси
// адрес приходит в XFF.
function bucket(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

function tooFrequent(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  // корзины не должны расти бесконечно
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now - (v[v.length - 1] ?? 0) >= WINDOW_MS) hits.delete(k);
  }
  return false;
}

export async function POST(req: NextRequest) {
  if (tooFrequent(bucket(req))) {
    return NextResponse.json(
      { error: "Слишком много запросов подряд — попробуйте через минуту." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: NO_FILE_TEXT }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: NO_FILE_TEXT }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: TOO_LARGE_TEXT }, { status: 413 });
  }

  const requested = Number(req.nextUrl.searchParams.get("limit") ?? 24);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 24, 1), MAX_LIMIT);

  const result = await searchByPhoto(new Uint8Array(await file.arrayBuffer()), limit);

  switch (result.status) {
    case "ok":
      return NextResponse.json({ pins: result.pins, indexed: result.indexed });
    case "no-key":
      return NextResponse.json(
        { error: "Поиск по фото не настроен: добавьте EMBED_API_KEY в web/.env.local." },
        { status: 503 },
      );
    case "empty-index":
      return NextResponse.json(
        {
          error:
            "Индекс пуст: прогрейте ленту (npm run warm), затем npm run index и npm run index -- --images.",
        },
        { status: 503 },
      );
    case "bad-image":
      return NextResponse.json(
        { error: "Это не читается как JPG, PNG или WebP." },
        { status: 400 },
      );
    case "too-large":
      return NextResponse.json({ error: TOO_LARGE_TEXT }, { status: 413 });
    case "upstream-failed": {
      // Клиенту — общая фраза, провайдеру — ничего: message может содержать
      // кусок ответа RouterAI. Диагностика остаётся в логах сервера.
      console.warn(`[search/image] ${result.message}`);
      return NextResponse.json({ error: "Провайдер эмбеддингов не ответил." }, { status: 502 });
    }
  }
}
