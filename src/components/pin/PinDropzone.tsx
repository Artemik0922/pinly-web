"use client";

// Зона загрузки носителей: drag&drop + выбор через файловый диалог, можно
// несколько сразу — это слайды будущего пина. Компонент ничего не знает о
// загрузке на сервер: он показывает черновики и передаёт выбранные файлы.

import { useRef, useState } from "react";
import { formatMediaDuration } from "@/lib/pin";
import { slideCountLabel } from "@/lib/plural";
import { MAX_SLIDES, MAX_UPLOAD_MB, MAX_VIDEO_MB } from "@/lib/upload-limits";
import { IconChevronLeft, IconChevronRight, IconImage, IconPlay, IconTrash } from "@/components/ui/Icons";
import type { PinSlideDraft } from "@/components/pin/usePinMedia";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";

export function PinDropzone({
  slides,
  onPick,
  onRemove,
  onMove,
}: {
  slides: PinSlideDraft[];
  onPick: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null | undefined) => onPick(Array.from(list ?? []));

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        take(e.dataTransfer.files);
      }}
      className={`grid min-h-[280px] place-items-center rounded-3xl border-2 border-dashed p-4 transition-colors ${
        dragOver ? "border-accent bg-accent/5" : "border-border-soft"
      }`}
    >
      {slides.length ? (
        <div className="w-full">
          {/* Порядок = порядок листания. Первый слайд ещё и обложка: её видят
              доска, og:image и сетка, поэтому она подписана честно. */}
          <p className="mb-2 text-xs font-semibold text-muted">
            {slides.length > 1
              ? `${slideCountLabel(slides.length)} — листать свайпом или точками`
              : "один слайд перелистывать нечего, добавьте ещё"}
            {" · "}первый станет обложкой
          </p>
          <ul className="grid grid-cols-2 gap-3">
            {slides.map((slide, i) => (
              <li key={slide.id} className="relative overflow-hidden rounded-2xl bg-surface-card">
                {slide.kind === "video" ? (
                  // свое превью: видео из blob читается так же, как из сети
                  <video
                    src={slide.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="aspect-[4/3] w-full object-cover"
                    aria-hidden
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- локальный blob-превью
                  <img src={slide.url} alt={`Слайд ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                )}
                <p className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
                  {slide.kind === "video" ? (
                    <>
                      <IconPlay size={9} />
                      {slide.durationMs ? formatMediaDuration(slide.durationMs) : "видео"}
                    </>
                  ) : i === 0 ? (
                    "обложка"
                  ) : (
                    `слайд ${i + 1}`
                  )}
                </p>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-end">
                  <IconButton label="Переставить влево" onClick={() => onMove(slide.id, -1)} disabled={i === 0}>
                    <IconChevronLeft size={16} />
                  </IconButton>
                  <IconButton
                    label="Переставить вправо"
                    onClick={() => onMove(slide.id, 1)}
                    disabled={i === slides.length - 1}
                  >
                    <IconChevronRight size={16} />
                  </IconButton>
                  <IconButton label="Убрать слайд" onClick={() => onRemove(slide.id)} danger>
                    <IconTrash size={16} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
          {slides.length < MAX_SLIDES && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-3 w-full rounded-full border border-border-soft py-2.5 text-sm font-semibold text-muted hover:bg-surface-hover"
            >
              Добавить ещё слайды
            </button>
          )}
        </div>
      ) : (
        <div className="text-center text-muted">
          <IconImage size={40} className="mx-auto" />
          <p className="mt-3 text-sm font-semibold">Перетащите картинки или видео</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
          >
            Выбрать файлы
          </button>
          <p className="mt-2 text-xs text-muted">
            JPG, PNG, WebP до {MAX_UPLOAD_MB} МБ и видео MP4, WebM до {MAX_VIDEO_MB} МБ · до{" "}
            {MAX_SLIDES} слайдов
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          // тот же файл, выбранный второй раз, onchange не вызывает:
          // поле чистим сразу, чтобы «добавить ещё раз» работало
          e.target.value = "";
        }}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid h-11 w-11 place-items-center text-white transition-colors disabled:opacity-0 ${
        danger ? "hover:bg-danger" : "hover:bg-black/60"
      }`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-black/45">{children}</span>
    </button>
  );
}
