"use client";

// Личные уведомления: лайки, сохранения в доску, подписки, комментарии.
// Индивидуальные по построению — список отдаёт бэкенд строго по сессии.
// Открытие страницы помечает всё прочитанным, колокольчик в шапке
// подхватит ноль на ближайшем опросе.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiNotifications,
  apiNotificationsReadAll,
  type NotificationItem,
  type NotificationType,
} from "@/lib/account";
import { useUser } from "@/lib/user";
import { timeAgo } from "@/lib/time";
import { Avatar } from "@/components/Avatar";
import { IconBell, IconComment, IconFolder, IconHeart, IconUserPlus } from "@/components/Icons";

// Текст действия — согласуется с мужским именем автора события по умолчанию,
// как в RU-интерфейсах Pinterest/VK; пол автора серверу неизвестен.
const ACTION: Record<NotificationType, string> = {
  like: "оценил ваш пин",
  save: "сохранил ваш пин",
  follow: "подписался на вас",
  comment: "прокомментировал ваш пин",
};

function TypeIcon({ type }: { type: NotificationType }) {
  const cls = "grid h-9 w-9 shrink-0 place-items-center rounded-full";
  const icon = { size: 16 } as const;
  switch (type) {
    case "like":
      return (
        <span className={`${cls} bg-surface text-danger`}>
          <IconHeart {...icon} />
        </span>
      );
    case "save":
      return (
        <span className={`${cls} bg-surface text-foreground`}>
          <IconFolder {...icon} />
        </span>
      );
    case "follow":
      return (
        <span className={`${cls} bg-surface text-foreground`}>
          <IconUserPlus {...icon} />
        </span>
      );
    case "comment":
      return (
        <span className={`${cls} bg-surface text-foreground`}>
          <IconComment {...icon} />
        </span>
      );
  }
}

function Row({ item }: { item: NotificationItem }) {
  const href = item.pin
    ? `/pin/${item.pin.id}`
    : `/profile/${item.actor.id}`;
  const title = item.pin?.title;
  return (
    <li>
      <Link
        href={href}
        className={`flex items-start gap-3 rounded-2xl p-3 ring-1 ring-border-soft transition-colors hover:bg-surface-hover ${
          item.read ? "bg-background" : "bg-surface"
        }`}
      >
        <TypeIcon type={item.type} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm">
            <span className="shrink-0">
              <Avatar
                name={item.actor.name}
                url={item.actor.avatarUrl}
                size={22}
                textSize="text-[10px]"
              />
            </span>
            <span className="truncate font-semibold">{item.actor.name}</span>
            <span className="truncate text-muted">{ACTION[item.type]}</span>
          </p>
          {title && (
            <p className="mt-0.5 truncate text-sm text-muted">«{title}»</p>
          )}
          <p className="mt-1 text-xs text-muted">{timeAgo(item.createdAt)}</p>
        </div>
        {!item.read && (
          <span
            aria-label="непрочитано"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent-strong"
          />
        )}
      </Link>
    </li>
  );
}

export default function NotificationsPage() {
  const { user, ready, enabled } = useUser();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !enabled || !user) return;
    let alive = true;
    apiNotifications()
      .then(async (data) => {
        if (!alive) return;
        setItems(data.items);
        if (data.unread > 0) await apiNotificationsReadAll().catch(() => undefined);
      })
      .catch(() => {
        if (alive) setError("Не удалось загрузить уведомления");
      });
    return () => {
      alive = false;
    };
  }, [ready, enabled, user]);

  if (!ready || !enabled) return null;

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
        <h1 className="text-xl font-bold">Уведомления</h1>
        <p className="mt-2 text-sm text-muted">
          Войдите в аккаунт, чтобы видеть оценки, сохранения и подписки.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
        >
          Войти
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="flex items-center gap-2 py-2 text-lg font-bold">
        <IconBell size={20} />
        Уведомления
      </h1>
      {error && (
        <p className="py-10 text-center text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {!error && items === null && (
        <p className="py-10 text-center text-sm text-muted">Загрузка…</p>
      )}
      {items !== null && items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          Пока тихо. Публикуйте пины — лайки, сохранения и подписчики появятся здесь.
        </p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}
