"use client";

// Состояние поиска по фото вынесено из компонента: кнопка источника живёт в
// общей строке поиска на странице, а результаты — под ней, и обоим нужен один
// и тот же запуск запроса.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Pin } from "@/lib/pin";
import { PhotoSearchUnavailable, searchPinsByPhoto } from "@/lib/api/search";
import { ApiError } from "@/lib/api/http";

const MAX_PHOTO_MB = 5;
const ACCEPTED = /^image\/(jpeg|png|webp)$/;

export type PhotoError = { text: string; retryable: boolean };

const GENERIC: PhotoError = { text: "Поиск по фото не выполнился — сервер недоступен.", retryable: false };

// Тексты причин знает сервер (он различает «нет ключа» и «пустой индекс»).
function toError(err: unknown): PhotoError {
  if (err instanceof PhotoSearchUnavailable) return { text: err.message, retryable: err.retryable };
  if (err instanceof ApiError) {
    return { text: err.serverMessage ?? GENERIC.text, retryable: err.status >= 500 };
  }
  return GENERIC;
}

export function usePhotoSearch(enabled: boolean) {
  const [preview, setPreview] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PhotoError | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // последний файл — в состоянии: кнопка «попробовать ещё» видна в разметке
  const [lastFile, setLastFile] = useState<File | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const release = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };
  useEffect(() => release, []);

  const run = useCallback(async (file: File) => {
    if (!ACCEPTED.test(file.type)) {
      setError({ text: "Поддерживаются JPG, PNG и WebP.", retryable: false });
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError({ text: `Фото больше ${MAX_PHOTO_MB} МБ.`, retryable: false });
      return;
    }
    setLastFile(file);
    release();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreview(url);
    setFileName(file.name || "картинка из буфера");
    setError(null);
    setPins(null);
    setBusy(true);
    try {
      const result = await searchPinsByPhoto(file);
      setPins(result.pins);
    } catch (err) {
      setError(toError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // Вставка из буфера (Ctrl+V скриншота) — самый частый способ «показать
  // картинку». Слушатель нужен только в фото-режиме: на странице текстового
  // поиска он перехватывал бы вставку в поле.
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) void run(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enabled, run]);

  return {
    preview,
    pins,
    busy,
    error,
    fileName,
    dragOver,
    lastFile,
    setDragOver,
    setError,
    run,
  };
}

export type PhotoSearchState = ReturnType<typeof usePhotoSearch>;
