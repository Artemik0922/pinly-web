// Лайки пинов (backend/accounts.py).

import { requestJson } from "@/lib/api/http";

export async function apiLikes(): Promise<string[]> {
  const data = await requestJson<{ likes: string[] }>("/api/likes");
  return data.likes;
}

export async function apiLike(pinId: string): Promise<void> {
  await requestJson(`/api/likes/${encodeURIComponent(pinId)}`, { method: "PUT" });
}

export async function apiUnlike(pinId: string): Promise<void> {
  await requestJson(`/api/likes/${encodeURIComponent(pinId)}`, { method: "DELETE" });
}
