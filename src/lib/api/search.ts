// Клиент поиска по фото: карточка → /api/search/image.
// Файл уходит multipart без Content-Type — boundary добавляет браузер.

import type { Pin } from "@/lib/pin";
import { ApiError, requestMultipart } from "@/lib/api/http";

export type PhotoSearchResponse = { pins: Pin[]; indexed: number };

export class PhotoSearchUnavailable extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "PhotoSearchUnavailable";
  }
}

// Статусы, где причина известна только серверу (какой именно из 503 случился —
// ключа нет или индекс пуст — клиенту не видно). Тексты берём из ответа, а эти
// строки — страховка на случай, если поле error не приехало.
const UNAVAILABLE: Record<number, { text: string; retryable: boolean }> = {
  429: { text: "Слишком много запросов подряд — попробуйте через минуту.", retryable: true },
  502: { text: "Провайдер эмбеддингов не ответил — попробуйте ещё раз.", retryable: true },
  503: { text: "Поиск по фото не настроен: нет ключа провайдера или индекса пинов.", retryable: false },
};

export async function searchPinsByPhoto(file: File, signal?: AbortSignal): Promise<PhotoSearchResponse> {
  const form = new FormData();
  form.set("file", file);

  try {
    return await requestMultipart<PhotoSearchResponse>("/api/search/image", form, { signal });
  } catch (err) {
    if (err instanceof ApiError) {
      const known = UNAVAILABLE[err.status];
      // 4xx клиенту понятнее своими словами (фото не читается, слишком
      // большое) — они остаются обычным ApiError по статусу.
      if (known) throw new PhotoSearchUnavailable(err.serverMessage ?? known.text, known.retryable);
    }
    throw err;
  }
}
