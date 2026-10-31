"use client";

// Опрос счётчика непрочитанного для шапки: у колокольчика уведомлений и у
// конверта сообщений механика одна, разные только эндпоинты.
// Счётчик обновляется раз в 45 секунд и при смене страницы — непрочитанных
// всегда видно ровно столько, сколько их есть, но без отдельного запроса на
// каждый переход.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiChatsUnread } from "@/lib/api/chats";
import { apiNotificationsCount } from "@/lib/api/notifications";
import { useUser } from "@/lib/state/session";

const POLL_MS = 45_000;

// Эндпоинты выбираются по ключу из модульной таблицы, а не приходят
// параметром-функцией: параметр менялся бы по ссылке на каждом рендере и
// перезапускал опрос.
const ENDPOINTS = {
  notifications: apiNotificationsCount,
  chats: apiChatsUnread,
} as const;

export function useUnreadCount(endpoint: keyof typeof ENDPOINTS) {
  const { user, ready, enabled } = useUser();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!ready || !enabled || !user) return;
    let alive = true;
    const load = () => {
      ENDPOINTS[endpoint]()
        .then((n) => {
          if (alive) setUnread(n);
        })
        .catch(() => undefined); // бэкенд мигнул — просто не мигаем
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ready, enabled, user, endpoint, pathname]);

  return { unread, visible: ready && enabled && !!user };
}
