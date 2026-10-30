"use client";

// REST-клиент аккаунтов (Python-бэкенд backend/app.py через rewrites в
// next.config.ts). Провайдер по умолчанию, когда Supabase env не задан:
// cookie-сессию ставит сервер, здесь только fetch.

import type { Pin } from "@/data/pins";

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: number;
};

export type ApiBoard = {
  id: string;
  title: string;
  createdAt: number;
  isSecret?: boolean;
  // Полное число пинов: pins приходит срезом до BOARD_PREVIEW_PINS
  pinsCount?: number;
  pins: Pin[];
};

export type MeResult =
  | { status: "ok"; user: AccountUser } // сервер жив, сессия есть
  | { status: "anon" } // сервер жив, сессии нет
  | { status: "down" }; // бэкенд не запущен

const unauthorizedListeners = new Set<() => void>();

/** Подписка на «сессия протухла». Возвращает функцию отписки. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/** 401 = сессия недействительна: сайт должен перейти в анонимный режим. */
function reportUnauthorized(res: Response, endpoint: string): void {
  if (res.status === 401 && !endpoint.endsWith("/api/auth/me")) {
    for (const listener of unauthorizedListeners) listener();
  }
}

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!res.ok) {
    // проба /api/auth/me сама разбирается с 401 — её не трогаем
    reportUnauthorized(res, input);
    const err = new Error(`api ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiMe(): Promise<MeResult> {
  try {
    const data = await jsonFetch<{ user: AccountUser }>("/api/auth/me");
    return { status: "ok", user: data.user };
  } catch (err) {
    if ((err as { status?: number }).status === 401) return { status: "anon" };
    return { status: "down" };
  }
}

export async function apiRegister(body: {
  email: string;
  password: string;
  displayName: string;
  consent: boolean;
}): Promise<AccountUser> {
  const data = await jsonFetch<{ user: AccountUser }>("/api/auth/register", {
    method: "POST",
    // ключи совпадают с pydantic-моделью бэкенда (snake_case)
    body: JSON.stringify({
      email: body.email,
      password: body.password,
      display_name: body.displayName,
      consent: body.consent,
    }),
  });
  return data.user;
}

export async function apiLogin(email: string, password: string): Promise<AccountUser> {
  const data = await jsonFetch<{ user: AccountUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function apiLogout(): Promise<void> {
  await jsonFetch("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function apiBoards(): Promise<ApiBoard[]> {
  const data = await jsonFetch<{ boards: ApiBoard[] }>("/api/boards");
  return data.boards;
}

export async function apiCreateBoard(
  title: string,
  opts: { isSecret?: boolean; ifMissing?: boolean } = {},
): Promise<ApiBoard> {
  const data = await jsonFetch<{ board: ApiBoard }>("/api/boards", {
    method: "POST",
    body: JSON.stringify({
      title,
      is_secret: opts.isSecret ?? false,
      // «создать, если ещё нет» — стартовые доски заводятся один раз,
      // иначе двойное монтирование плодит копии с одинаковым названием
      if_missing: opts.ifMissing ?? false,
    }),
  });
  return data.board;
}

export async function apiDeleteBoard(boardId: string): Promise<void> {
  await jsonFetch(`/api/boards/${boardId}`, { method: "DELETE" });
}

export async function apiSavePin(boardId: string, pin: Pin): Promise<void> {
  await jsonFetch(`/api/boards/${boardId}/pins/${encodeURIComponent(pin.id)}`, {
    method: "PUT",
    body: JSON.stringify(pin),
  });
}

export async function apiUnsavePin(boardId: string, pinId: string): Promise<void> {
  await jsonFetch(`/api/boards/${boardId}/pins/${encodeURIComponent(pinId)}`, { method: "DELETE" });
}

export async function apiLikes(): Promise<string[]> {
  const data = await jsonFetch<{ likes: string[] }>("/api/likes");
  return data.likes;
}

export async function apiLike(pinId: string): Promise<void> {
  await jsonFetch(`/api/likes/${encodeURIComponent(pinId)}`, { method: "PUT" });
}

export async function apiUnlike(pinId: string): Promise<void> {
  await jsonFetch(`/api/likes/${encodeURIComponent(pinId)}`, { method: "DELETE" });
}

// --- свои пины (backend/pins.py) ---

export type NewPinForm = {
  file: File;
  title: string;
  description: string;
  category: string;
  tags: string[];
  width: number;
  height: number;
};

export async function apiCreatePin(form: NewPinForm): Promise<Pin> {
  // multipart: без Content-Type — браузер сам ставит boundary
  const fd = new FormData();
  fd.set("file", form.file);
  fd.set("title", form.title);
  fd.set("description", form.description);
  fd.set("category", form.category);
  fd.set("tags", form.tags.join(","));
  fd.set("width", String(form.width));
  fd.set("height", String(form.height));
  const res = await fetch("/api/pins", { method: "POST", body: fd });
  if (!res.ok) {
    reportUnauthorized(res, "/api/pins");
    const err = new Error(`pin ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return ((await res.json()) as { pin: Pin }).pin;
}

export async function apiUpdatePin(
  pinId: string,
  patch: { title?: string; description?: string; category?: string; tags?: string[] },
): Promise<Pin> {
  const data = await jsonFetch<{ pin: Pin }>(`/api/pins/${pinId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.pin;
}

export async function apiDeletePin(pinId: string): Promise<void> {
  await jsonFetch(`/api/pins/${pinId}`, { method: "DELETE" });
}

// --- профиль и аккаунт (фаза 2) ---

export async function apiRenameBoard(boardId: string, title: string): Promise<void> {
  await jsonFetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function apiUpdateDisplayName(displayName: string): Promise<void> {
  await jsonFetch("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function apiUploadAvatar(file: File): Promise<void> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/auth/avatar", { method: "POST", body: fd });
  if (!res.ok) {
    reportUnauthorized(res, "/api/auth/avatar");
    const err = new Error(`avatar ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

export async function apiDeleteAccount(): Promise<void> {
  await jsonFetch("/api/auth/account", { method: "DELETE" });
}

// --- соцблок (фаза 3) ---

export type PublicUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  pinsCount: number;
  boardsCount: number;
  followers: number;
  following: number;
  isFollowing: boolean;
  isSelf: boolean;
  createdAt: number;
};

export type PublicBoard = {
  id: string;
  title: string;
  createdAt: number;
  isSecret: boolean;
  pinsCount?: number;
  pins: Pin[];
  owner?: { id: string; name: string };
};

export type Comment = {
  id: string;
  text: string;
  createdAt: number;
  author: { id: string; name: string; avatarUrl: string | null };
};

export async function apiPublicUser(
  userId: string,
  signal?: AbortSignal,
): Promise<PublicUser | null> {
  try {
    const data = await jsonFetch<{ user: PublicUser }>(`/api/users/${userId}`, { signal });
    return data.user;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export async function apiUserPins(userId: string, signal?: AbortSignal): Promise<Pin[]> {
  const data = await jsonFetch<{ pins: Pin[] }>(`/api/users/${userId}/pins`, { signal });
  return data.pins;
}

export async function apiUserBoards(userId: string, signal?: AbortSignal): Promise<PublicBoard[]> {
  const data = await jsonFetch<{ boards: PublicBoard[] }>(`/api/users/${userId}/boards`, {
    signal,
  });
  return data.boards;
}

export async function apiFollow(userId: string): Promise<void> {
  await jsonFetch(`/api/users/${userId}/follow`, { method: "POST", body: "{}" });
}

export async function apiUnfollow(userId: string): Promise<void> {
  await jsonFetch(`/api/users/${userId}/follow`, { method: "DELETE" });
}

export async function apiBoardPublic(
  boardId: string,
  signal?: AbortSignal,
): Promise<PublicBoard | null> {
  try {
    const data = await jsonFetch<{ board: PublicBoard }>(`/api/boards/${boardId}/public`, {
      signal,
    });
    return data.board;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export async function apiToggleSecret(boardId: string): Promise<boolean> {
  const data = await jsonFetch<{ isSecret: boolean }>(`/api/boards/${boardId}/secret`, {
    method: "PUT",
    body: "{}",
  });
  return data.isSecret;
}

export async function apiSubscriptions(
  signal?: AbortSignal,
): Promise<{ pins: Pin[]; boards: PublicBoard[] }> {
  return jsonFetch<{ pins: Pin[]; boards: PublicBoard[] }>("/api/feed/subscriptions", { signal });
}

export async function apiComments(pinId: string, signal?: AbortSignal): Promise<Comment[]> {
  const data = await jsonFetch<{ comments: Comment[] }>(`/api/pin/${pinId}/comments`, { signal });
  return data.comments;
}

export async function apiAddComment(pinId: string, text: string): Promise<void> {
  await jsonFetch(`/api/pin/${pinId}/comments`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function apiDeleteComment(commentId: string): Promise<void> {
  await jsonFetch(`/api/comments/${commentId}`, { method: "DELETE" });
}

// --- медиатека: личное хранилище картинок ---

export type MediaItem = {
  id: string;
  title: string;
  url: string;
  external: boolean;
  width: number;
  height: number;
  createdAt: number;
};

export async function apiMediaList(): Promise<MediaItem[]> {
  const data = await jsonFetch<{ items: MediaItem[] }>("/api/media");
  return data.items;
}

export async function apiMediaUpload(
  file: File,
  dims: { width: number; height: number },
  title = "",
): Promise<MediaItem> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("title", title);
  fd.set("width", String(dims.width));
  fd.set("height", String(dims.height));
  const res = await fetch("/api/media", { method: "POST", body: fd });
  if (!res.ok) {
    const err = new Error(`media ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return ((await res.json()) as { item: MediaItem }).item;
}

export async function apiMediaFromUrl(
  url: string,
  dims: { width: number; height: number },
  title = "",
): Promise<MediaItem> {
  const data = await jsonFetch<{ item: MediaItem }>("/api/media/url", {
    method: "POST",
    body: JSON.stringify({ url, title, width: dims.width, height: dims.height }),
  });
  return data.item;
}

export async function apiMediaDelete(mediaId: string): Promise<void> {
  await jsonFetch(`/api/media/${mediaId}`, { method: "DELETE" });
}

// --- внешний бесплатный хостинг (ImgBB) ---

export async function apiMediaExternalStatus(): Promise<boolean> {
  const data = await jsonFetch<{ enabled: boolean }>("/api/media/external");
  return data.enabled;
}

export async function apiMediaExternalUpload(file: File): Promise<MediaItem> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/media/external", { method: "POST", body: fd });
  if (!res.ok) {
    const err = new Error(`external ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return ((await res.json()) as { item: MediaItem }).item;
}

export async function apiCreatePinFromUrl(body: {
  sourceUrl: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  width: number;
  height: number;
}): Promise<Pin> {
  // ключи совпадают с pydantic-моделью бэкенда (snake_case)
  const data = await jsonFetch<{ pin: Pin }>("/api/pins/from-url", {
    method: "POST",
    body: JSON.stringify({
      source_url: body.sourceUrl,
      title: body.title,
      description: body.description,
      category: body.category,
      tags: body.tags,
      width: body.width,
      height: body.height,
    }),
  });
  return data.pin;
}

// ── Уведомления ──────────────────────────────────────────────────────────
// Личные события: лайк, сохранение в доску, подписка, комментарий.
// Список и счётчик отдаёт бэкенд строго по своей сессии.

export type NotificationType = "like" | "save" | "follow" | "comment";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  createdAt: number;
  read: boolean;
  actor: { id: string; name: string; avatarUrl: string | null };
  pin: { id: string; title: string | null } | null;
};

export async function apiNotifications(): Promise<{
  items: NotificationItem[];
  unread: number;
}> {
  return jsonFetch("/api/notifications");
}

export async function apiNotificationsCount(): Promise<number> {
  const data = await jsonFetch<{ unread: number }>("/api/notifications/count");
  return data.unread;
}

export async function apiNotificationsReadAll(): Promise<void> {
  await jsonFetch("/api/notifications/read-all", { method: "POST" });
}
