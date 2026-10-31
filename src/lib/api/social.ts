// Соцблок: профили, подписки, комментарии (backend/social.py).

import type { Pin } from "@/lib/pin";
import { isStatus, requestJson } from "@/lib/api/http";
import type { PublicBoard } from "@/lib/api/boards";

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

export type Comment = {
  id: string;
  text: string;
  createdAt: number;
  author: { id: string; name: string; avatarUrl: string | null };
};

/** Профиль по id; null — пользователя нет (404). */
export async function apiPublicUser(
  userId: string,
  signal?: AbortSignal,
): Promise<PublicUser | null> {
  try {
    const data = await requestJson<{ user: PublicUser }>(`/api/users/${userId}`, { signal });
    return data.user;
  } catch (err) {
    if (isStatus(err, 404)) return null;
    throw err;
  }
}

export async function apiUserPins(userId: string, signal?: AbortSignal): Promise<Pin[]> {
  const data = await requestJson<{ pins: Pin[] }>(`/api/users/${userId}/pins`, { signal });
  return data.pins;
}

export async function apiUserBoards(
  userId: string,
  signal?: AbortSignal,
): Promise<PublicBoard[]> {
  const data = await requestJson<{ boards: PublicBoard[] }>(`/api/users/${userId}/boards`, {
    signal,
  });
  return data.boards;
}

export async function apiFollow(userId: string): Promise<void> {
  await requestJson(`/api/users/${userId}/follow`, { method: "POST", body: "{}" });
}

export async function apiUnfollow(userId: string): Promise<void> {
  await requestJson(`/api/users/${userId}/follow`, { method: "DELETE" });
}

export async function apiSubscriptions(
  signal?: AbortSignal,
): Promise<{ pins: Pin[]; boards: PublicBoard[] }> {
  return requestJson<{ pins: Pin[]; boards: PublicBoard[] }>("/api/feed/subscriptions", { signal });
}

export async function apiComments(pinId: string, signal?: AbortSignal): Promise<Comment[]> {
  const data = await requestJson<{ comments: Comment[] }>(`/api/pin/${pinId}/comments`, { signal });
  return data.comments;
}

export async function apiAddComment(pinId: string, text: string): Promise<void> {
  await requestJson(`/api/pin/${pinId}/comments`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function apiDeleteComment(commentId: string): Promise<void> {
  await requestJson(`/api/comments/${commentId}`, { method: "DELETE" });
}
