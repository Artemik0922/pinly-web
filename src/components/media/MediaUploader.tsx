"use client";

// Панель добавления: ссылка, «файлом к себе» и «на ImgBB». Цель выбора
// помнит состояние страницы: один и тот же диалог файлов должен вести туда,
// куда смотрит кнопка, а не туда, что нажимали в прошлый раз.

import { useRef } from "react";
import type { UploadTarget } from "@/components/media/useMediaLibrary";

const BUTTON =
  "shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const ACTIVE = "bg-surface ring-2 ring-accent/40";
const IDLE = "bg-surface hover:bg-surface-hover";

export function MediaUploader({
  url,
  onUrlChange,
  busy,
  error,
  imgbbEnabled,
  target,
  onTarget,
  onUploadUrl,
  onUploadFiles,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  imgbbEnabled: boolean;
  target: UploadTarget;
  onTarget: (target: UploadTarget) => void;
  onUploadUrl: () => void;
  onUploadFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFiles = (next: UploadTarget) => {
    onTarget(next);
    inputRef.current?.click();
  };

  return (
    <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onUploadUrl()}
          placeholder="Ссылка на картинку (https://…)"
          className="min-w-0 flex-1 rounded-full bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={onUploadUrl}
          disabled={busy || !url.trim()}
          className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          По ссылке
        </button>
        <button
          type="button"
          onClick={() => pickFiles("local")}
          disabled={busy}
          className={`${BUTTON} ${target === "local" ? ACTIVE : IDLE}`}
        >
          Файлом к себе
        </button>
        <button
          type="button"
          onClick={() => pickFiles("imgbb")}
          disabled={busy}
          title={
            imgbbEnabled
              ? "Файл уйдёт на бесплатный хостинг ImgBB, у нас останется ссылка"
              : "Нужен бесплатный ключ IMGBB_API_KEY в web/.env.local"
          }
          className={`${BUTTON} ${target === "imgbb" ? ACTIVE : IDLE}`}
        >
          На ImgBB
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            onUploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
