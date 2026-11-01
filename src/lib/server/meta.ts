// Данные для <title>/og: серверные generateMetadata не могут ходить в
// клиентский REST-слой (он работает с относительными путями), поэтому
// обращаемся к бэкенду напрямую. Не ответил за секунду — берём общий title.

import { cache } from "react";
import { pinImageUrl } from "@/lib/pin";
import { backendJson } from "@/lib/server/backend";
import type { PageMeta } from "@/lib/server/seo";
import type { PublicBoard } from "@/lib/api/boards";
const META_TIMEOUT_MS = 1500;

/**
 * Публичный срез доски — один запрос на рендер. Нужен и метаданным
 * (og:image берётся из первого пина), и самой странице: без него поисковик
 * и мессенджер получали «Загрузка…» вместо работ мастера.
 *
 * Секретную доску бэкенд не отдаёт никому (404), поэтому здесь её просто
 * нет — приватный взгляд владельца собирается на клиенте из своего списка
 * досок, и «чинить» это серверным рендером нельзя.
 */
export const boardCard = cache(async (id: string): Promise<PublicBoard | null> => {
  const data = await backendJson<{ board: PublicBoard }>(
    `/api/boards/${encodeURIComponent(id)}/public`,
    { timeoutMs: META_TIMEOUT_MS },
  );
  return data?.board ?? null;
});

export async function boardMeta(id: string): Promise<PageMeta | null> {
  const board = await boardCard(id);
  if (!board) return null;
  const first = board.pins?.[0];
  return {
    title: board.title,
    description: board.owner ? `Доска ${board.owner.name} в Pinly` : "Доска в Pinly",
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
