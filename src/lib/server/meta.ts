// Данные для <title>/og: серверные generateMetadata не могут ходить в
// клиентский REST-слой (он работает с относительными путями), поэтому
// обращаемся к бэкенду напрямую. Не ответил за секунду — берём общий title.

import { pinImageUrl, type Pin } from "@/lib/pin";
import { backendJson } from "@/lib/server/backend";
import type { PageMeta } from "@/lib/server/seo";
const META_TIMEOUT_MS = 1500;

type BoardPin = Pick<Pin, "id" | "seed" | "width" | "height" | "sourceUrl">;

export async function boardMeta(id: string): Promise<PageMeta | null> {
  const data = await backendJson<{
    board: { title: string; owner?: { name: string }; pins?: BoardPin[] };
  }>(`/api/boards/${encodeURIComponent(id)}/public`, { timeoutMs: META_TIMEOUT_MS });
  if (!data) return null;
  const first = data.board.pins?.[0];
  return {
    title: data.board.title,
    description: data.board.owner ? `Доска ${data.board.owner.name} в Pinly` : "Доска в Pinly",
    path: `/board/${id}`,
    imageUrl: first ? pinImageUrl(first) : undefined,
  };
}

export async function profileMeta(id: string): Promise<PageMeta | null> {
  const data = await backendJson<{ user: { displayName: string; pinsCount: number } }>(
    `/api/users/${encodeURIComponent(id)}`,
    { timeoutMs: META_TIMEOUT_MS },
  );
  if (!data) return null;
  return {
    title: data.user.displayName,
    description: `${data.user.pinsCount} пинов и открытые доски автора в Pinly`,
    path: `/profile/${id}`,
  };
}
