"use client";

import type { RefObject } from "react";
import { dayKey, MessageRow } from "@/components/chat/MessageRow";
import type { Display } from "@/components/chat/useChatThread";

export function MessageList({
  messages,
  hasMore,
  loadingMore,
  userId,
  bottomRef,
  onLoadOlder,
}: {
  messages: Display[] | null;
  hasMore: boolean;
  loadingMore: boolean;
  userId: string;
  bottomRef: RefObject<HTMLDivElement | null>;
  onLoadOlder: () => void;
}) {
  let lastDay = -1;

  return (
    <div className="flex flex-1 flex-col gap-2">
      {messages === null && (
        <p className="py-10 text-center text-sm text-muted">Загрузка…</p>
      )}
      {messages !== null && hasMore && (
        <button
          type="button"
          onClick={onLoadOlder}
          disabled={loadingMore}
          className="mx-auto rounded-full bg-surface px-4 py-1.5 text-xs font-semibold text-muted hover:bg-surface-card"
        >
          {loadingMore ? "Загружаем…" : "Загрузить ещё"}
        </button>
      )}
      {messages !== null && messages.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          Пока пусто. Напишите первое сообщение или отправьте пин.
        </p>
      )}
      {messages?.map((m) => {
        const key = dayKey(m.createdAt);
        const showDay = key !== lastDay;
        lastDay = key;
        return (
          <MessageRow
            key={m.id}
            message={m}
            mine={m.senderId === userId}
            showDay={showDay}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
