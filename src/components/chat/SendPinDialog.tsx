"use client";

// Отправка пина в существующий чат: список недавних переписок, клик —
// отправили. Новые чаты заводятся из профиля («Написать»), поэтому здесь
// только выбор адресата. Скелет модалки — как в PinPickerDialog.

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import type { Pin } from "@/lib/pin";
import { apiChats, apiSendChatMessage, type ApiChat } from "@/lib/api/chats";
import { timeAgo } from "@/lib/time";

export function SendPinDialog({
  open,
  pin,
  onClose,
}: {
  open: boolean;
  pin: Pin;
  onClose: () => void;
}) {
  const [chats, setChats] = useState<ApiChat[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { show } = useToast();

  // Выход — всегда через close(): список обнуляется, следующий показ — чистый.
  const close = () => {
    setChats(null);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let cancelled = false;
    apiChats()
      .then((items) => {
        if (!cancelled) setChats(items);
      })
      .catch(() => {
        if (!cancelled) setChats([]);
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busyId === null) close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close и busyId в keydown не нужны как триггер
  }, [open]);

  if (!open) return null;

  const send = async (chat: ApiChat) => {
    if (busyId) return;
    setBusyId(chat.id);
    try {
      await apiSendChatMessage(chat.id, { kind: "pin", pinId: pin.id, pinData: pin });
      show(`Пин отправлен: ${chat.member.displayName}`);
      close();
    } catch {
      show("Не удалось отправить пин.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[var(--scrim)] px-4"
      onClick={busyId === null ? close : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Отправить пин в чат"
        className="animate-pop flex max-h-[70dvh] w-full max-w-sm flex-col rounded-3xl bg-background p-5 shadow-overlay ring-1 ring-border-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Отправить пин</h2>
        <p className="mt-1 line-clamp-1 text-sm text-muted">{pin.title}</p>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {chats === null && (
            <p className="py-10 text-center text-sm text-muted">Загрузка…</p>
          )}
          {chats !== null && chats.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Чатов пока нет. Откройте профиль пользователя и нажмите «Написать».
            </p>
          )}
          {chats !== null && chats.length > 0 && (
            <ul className="flex flex-col gap-1">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => send(chat)}
                    disabled={busyId !== null}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface disabled:opacity-50"
                  >
                    <Avatar
                      name={chat.member.displayName}
                      url={chat.member.avatarUrl}
                      size={40}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {chat.member.displayName}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {busyId === chat.id ? "Отправляем…" : timeAgo(chat.updatedAt)}
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
          disabled={busyId !== null}
          className="mt-4 min-h-11 rounded-full px-5 text-sm font-semibold text-muted hover:bg-surface disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
