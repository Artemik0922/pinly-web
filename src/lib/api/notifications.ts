// Уведомления: личные события (лайк, сохранение, подписка, комментарий).
// Список и счётчик отдаёт бэкенд строго по своей сессии.

import { requestJson } from "@/lib/api/http";

export type NotificationType = "like" | "save" | "follow" | "comment";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  createdAt: number;
  read: boolean;
  actor: { id: string; name: string; avatarUrl: string | null };
  pin: { id: string; title: string | null } | null;
};

export async function apiNotifications(
  signal?: AbortSignal,
): Promise<{ items: NotificationItem[]; unread: number }> {
  return requestJson("/api/notifications", { signal });
}

export async function apiNotificationsCount(signal?: AbortSignal): Promise<number> {
  const data = await requestJson<{ unread: number }>("/api/notifications/count", { signal });
  return data.unread;
}

export async function apiNotificationsReadAll(): Promise<void> {
  await requestJson("/api/notifications/read-all", { method: "POST" });
}
