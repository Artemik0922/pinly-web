"use client";

// Меню источника картинки для поиска по фото: телефон даёт «Камера» +
// «Галерея» (системный захват и файловый picker), компьютер — «Веб-камера»
// (снимок с getUserMedia), «Файл с компьютера» и «Из буфера».
//
// Развилка телефон/ПК — по ширине для подписей (CSS, без гидрации в двух
// состояниях) и по pointer: coarse в момент нажатия для поведения: «Камера»
// на телефоне обязана открыть именно приложение камеры, а не галерею.

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCamera, IconChevronDown, IconFolder, IconImage } from "@/components/ui/Icons";

type Props = {
  onFile: (file: File) => void;
  onError: (error: { text: string; retryable: boolean }) => void;
  /** Меню разворачивают сразу при входе в режим: человек уже сказал «по фото». */
  autoOpen?: boolean;
  onCloseAutoOpen?: () => void;
};

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface";

const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

const ext = (mime: string) => (mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg");

export function PhotoSourceMenu({ onFile, onError, autoOpen, onCloseAutoOpen }: Props) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [webcam, setWebcam] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    onCloseAutoOpen?.();
  }, [onCloseAutoOpen]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Поток камеры живёт ровно столько, сколько открыт слой: лампа веб-камеры
  // не должна гореть после «Отмена».
  useEffect(() => {
    if (!webcam) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err: DOMException) => {
        setCameraError(
          err.name === "NotAllowedError"
            ? "Доступ к камере запрещён — разрешите его в настройках сайта или выберите файл."
            : err.name === "NotFoundError"
              ? "Камера не найдена — выберите файл."
              : "Камера не открылась — выберите файл.",
        );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [webcam]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) {
      setCameraError("Камера ещё не передала кадр — подождите секунду.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Не удалось получить кадр — выберите файл.");
          return;
        }
        setWebcam(false);
        onFile(new File([blob], "камера.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  const pickCamera = () => {
    close();
    // На телефоне capture="environment" открывает приложение камеры; на ПК
    // атрибут игнорируется, поэтому там своё окно с getUserMedia.
    if (isTouch()) {
      captureRef.current?.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError({ text: "Браузер не умеет обращаться к камере — выберите файл.", retryable: false });
      return;
    }
    setCameraError(null);
    setWebcam(true);
  };

  const fromClipboard = async () => {
    close();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const mime = item.types.find((t) => t.startsWith("image/"));
        if (!mime) continue;
        const blob = await item.getType(mime);
        onFile(new File([blob], `буфер.${ext(mime)}`, { type: mime }));
        return;
      }
      onError({ text: "В буфере обмена нет картинки — скопируйте её или вставьте через Ctrl+V.", retryable: false });
    } catch {
      onError({ text: "Браузер не отдал буфер обмена — вставьте картинку через Ctrl+V.", retryable: false });
    }
  };

  const clip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    close();
    if (file) onFile(file);
    e.target.value = "";
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 sm:min-h-0 sm:py-2"
      >
        <IconCamera size={16} />
        {/* на узком экране подпись длиннее, чем весь текст зоны — там короткое «Фото» */}
        <span className="sm:hidden">Фото</span>
        <span className="hidden sm:inline">Добавить фото</span>
        <IconChevronDown size={11} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 top-full z-50 mt-1 w-60 rounded-2xl bg-background p-1.5 shadow-overlay ring-1 ring-border-soft"
        >
          <button type="button" role="menuitem" onClick={pickCamera} className={MENU_ITEM}>
            <IconCamera size={16} className="shrink-0 text-muted" />
            Камера
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              galleryRef.current?.click();
            }}
            className={MENU_ITEM}
          >
            <IconFolder size={16} className="shrink-0 text-muted" />
            <span className="sm:hidden">Галерея</span>
            <span className="hidden sm:inline">Файл с компьютера</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={fromClipboard}
            className={`${MENU_ITEM} hidden sm:flex`}
          >
            <IconImage size={16} className="shrink-0 text-muted" />
            Из буфера обмена
          </button>
          <p className="px-3 pb-1 pt-2 text-xs text-muted">
            Или перетащите картинку сюда и вставьте через Ctrl+V.
          </p>
        </div>
      )}

      {webcam && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Съёмка с веб-камеры"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setWebcam(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl bg-background shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            {!cameraError && (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-[4/3] w-full bg-black object-cover"
              />
            )}
            {cameraError && (
              <p role="alert" className="px-4 py-3 text-sm text-danger">
                {cameraError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 p-3">
              <button
                type="button"
                onClick={() => setWebcam(false)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={shoot}
                disabled={Boolean(cameraError)}
                className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
              >
                Снять
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={clip}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={clip}
      />
    </div>
  );
}
