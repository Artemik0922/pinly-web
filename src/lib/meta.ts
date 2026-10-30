// Помощники для <title>/og: серверные generateMetadata не могут ходить в
// клиентский REST-слой (он работает с относительными путями), поэтому
// обращаемся к бэкенду напрямую. Не ответил за секунду — берём общий title.

const BACKEND_URL = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";

import { pinImageUrl, type Pin } from "@/data/pins";
import { absoluteUrl } from "@/lib/site";

// общие поля для metadata-экспорта страниц; imageUrl — превью для ссылок
// в мессенджерах (og:image), без него доска в чате — серая полоска текста.
export type MetadataInput = {
  title: string;
  description: string;
  path: string;
  imageUrl?: string;
};

type BoardPin = Pick<Pin, "id" | "seed" | "width" | "height" | "sourceUrl">;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function boardMeta(id: string): Promise<MetadataInput | null> {
  const data = await getJson<{
    board: { title: string; owner?: { name: string }; pins?: BoardPin[] };
  }>(`/api/boards/${encodeURIComponent(id)}/public`);
  if (!data) return null;
  const first = data.board.pins?.[0];
  return {
    title: data.board.title,
    description: data.board.owner ? `Доска ${data.board.owner.name} в Pinly` : "Доска в Pinly",
    path: `/board/${id}`,
    imageUrl: first ? absoluteUrl(pinImageUrl(first)) : undefined,
  };
}

export async function profileMeta(id: string): Promise<MetadataInput | null> {
  const data = await getJson<{ user: { displayName: string; pinsCount: number } }>(
    `/api/users/${encodeURIComponent(id)}`,
  );
  if (!data) return null;
  return {
    title: data.user.displayName,
    description: `${data.user.pinsCount} пинов и открытые доски автора в Pinly`,
    path: `/profile/${id}`,
  };
}

