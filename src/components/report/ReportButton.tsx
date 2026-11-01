"use client";

// Сигнал о злоупотреблениях. Загрузки пользователей попадают в общую ленту, а
// кнопки «пожаловаться» не было вовсе. Очередь модерации — не этот раунд: одно
// событие report (пин/доска + причина), которое владелец читает в сводке.

import { useEffect, useState } from "react";
import { track } from "@/lib/track";

const REASONS = [
  { value: "spam", label: "Спам или реклама" },
  { value: "copyright", label: "Нарушает авторские права" },
  { value: "offensive", label: "Неуместный контент" },
];

export function ReportButton({ pin, board }: { pin?: string; board?: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (done) {
    // «Спасибо за обращение» было бы обещанием разобраться, которого у сервиса
    // нет: честно говорим, что именно произошло и кто это увидит.
    return (
      <p role="status" className="text-xs text-muted">
        Отмечено: {done.toLowerCase()}. Разберётся администрация сервиса.
      </p>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-h-11 rounded-full px-3 text-xs text-muted hover:text-danger"
      >
        Пожаловаться
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть меню жалобы"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="animate-pop absolute right-0 top-10 z-50 w-64 rounded-2xl bg-background p-2 shadow-overlay ring-1 ring-border-soft"
          >
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Что с этим не так?
            </p>
            {REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  track.report({ pin, board }, reason.value);
                  setDone(reason.label);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center rounded-xl px-2 text-left text-sm hover:bg-surface-hover"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
