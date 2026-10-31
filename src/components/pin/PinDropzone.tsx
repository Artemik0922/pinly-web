"use client";

// Зона загрузки картинки: drag&drop + выбор через файловый диалог.
// Компонент ничего не знает о загрузке — он только передаёт выбранный файл.

import { useRef, useState } from "react";
import { IconImage } from "@/components/ui/Icons";
import type { PinImageDraft } from "@/components/pin/usePinImage";

export function PinDropzone({
  maxFileMb,
  image,
  onPick,
}: {
  maxFileMb: number;
  image: PinImageDraft | null;
  onPick: (file: File | undefined | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        onPick(e.dataTransfer.files?.[0]);
      }}
      className={`grid min-h-[280px] place-items-center rounded-3xl border-2 border-dashed p-4 transition-colors ${
        dragOver ? "border-accent bg-accent/5" : "border-border-soft"
      }`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- локальный blob-превью
        <img src={image.url} alt="Превью" className="max-h-[420px] rounded-2xl object-contain" />
      ) : (
        <div className="text-center text-muted">
          <IconImage size={40} className="mx-auto" />
          <p className="mt-3 text-sm font-semibold">Перетащите картинку сюда</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
          >
            Выбрать файл
          </button>
          <p className="mt-2 text-xs text-muted">JPG, PNG или WebP, до {maxFileMb} МБ</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </div>
  );
}
