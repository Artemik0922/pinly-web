"use client";

// Поиск по фото: перетащить, выбрать или вставить картинку → похожие пины.
// Файл не живёт в адресной строке, поэтому результат не URL-ный: ссылка
// /search?by=image открывает этот режим, а дальше всё локально.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Pin } from "@/lib/pin";
import { ApiError } from "@/lib/api/http";
import { PhotoSearchUnavailable, searchPinsByPhoto } from "@/lib/api/search";
import { MasonryGrid } from "@/components/ui/MasonryGrid";
import { IconCamera } from "@/components/ui/Icons";

const MAX_PHOTO_MB = 5;
const ACCEPTED = /^image\/(jpeg|png|webp)$/;

const GENERIC = "Поиск по фото не выполнился — сервер недоступен.";

// Тексты причин знает сервер (он различает «нет ключа» и «пустой индекс»),
// клиент добавляет только то, что видно до запроса.
function messageOf(err: unknown): { text: string; retryable: boolean } {
  if (err instanceof PhotoSearchUnavailable) return { text: err.message, retryable: err.retryable };
  if (err instanceof ApiError) {
    return { text: err.serverMessage ?? GENERIC, retryable: err.status >= 500 };
  }
  return { text: GENERIC, retryable: false };
}

export function PhotoSearch() {
  const [preview, setPreview] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retryable: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  // последний файл — в состоянии: кнопка «попробовать ещё» появляется в разметке
  const [lastFile, setLastFile] = useState<File | null>(null);

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
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // Вставка из буфера (Ctrl+V скриншота) — самый частый способ «показать картинку»
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) void run(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [run]);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4">
      {/* Одна строка вместо карточки с квадратом 96×96: зона поиска не должна
          съедать экран — под ней результаты. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void run(file);
        }}
        className={`mt-2 flex items-center gap-3 rounded-2xl border-2 border-dashed p-2 transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-border-soft"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- локальный blob-превью запроса
          <img
            src={preview}
            alt="Картинка запроса"
            className="h-10 w-10 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-muted">
            <IconCamera size={18} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {fileName ? `Ищем похожее на «${fileName}»` : "Покажите картинку"}
          </p>
          {/* на мобильном подсказка важнее, чем экономия строки: без неё Ctrl+V
              не найдётся. На sm+ — одна строка. */}
          <p className="line-clamp-2 text-xs text-muted sm:line-clamp-1 sm:truncate">
            Перетащите файл, вставьте скриншот (Ctrl+V) или выберите его — пины
            сравниваются по смыслу картинки, а не по названию.
          </p>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="min-h-11 shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 sm:min-h-0"
        >
          Выбрать файл
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void run(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 flex flex-wrap items-center gap-3 text-sm text-danger">
          <span>{error.text}</span>
          {error.retryable && lastFile && (
            <button
              type="button"
              onClick={() => void run(lastFile)}
              className="rounded-full border border-danger/40 px-3 py-1 font-semibold hover:bg-danger/5"
            >
              Попробовать ещё
            </button>
          )}
        </p>
      )}
      {busy && <p className="mt-2 py-3 text-center text-sm text-muted">Ищем похожее…</p>}

      {!busy && pins && pins.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-base font-bold">Похожие пины · {pins.length}</h2>
          <MasonryGrid pins={pins} />
        </section>
      )}

      {!busy && pins && pins.length === 0 && (
        <p className="mt-2 py-8 text-center text-sm text-muted">
          Похожего не нашлось — в индексе пока нет близких по картинке пинов.
        </p>
      )}
    </div>
  );
}
