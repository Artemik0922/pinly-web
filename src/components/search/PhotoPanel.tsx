"use client";

// Приёмник картинки и результаты поиска по фото. Кнопка источника — в общей
// строке поиска на странице (SearchControls), здесь только полоса для
// перетаскивания и сетка найденного: всё действие в одном месте, а не на двух
// концах экрана.

import type { Pin } from "@/lib/pin";
import { MasonryGrid } from "@/components/ui/MasonryGrid";
import { IconCamera } from "@/components/ui/Icons";
import type { PhotoSearchState } from "@/components/search/usePhotoSearch";

export function PhotoResults({ pins }: { pins: Pin[] | null }) {
  if (!pins) return null;
  if (pins.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Похожего не нашлось — в индексе пока нет близких по картинке пинов.
      </p>
    );
  }
  return (
    <section className="mt-4">
      <h2 className="mb-2 text-base font-bold">Похожие пины · {pins.length}</h2>
      <MasonryGrid pins={pins} />
    </section>
  );
}

export function PhotoDropZone({ state }: { state: PhotoSearchState }) {
  const { preview, fileName, dragOver, setDragOver, busy, error, lastFile, run } = state;

  return (
    <>
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
        className={`mt-1.5 flex h-7 w-full items-center gap-2 rounded-lg border border-dashed px-2 text-xs transition-colors ${
          dragOver ? "border-accent bg-accent/5 text-foreground" : "border-border-soft text-muted"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- локальный blob-превью запроса
          <img src={preview} alt="Картинка запроса" className="h-5 w-5 shrink-0 rounded object-cover" />
        ) : (
          <IconCamera size={13} className="shrink-0" />
        )}
        <p className="min-w-0 flex-1 truncate">
          {fileName
            ? `Ищем похожее на «${fileName}»`
            : "Перетащите картинку сюда или вставьте через Ctrl+V"}
        </p>
        {busy && <span className="shrink-0">ищем…</span>}
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
    </>
  );
}
