"use client";

// Счётчики непрочитанного в шапке: колокольчик — личные уведомления, конверт
// — личные сообщения. Оба видны только вошедшим и оба сидят на опросе из
// useUnreadCount.

import Link from "next/link";
import { IconBell, IconMessage } from "@/components/ui/Icons";
import { useUnreadCount } from "@/components/layout/useUnreadCount";

// Плашка с числом: свыше 99 показываем «99+», чтобы не растягивать иконку.
function UnreadCount({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-bold leading-5 text-white">
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

export function NotificationBell() {
  const { unread, visible } = useUnreadCount("notifications");
  if (!visible) return null;

  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0 ? `Уведомления: ${unread} непрочитанных` : "Уведомления"
      }
      className="relative grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-surface-hover sm:h-9 sm:w-9"
    >
      <IconBell size={20} />
      <UnreadCount unread={unread} />
    </Link>
  );
}

// Иконка личных сообщений: тот же опрос, что у колокольчика, но считает
// непрочитанные сообщения чатов (см. chats.py и /messages).
export function MessagesLink() {
  const { unread, visible } = useUnreadCount("chats");
  if (!visible) return null;

  return (
    <Link
      href="/messages"
      aria-label={unread > 0 ? `Сообщения: ${unread} непрочитанных` : "Сообщения"}
      className="relative grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-surface-hover sm:h-9 sm:w-9"
    >
      <IconMessage size={20} />
      <UnreadCount unread={unread} />
    </Link>
  );
}
