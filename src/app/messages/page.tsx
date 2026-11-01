"use client";

// Список личных чатов: собеседник, превью последнего сообщения и счётчик
// непрочитанных. Обновление — опросом раз в 15 секунд, гейт как в
// /notifications (готовность сессии → панель входа).

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { SignInGate } from "@/components/ui/SignInGate";
import { IconMessage, IconPin } from "@/components/ui/Icons";
import { apiChats, type ApiChat } from "@/lib/api/chats";
import { useUser } from "@/lib/state/session";
import { timeAgo } from "@/lib/time";

// Превью последнего сообщения: пин показываем подписью «Пин: название».
function preview(chat: ApiChat): string {
  const last = chat.lastMessage;
  if (!last) return "Нет сообщений";
  const prefix = last.senderId === chat.member.id ? "" : "Вы: ";
  if (last.kind === "pin") {
    return `${prefix}Пин: ${last.pinTitle?.trim() || "карточка"}`;
  }
  return prefix + (last.text ?? "");
}

function ChatRow({ chat }: { chat: ApiChat }) {
  const unread = chat.unread > 0;
  return (
    <li>
      <Link
        href={`/messages/${chat.id}`}
        className="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-3 hover:bg-surface"
      >
        <Avatar name={chat.member.displayName} url={chat.member.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm ${unread ? "font-bold" : "font-semibold"}`}>
            {chat.member.displayName}
          </p>
          <p className={`flex items-center gap-2 truncate text-sm ${unread ? "text-foreground" : "text-muted"}`}>
            {chat.lastMessage?.kind === "pin" && <IconPin size={14} className="shrink-0" />}
            {preview(chat)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-muted">{timeAgo(chat.updatedAt)}</span>
          {unread && (
            <span
              aria-label="непрочитано"
              className="grid min-w-5 place-items-center rounded-full bg-accent-fill px-1 text-[11px] font-bold leading-5 text-accent-on"
            >
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

export default function MessagesPage() {
  const { user, ready, enabled } = useUser();
  const [chats, setChats] = useState<ApiChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !enabled || !user) return;
    let alive = true;
    const controller = new AbortController();
    const load = () => {
      apiChats()
        .then((items) => {
          if (alive) {
            setChats(items);
            setError(null);
          }
        })
        .catch(() => {
          if (alive) setError("Не удалось загрузить чаты");
        });
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [ready, enabled, user]);

  if (!ready || !enabled) return null;

  if (!user) return <SignInGate title="Сообщения" hint="Войдите в аккаунт, чтобы переписываться и отправлять пины." />;

  return (
    <main className="mx-auto w-full max-w-shell-text px-4 py-6">
      <h1 className="flex items-center gap-2 py-2 text-2xl font-extrabold sm:text-3xl">
        <IconMessage size={20} />
        Сообщения
      </h1>
      {error && (
        <p className="py-10 text-center text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {!error && chats === null && (
        <p className="py-10 text-center text-sm text-muted">Загрузка…</p>
      )}
      {chats !== null && chats.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          Чатов пока нет. Откройте профиль пользователя и нажмите «Написать» —
          или отправьте пин кнопкой «Отправить в сообщении».
        </p>
      )}
      {chats !== null && chats.length > 0 && (
        <ul className="flex flex-col gap-1">
          {chats.map((chat) => (
            <ChatRow key={chat.id} chat={chat} />
          ))}
        </ul>
      )}
    </main>
  );
}
