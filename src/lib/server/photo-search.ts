// Поиск по фото: картинка запроса → эмбеддинг voyage-multimodal-3.5 →
// ближайшие пины в том же пространстве. Работает и против индекса,
// построенного по тексту пинов, — модель общая для текста и изображений.

import type { Pin } from "@/lib/pin";
import { embedImage, embeddingsEnabled, imageBytesToDataUrl } from "@/lib/server/providers/embeddings";
import { loadStore, searchVectors } from "@/lib/server/vector-store";
import { sniffImageType } from "@/lib/server/img-proxy";

// Разумный потолок для фотографии с телефона: больше — уже не «найти похожее»,
// а загрузка альбома.
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoSearchOutcome =
  | { status: "ok"; pins: Pin[]; indexed: number }
  | { status: "no-key" }
  | { status: "empty-index" }
  | { status: "bad-image" }
  | { status: "too-large" }
  | { status: "upstream-failed"; message: string };

/** Тип по сигнатуре байтов, а не по заголовку запроса: браузер шлёт что угодно. */
function detectMime(bytes: Uint8Array): string | null {
  return sniffImageType(bytes);
}

export async function searchByPhoto(bytes: Uint8Array, limit = 24): Promise<PhotoSearchOutcome> {
  // Сначала сам файл: «это не картинка» — ошибка клиента при любой
  // конфигурации сервера. Иначе без ключа любой мусор давал бы 503, и
  // человек никогда не узнал бы, что дело в файле.
  if (bytes.length === 0) return { status: "bad-image" };
  if (bytes.length > MAX_PHOTO_BYTES) return { status: "too-large" };

  const mime = detectMime(bytes);
  if (!mime) return { status: "bad-image" };

  if (!embeddingsEnabled()) return { status: "no-key" };

  const store = await loadStore();
  if (store.items.length === 0) return { status: "empty-index" };

  let vector: number[] | null;
  try {
    vector = await embedImage(imageBytesToDataUrl(bytes, mime));
  } catch (err) {
    return { status: "upstream-failed", message: String(err).slice(0, 200) };
  }
  if (!vector) return { status: "no-key" };

  const hits = await searchVectors(vector, limit);
  // Порог близости: без него «похожие» выдают мусор с хвоста распределения,
  // когда в индексе нет ничего годного.
  const MIN_SCORE = 0.2;
  return {
    status: "ok",
    pins: hits.filter((h) => h.score >= MIN_SCORE).map((h) => h.pin),
    // Пинов, а не векторов: один пин лежит в индексе и текстом, и картинкой.
    indexed: new Set(store.items.map((it) => it.pin.id)).size,
  };
}
