"use client";

// Картинка будущего пина: файл или ссылка на внешний хостинг, её превью и
// размеры. Картинка и размеры живут одним состоянием — превью, проверка и
// загрузка всегда относятся к одному источнику. Размеры читает браузер,
// поэтому на сервере не нужен Pillow.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/api/media";
import { probeDims } from "@/lib/image-dims";

export type PinImageDraft = {
  file?: File;
  sourceUrl?: string;
  url: string;
  width: number;
  height: number;
};

const ACCEPTED_TYPES = /^image\/(jpeg|png|webp)$/;

export function usePinImage(maxFileMb: number, setError: (message: string | null) => void) {
  const [image, setImage] = useState<PinImageDraft | null>(null);
  // blob-URL переживает несколько выборов файла: каждый новый освобождает
  // предыдущий, иначе память течёт до ухода со страницы
  const objectUrlRef = useRef<string | null>(null);

  const release = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  useEffect(() => release, [release]);

  const showPreview = useCallback((file: File) => {
    release();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    void probeDims(url).then(
      ({ width, height }) => setImage({ file, url, width, height }),
      () => {
        release();
        setImage(null);
        setError("Файл не читается как картинка.");
      },
    );
  }, [release, setError]);

  const pickFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (file.size > maxFileMb * 1024 * 1024) {
        setError(`Файл больше ${maxFileMb} МБ`);
        return;
      }
      if (!ACCEPTED_TYPES.test(file.type)) {
        setError("Поддерживаются JPG, PNG и WebP");
        return;
      }
      setError(null);
      showPreview(file);
    },
    [maxFileMb, setError, showPreview],
  );

  // картинка из медиатеки: внешний файл не пересылаем — пин публикуется
  // со ссылкой (показ идёт через наш прокси); локальный — качаем blob'ом
  const attachMedia = useCallback(
    async (item: MediaItem) => {
      const width = item.width || 800;
      const height = item.height || 1000;
      if (item.external) {
        setImage({ sourceUrl: item.url, url: item.url, width, height });
        return;
      }
      const blob = await fetch(item.url).then((r) => r.blob());
      const ext = item.url.split(".").pop() ?? "png";
      const file = new File([blob], `media.${ext}`, { type: blob.type || "image/png" });
      release();
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setImage({ file, url, width, height });
    },
    [release],
  );

  const reset = useCallback(() => {
    release();
    setImage(null);
  }, [release]);

  return { image, pickFile, attachMedia, reset };
}
