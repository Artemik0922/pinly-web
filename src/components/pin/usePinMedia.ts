"use client";

// Носители будущего пина: слайды, которые потом можно перелистывать, и видео.
// Жизнью черновика (blob-URL, размеры, проверка файла, порядок) ведёт этот хук,
// а страница — только форма и публикация.
//
// Размеры читает браузер: на сервере не нужен ни Pillow, ни ffprobe для
// картинок. Для видео сервер всё равно переснимает длительность и постер сам,
// поэтому сюда они приезжают подсказкой, а не истиной.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/api/media";
import { probeDims } from "@/lib/image-dims";
import { MAX_SLIDES, MAX_UPLOAD_MB, MAX_VIDEO_MB } from "@/lib/upload-limits";

export type PinSlideDraft = {
  id: string;
  file?: File;
  sourceUrl?: string;
  url: string;
  kind: "image" | "video";
  width: number;
  height: number;
  durationMs: number;
};

const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;
const VIDEO_TYPES = /^video\/(mp4|webm|quicktime)$/;

// браузер сам скажет настоящие размеры и длительность: File о них не знает,
// а соврать про пропорцию — значит сломать сетку
async function probeMedia(url: string, kind: "image" | "video") {
  if (kind === "image") {
    const { width, height } = await probeDims(url);
    return { width, height, durationMs: 0 };
  }
  return await new Promise<{ width: number; height: number; durationMs: number }>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = (value: { width: number; height: number; durationMs: number }) => {
      video.src = "";
      resolve(value);
    };
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        // Infinity = поток без длительности: на сервере её посчитает ffprobe
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0,
      });
    video.onerror = () => {
      video.src = "";
      reject(new Error("video unreadable"));
    };
    video.src = url;
  });
}

export function usePinMedia(setError: (message: string | null) => void) {
  const [slides, setSlides] = useState<PinSlideDraft[]>([]);
  // blob-URL переживают несколько выборов файла: освобождать надо каждый,
  // иначе память течёт до ухода со страницы
  const urls = useRef(new Set<string>());

  const forget = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }, []);

  useEffect(() => {
    const held = urls.current;
    return () => {
      for (const url of held) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const picked = files.filter(Boolean);
      if (!picked.length) return;

      for (const file of picked) {
        const video = VIDEO_TYPES.test(file.type);
        const image = IMAGE_TYPES.test(file.type);
        if (!video && !image) {
          setError("Поддерживаются JPG, PNG, WebP и видео MP4, WebM");
          return;
        }
        const ceilingMb = video ? MAX_VIDEO_MB : MAX_UPLOAD_MB;
        if (file.size > ceilingMb * 1024 * 1024) {
          setError(`Файл больше ${ceilingMb} МБ`);
          return;
        }
      }

      setError(null);
      setSlides((prev) => {
        const next = [...prev];
        for (const file of picked) {
          if (next.length >= MAX_SLIDES) {
            setError(`Максимум ${MAX_SLIDES} слайдов в пине`);
            break;
          }
          const url = URL.createObjectURL(file);
          urls.current.add(url);
          const kind: "image" | "video" = VIDEO_TYPES.test(file.type) ? "video" : "image";
          const draft: PinSlideDraft = {
            id: `${file.name}-${file.size}-${next.length}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            url,
            kind,
            width: 0,
            height: 0,
            durationMs: 0,
          };
          next.push(draft);
          void probeMedia(url, kind).then(
            (probed) =>
              setSlides((current) =>
                current.map((item) => (item.id === draft.id ? { ...item, ...probed } : item)),
              ),
            () => {
              forget(url);
              setSlides((current) => current.filter((item) => item.id !== draft.id));
              setError(
                kind === "video"
                  ? "Файл не читается как видео."
                  : "Файл не читается как картинка.",
              );
            },
          );
        }
        return next;
      });
    },
    [forget, setError],
  );

  // картинка из медиатеки: внешний файл не пересылаем — пин публикуется
  // со ссылкой (показ идёт через наш прокси); локальный — качаем blob'ом
  const attachMedia = useCallback(async (item: MediaItem) => {
    const width = item.width || 800;
    const height = item.height || 1000;
    if (item.external) {
      setSlides([
        {
          id: `media-${item.id}`,
          sourceUrl: item.url,
          url: item.url,
          kind: "image",
          width,
          height,
          durationMs: 0,
        },
      ]);
      return;
    }
    const blob = await fetch(item.url).then((r) => r.blob());
    const ext = item.url.split(".").pop() ?? "png";
    const file = new File([blob], `media.${ext}`, { type: blob.type || "image/png" });
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    setSlides([
      { id: `media-${item.id}`, file, url, kind: "image", width, height, durationMs: 0 },
    ]);
  }, []);

  const removeAt = useCallback(
    (id: string) => {
      setSlides((prev) => {
        const target = prev.find((item) => item.id === id);
        if (target && urls.current.has(target.url)) forget(target.url);
        return prev.filter((item) => item.id !== id);
      });
    },
    [forget],
  );

  // порядок слайдов = порядок листания, поэтому его правят руками
  const move = useCallback((id: string, delta: number) => {
    setSlides((prev) => {
      const from = prev.findIndex((item) => item.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setSlides([]);
  }, []);

  return { slides, addFiles, attachMedia, removeAt, move, clear };
}
