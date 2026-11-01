"use client";

// Выбор пина для отправки в чат: сетка своих пинов с локальным поиском
// по названию. Модалка собрана так же, как ConfirmDialog (scrim, Escape,
// клик по фону), но с содержимым-пикером.

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { pinImageSize, pinImageUrl, type Pin } from "@/lib/pin";
import { apiUserPins } from "@/lib/api/social";
import { useUser } from "@/lib/state/session";

export function PinPickerDialog({
  open,
  title,
  emptyText,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  emptyText: string;
  onPick: (pin: Pin) => void;
  onClose: () => void;
}) {
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useUser();

  // Все пути выхода гасят состояние через close(): следующий показ —
  // чистый лист без вчерашнего поиска и старого списка.
  const close = useCallback(() => {
    setPins(null);
    setQuery("");
    onClose();
  }, [onClose]);

  const pick = (pin: Pin) => {
    setPins(null);
    setQuery("");
    onPick(pin);
  };

  useEffect(() => {
    if (!open || !user) return;
    const controller = new AbortController();
    let cancelled = false;
    apiUserPins(user.id, controller.signal)
      .then((items) => {
        if (!cancelled) setPins(items);
      })
      .catch(() => {
        if (!cancelled) setPins([]);
      });
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, user, close]);

  if (!open || !user) return null;

  const q = query.trim().toLowerCase();
  const visible = (pins ?? []).filter(
    (p) => !q || p.title.toLowerCase().includes(q),
  );

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[var(--scrim)] px-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-pop flex max-h-[80dvh] w-full max-w-lg flex-col rounded-3xl bg-background p-5 shadow-overlay ring-1 ring-border-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{title}</h2>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию…"
          className="mt-3 rounded-2xl bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {pins === null && (
            <p className="py-10 text-center text-sm text-muted">Загрузка…</p>
          )}
          {pins !== null && visible.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">{emptyText}</p>
          )}
          {pins !== null && visible.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {visible.map((pin) => (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => pick(pin)}
                    className="group block w-full rounded-2xl p-1 text-left hover:bg-surface"
                  >
                    <span
                      className="block w-full overflow-hidden rounded-xl bg-surface"
                      style={{ aspectRatio: `${pinImageSize(pin)[0]} / ${pinImageSize(pin)[1]}` }}
                    >
                      <Image
                        src={pinImageUrl(pin)}
                        alt={pin.title}
                        width={pinImageSize(pin)[0]}
                        height={pinImageSize(pin)[1]}
                        sizes="160px"
                        unoptimized={pinImageUrl(pin).startsWith("http")}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="mt-1 line-clamp-1 block px-1 text-xs font-semibold">
                      {pin.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="mt-4 min-h-11 rounded-full px-5 text-sm font-semibold text-muted hover:bg-surface"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
