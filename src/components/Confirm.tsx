"use client";

// Подтверждение разрушающего действия. window.confirm тут не подошёл бы:
// его не оформить в тему, он не отдаёт фокус и не читается скринридером
// как диалог.

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Удалить",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[var(--scrim)] px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="animate-pop w-full max-w-sm rounded-3xl bg-background p-6 shadow-overlay ring-1 ring-border-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-bold">
          {title}
        </h2>
        <p id="confirm-body" className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-6 flex gap-2">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-full bg-danger px-4 text-sm font-semibold text-white transition-transform duration-150 ease-pop hover:brightness-110 active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-full px-5 text-sm font-semibold text-muted hover:bg-surface-hover hover:text-foreground active:scale-[0.98]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
