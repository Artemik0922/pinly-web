"use client";

// Размеры картинки нужны до отправки: от них зависят пропорции карточки и
// параметры next/image. Оба варианта читают изображение браузером — здесь,
// а не на сервере, потому что исходник ещё не загружен.

export type Dims = { width: number; height: number };

/** Отклоняется, если картинку не прочитать (битый файл, не изображение). */
export function probeDims(src: string): Promise<Dims> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("image_unreadable"));
    img.src = src;
  });
}

/** Тот же замер для локального файла: blob-URL освобождается сразу. */
export async function dimsFromFile(file: File): Promise<Dims> {
  const url = URL.createObjectURL(file);
  try {
    return await probeDims(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
